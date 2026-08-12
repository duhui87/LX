/**
 * SourceRuntime:单个音源实例,在独立子 VM 中运行(机制 B)。
 */

import type { SongInfo, MusicUrlResult, SourceInfo } from '../types.js';
import type { ScriptSources, SourceRuntime as RuntimeShape } from './types.js';
import { LX_PRELUDE, buildInitCode, buildDispatchCode } from './lx_prelude.js';

const songloft: any = (globalThis as any).songloft;

/** 生成只含安全字符的 env 名(id 中的非 ASCII 转 hex) */
export function makeEnvName(sourceId: string): string {
  const sanitized = String(sourceId || 'src')
    .replace(/[^A-Za-z0-9._-]/g, (ch) => {
      const hex = ('0' + ch.charCodeAt(0).toString(16)).slice(-4);
      return `_${hex}_`;
    })
    .replace(/[::/\\]/g, '_');
  return `lx_${sanitized}`;
}

export class SourceRuntime implements RuntimeShape {
  envName: string;
  sourceId: string;
  sources: ScriptSources = {};
  stats = { successCalls: 0, totalCalls: 0 };
  private info: SourceInfo;
  private destroyed = false;

  constructor(info: SourceInfo) {
    this.info = info;
    this.sourceId = info.id;
    this.envName = makeEnvName(info.id);
  }

  /** 创建子 VM(注入 prelude),等待 inited */
  async init(): Promise<ScriptSources> {
    const jsenv = songloft.jsenv;
    if (!jsenv || typeof jsenv.create !== 'function') {
      throw new Error('songloft.jsenv unavailable');
    }
    try {
      await jsenv.create(this.envName, LX_PRELUDE);
    } catch (e: any) {
      throw new Error(`jsenv.create failed: ${e?.message ?? e}`);
    }

    const initCode = buildInitCode(this.info.rawScript ?? '', {
      name: this.info.name,
      version: this.info.version,
      description: this.info.description,
      author: this.info.author,
      homepage: this.info.homepage,
      rawScript: this.info.rawScript ?? '',
      id: this.info.id,
    });

    // 注入元数据 + 运行脚本,等 inited
    const result: any = await this.waitEvent(['inited'], initCode, 30000);
    const sources = result?.data?.sources ?? (globalThis as any).__lx_script_sources ?? null;
    if (!sources || typeof sources !== 'object' || Object.keys(sources).length === 0) {
      throw new Error('source did not report any sources (inited missing/empty)');
    }
    this.sources = sources;
    return sources;
  }

  /** 在 VM 中执行一段代码并等待事件(带超时) */
  private async waitEvent(
    events: string[],
    code: string,
    timeoutMs: number
  ): Promise<{ name: string; data: any }> {
    const jsenv = songloft.jsenv;
    const res = await jsenv.executeWait(this.envName, code, timeoutMs, events);
    // 返回结构:主宿主约定 executeWait 返回首个等待事件
    if (res && typeof res === 'object' && 'name' in res) {
      return { name: String((res as any).name), data: (res as any).data };
    }
    throw new Error('executeWait returned unexpected shape');
  }

  /** 解析音乐 URL(单一源) */
  async getMusicUrl(songInfo: SongInfo, quality: string): Promise<MusicUrlResult> {
    if (this.destroyed) throw new Error('runtime destroyed');
    this.stats.totalCalls++;
    const source = songInfo.source ?? '';
    const reqId = `${this.envName}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const dispatchJson = JSON.stringify({
      source,
      action: 'musicUrl',
      info: { musicInfo: songInfo, type: quality },
    });
    const code = buildDispatchCode(reqId, 'request', dispatchJson);
    try {
      const res: any = await this.waitEvent(['dispatchResult', 'dispatchError'], code, 20000);
      if (res.name === 'dispatchResult') {
        const result = res.data?.result ?? res.data;
        const url = typeof result === 'string' ? result : (result?.url ?? result?.playUrl);
        if (!url) throw new Error('no url returned');
        this.stats.successCalls++;
        return {
          url: String(url),
          headers: result?.headers ?? {},
          source: this.envName,
          quality,
        };
      }
      throw new Error(`dispatch error: ${JSON.stringify(res.data?.error ?? res.error ?? '')}`);
    } catch (e: any) {
      throw e;
    }
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      const jsenv = songloft.jsenv;
      if (jsenv && typeof jsenv.destroy === 'function') {
        await jsenv.destroy(this.envName);
      }
    } catch (e: any) {
      songloft.log && songloft.log.warn(`destroy ${this.envName} failed: ${e?.message}`);
    }
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }
}
