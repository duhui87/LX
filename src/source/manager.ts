/**
 * SourceManager:音源导入/删除/启用禁用/持久化,并协调 RuntimeManager 的加载。
 * 构造器只建空状态,必须 await init() 异步加载。
 */

import type { SourceRecord, SourceInfo } from '../types.js';
import { SourceStorage } from './storage.js';
import { parseSourceInfo, slugify } from './parser.js';
import type { RuntimeManager } from '../engine/manager.js';
import { extractScriptsFromZip, parseZip } from '../utils/zip.js';

const songloft: any = (globalThis as any).songloft;

export interface BatchState {
  loading: boolean;
  total: number;
  done: number;
  current?: string;
  pending: string[];
  errors: string[];
}

export class SourceManager {
  private storage = new SourceStorage();
  private runtimes: RuntimeManager;
  private records: SourceRecord[] = [];
  private batch: BatchState = { loading: false, total: 0, done: 0, pending: [], errors: [] };

  constructor(runtimes: RuntimeManager) {
    this.runtimes = runtimes;
  }

  /** 异步加载持久化状态,并装载已启用的音源 */
  async init(): Promise<void> {
    let records: SourceRecord[] = [];
    try {
      records = await this.storage.getIndex();
    } catch (e) {
      songloft.log && songloft.log.warn(`SourceManager.init load index failed: ${(e as any)?.message}`);
    }
    this.records = records;

    // 逐个装载已启用音源(尽量并行受限)
    const enabled = records.filter((r) => r.enabled);
    for (const r of enabled) {
      try {
        const script = await this.storage.getScript(r.id);
        if (!script) continue;
        const info = { ...r, rawScript: script } as SourceInfo;
        const rt = await this.runtimes.addSource(info);
        r.sources = rt.sources;
        r.ready = true;
        r.error = undefined;
      } catch (e: any) {
        r.ready = false;
        r.error = String(e?.message ?? e);
        songloft.log &&
          songloft.log.error(`load source ${r.id} failed: ${r.error}`);
      }
    }
    await this.persist();
  }

  getRecords(): SourceRecord[] {
    return this.records.map((r) => ({
      ...r,
      rawScript: undefined,
    }));
  }

  getBatchState(): BatchState {
    return { ...this.batch };
  }

  private async persist(): Promise<void> {
    const stripped = this.records.map((r) => {
      const { rawScript, ...rest } = r as any;
      return rest;
    });
    await this.storage.setIndex(stripped);
  }

  /** 唯一 id(重名加 _2/_3 ...) */
  private uniqueId(base: string): string {
    const existing = new Set(this.records.map((r) => r.id));
    if (!existing.has(base)) return base;
    let i = 2;
    while (existing.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  }

  /** 解析单脚本元数据并分配 id */
  private prepareInfo(script: string, filename?: string): SourceRecord {
    const meta = parseSourceInfo(script, filename);
    const existing = this.records.find((r) => r.name === meta.name);
    meta.id = existing ? this.uniqueId(existing.id) : this.uniqueId(slugify(meta.name));
    return {
      ...meta,
      enabled: false,
      addedAt: Date.now(),
      ready: false,
    } as SourceRecord;
  }

  /**
   * 导入单个脚本(返回记录,异步加载)。
   * 若与现有重名(同名)则先删旧,再导入。
   */
  async importScript(script: string, filename?: string): Promise<SourceRecord> {
    // 同名先删旧
    const meta0 = parseSourceInfo(script, filename);
    const dup = this.records.find((r) => r.name === meta0.name);
    if (dup) {
      await this.remove(dup.id);
    }
    const record = this.prepareInfo(script, filename);
    this.records.push(record);
    await this.storage.setScript(record.id, script);
    await this.persist();

    // 后台加载
    this.loadInBackground(record.id);
    return this.getRecord(record.id)!;
  }

  /** 批量导入 ZIP 提取的脚本(后台逐个加载) */
  async importZip(zipLatin1: string): Promise<{ imported: number; records: SourceRecord[] }> {
    const scripts = extractScriptsFromZip(parseZipRaw(zipLatin1));
    const imported: SourceRecord[] = [];
    for (const { name, script } of scripts) {
      const meta0 = parseSourceInfo(script, name);
      const dup = this.records.find((r) => r.name === meta0.name);
      if (dup) {
        await this.remove(dup.id);
      }
      const record = this.prepareInfo(script, name);
      // 立即持久化,enabled=false
      this.records.push(record);
      await this.storage.setScript(record.id, script);
      imported.push(record);
    }
    await this.persist();

    // 启动后台批量加载
    this.startBatch(imported.map((r) => r.id));
    return { imported: imported.length, records: imported.map((r) => this.getRecord(r.id)!) };
  }

  /** 单个音源后台加载(内部),成功后启用 */
  async loadSource(id: string): Promise<void> {
    const rec = this.records.find((r) => r.id === id);
    if (!rec) return;
    try {
      const script = await this.storage.getScript(id);
      if (!script) throw new Error('script not found');
      const info = { ...rec, rawScript: script } as SourceInfo;
      // 若已被其它加载占用先销毁
      await this.runtimes.destroySource(id);
      const rt = await this.runtimes.addSource(info);
      rec.sources = rt.sources;
      rec.ready = true;
      rec.enabled = true;
      rec.error = undefined;
    } catch (e: any) {
      rec.ready = false;
      rec.error = String(e?.message ?? e);
      songloft.log && songloft.log.error(`loadSource ${id} error: ${rec.error}`);
    }
    await this.persist();
  }

  /** 后台加载单个(异步,不阻塞调用方) */
  private loadInBackground(id: string): void {
    setTimeout(() => {
      this.loadSource(id).catch(() => {});
    }, 0);
  }

  /** ZIP 批量后台加载(setTimeout 链,约 1000ms 间隔让出 env 锁) */
  private async startBatch(ids: string[]): Promise<void> {
    if (this.batch.loading) {
      this.batch.pending.push(...ids);
      await this.storage.setBatchState(this.batch);
      return;
    }
    this.batch.loading = true;
    this.batch.total = ids.length;
    this.batch.done = 0;
    this.batch.pending = [];
    this.batch.errors = [];
    await this.storage.setBatchState(this.batch);

    const queue = [...ids];
    while (queue.length) {
      const id = queue.shift()!;
      this.batch.current = id;
      await this.loadSource(id);
      this.batch.done++;
      const rec = this.getRecord(id);
      if (rec && rec.error) this.batch.errors.push(`${id}: ${rec.error}`);
      await this.storage.setBatchState(this.batch);
      if (queue.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    this.batch.loading = false;
    this.batch.current = undefined;
    await this.storage.setBatchState(this.batch);
    setTimeout(() => {
      this.storage.clearBatchState().catch(() => {});
    }, 1000);
  }

  /** 启用/禁用 */
  async toggle(id: string): Promise<SourceRecord> {
    const rec = this.records.find((r) => r.id === id);
    if (!rec) throw new Error(`source not found: ${id}`);
    if (rec.enabled) {
      rec.enabled = false;
      rec.ready = false;
      await this.runtimes.destroySource(id);
    } else {
      rec.enabled = true;
      await this.loadSource(id);
    }
    await this.persist();
    return this.getRecord(id)!;
  }

  /** 删除音源 */
  async remove(id: string): Promise<boolean> {
    const idx = this.records.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    this.records.splice(idx, 1);
    await this.storage.deleteScript(id);
    await this.runtimes.destroySource(id);
    await this.persist();
    return true;
  }

  getRecord(id: string): SourceRecord | undefined {
    const r = this.records.find((x) => x.id === id);
    return r ? { ...r, rawScript: undefined } : undefined;
  }
}

/** 解析 ZIP(latin1 字符串),返回条目数组 */
function parseZipRaw(body: string): any {
  return parseZip(body);
}
