/**
 * RuntimeManager:管理多个 SourceRuntime,维护 平台→runtime[] 反向索引,
 * 取 URL 时对支持该平台的多源用 executeParallel 并行竞速,首个成功者胜出。
 */

import type { SongInfo, MusicUrlResult } from '../types.js';
import { SourceRuntime, makeEnvName } from './runtime.js';
import { buildDispatchCode } from './lx_prelude.js';
import type { ScriptSources } from './types.js';

const songloft: any = (globalThis as any).songloft;

export class RuntimeManager {
  private runtimes: Map<string, SourceRuntime> = new Map();
  /** 平台 → sourceId[] */
  private platformIndex: Map<string, string[]> = new Map();
  /** 成功率记录(用于排序) */
  private successMap: Map<string, { success: number; total: number }> = new Map();

  /** 单源实例初始化并登记 */
  async addSource(
    info: { id: string; name: string; version?: string; description?: string; author?: string; homepage?: string; rawScript?: string }
  ): Promise<SourceRuntime> {
    const existing = this.runtimes.get(info.id);
    if (existing) {
      await existing.destroy();
      this.removeFromIndex(info.id);
    }
    const rt = new SourceRuntime(info);
    const sources = await rt.init();
    this.runtimes.set(info.id, rt);
    this.register(info.id, sources);
    return rt;
  }

  private register(sourceId: string, sources: ScriptSources) {
    for (const platform of Object.keys(sources)) {
      const key = this.normPlatform(platform);
      if (!this.platformIndex.has(key)) this.platformIndex.set(key, []);
      const list = this.platformIndex.get(key)!;
      if (!list.includes(sourceId)) list.push(sourceId);
    }
  }

  private removeFromIndex(sourceId: string) {
    for (const [platform, list] of this.platformIndex.entries()) {
      const idx = list.indexOf(sourceId);
      if (idx >= 0) list.splice(idx, 1);
      if (list.length === 0) this.platformIndex.delete(platform);
    }
  }

  /** 现实平台 id(如 'kw'/'kuwo')归一化到我们的五平台命名 */
  private normPlatform(p: string): string {
    const lower = p.toLowerCase();
    if (lower === 'kuwo' || lower === 'kw') return 'kw';
    if (lower === 'kugou' || lower === 'kg') return 'kg';
    if (lower === 'tencent' || lower === 'qq' || lower === 'tx') return 'tx';
    if (lower === 'netease' || lower === 'wy' || lower === '163') return 'wy';
    if (lower === 'migu' || lower === 'mg') return 'mg';
    return lower;
  }

  /** 某平台是否有已加载音源 */
  hasPlatform(platform: string): boolean {
    return (this.platformIndex.get(this.normPlatform(platform))?.length ?? 0) > 0;
  }

  /** 支持的平台集合(已加载音源) */
  supportedPlatforms(): string[] {
    const out: string[] = [];
    for (const [p, list] of this.platformIndex.entries()) {
      if (list.length > 0) out.push(p);
    }
    return out;
  }

  getSourceIds(): string[] {
    return Array.from(this.runtimes.keys());
  }

  async destroySource(sourceId: string): Promise<void> {
    const rt = this.runtimes.get(sourceId);
    if (rt) {
      await rt.destroy();
      this.runtimes.delete(sourceId);
      this.removeFromIndex(sourceId);
    }
  }

  async destroyAll(): Promise<void> {
    const ids = Array.from(this.runtimes.keys());
    for (const id of ids) await this.destroySource(id);
  }

  /**
   * 解析音乐 URL。对支持该平台的多源并行竞速(executeParallel, 3 并发),
   * 按成功率排序,首个成功者胜出。
   */
  async getMusicUrl(songInfo: SongInfo, quality: string): Promise<MusicUrlResult> {
    const platform = this.normPlatform(songInfo.source ?? '');
    const sourceIds = this.platformIndex.get(platform) ?? [];
    if (sourceIds.length === 0) {
      throw new Error(`no source supports platform "${platform}"`);
    }
    // 按成功率降序排(level 2 的成功率)
    const sorted = sourceIds
      .map((id) => {
        const st = this.successMap.get(id) ?? { success: 0, total: 0 };
        return { id, rate: st.total ? st.success / st.total : 0 };
      })
      .sort((a, b) => b.rate - a.rate)
      .map((s) => s.id);

    if (sorted.length === 1) {
      const rt = this.runtimes.get(sorted[0])!;
      try {
        return await rt.getMusicUrl(songInfo, quality);
      } catch (e: any) {
        this.record(sorted[0], false);
        throw e;
      }
    }

    // 并行竞速
    const calls = sorted.map((sourceId) => {
      const rt = this.runtimes.get(sourceId)!;
      const reqId = `${rt.envName}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const dispatchJson = JSON.stringify({
        source: platform,
        action: 'musicUrl',
        info: { musicInfo: songInfo, type: quality },
      });
      rt.stats.totalCalls++;
      return {
        envName: rt.envName,
        code: buildDispatchCode(reqId, 'request', dispatchJson),
        timeoutMs: 20000,
      };
    });

    const results: any[] = await songloft.jsenv.executeParallel(calls, 3);
    // 匹配结果到 envName
    const byEnv: Record<string, any> = {};
    for (const r of results) {
      const env = r?.envName ?? makeEnvName(r?.source);
      byEnv[env] = r;
    }
    for (const sourceId of sorted) {
      const rt = this.runtimes.get(sourceId)!;
      const r = byEnv[rt.envName];
      if (!r) continue;
      if (r.ok) {
        const result = r.data?.result ?? r.data;
        const url = typeof result === 'string' ? result : (result?.url ?? result?.playUrl);
        if (url) {
          this.record(sourceId, true);
          return {
            url: String(url),
            headers: result?.headers ?? {},
            source: sourceId,
            quality,
          };
        }
        this.record(sourceId, false);
      } else {
        this.record(sourceId, false);
      }
    }
    throw new Error('all sources failed to resolve url');
  }

  private record(sourceId: string, ok: boolean) {
    const st = this.successMap.get(sourceId) ?? { success: 0, total: 0 };
    if (ok) st.success++;
    this.successMap.set(sourceId, st);
  }

  getStats(): Record<string, { success: number; total: number }> {
    const out: Record<string, { success: number; total: number }> = {};
    for (const [id, st] of this.successMap.entries()) out[id] = { ...st };
    return out;
  }
}
