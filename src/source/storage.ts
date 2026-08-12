/**
 * 音源持久化:通过 songloft.storage 存取 KV。
 *  - source_index:所有音源的元数据索引数组
 *  - source_script_<id>:单个音源的脚本源码
 *  - source_batch:ZIP 批量导入的后台状态
 */

import type { SourceRecord } from '../types.js';
import { STORAGE_KEYS } from '../types.js';

const songloft: any = (globalThis as any).songloft;

export class SourceStorage {
  async getIndex(): Promise<SourceRecord[]> {
    try {
      const raw = await songloft.storage.get(STORAGE_KEYS.sourceIndex);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      songloft.log && songloft.log.warn(`storage.get index failed: ${(e as any)?.message}`);
      return [];
    }
  }

  async setIndex(list: SourceRecord[]): Promise<void> {
    await songloft.storage.set(STORAGE_KEYS.sourceIndex, JSON.stringify(list));
  }

  async getScript(id: string): Promise<string> {
    try {
      const raw = await songloft.storage.get(STORAGE_KEYS.sourceScriptPrefix + id);
      return raw ?? '';
    } catch (e) {
      songloft.log && songloft.log.warn(`storage.get script ${id} failed: ${(e as any)?.message}`);
      return '';
    }
  }

  async setScript(id: string, script: string): Promise<void> {
    await songloft.storage.set(STORAGE_KEYS.sourceScriptPrefix + id, script);
  }

  async deleteScript(id: string): Promise<void> {
    try {
      await songloft.storage.delete(STORAGE_KEYS.sourceScriptPrefix + id);
    } catch (e) {
      songloft.log && songloft.log.warn(`storage.delete script ${id} failed: ${(e as any)?.message}`);
    }
  }

  /** 批量导入后台状态(便于前端轮询) */
  async getBatchState(): Promise<any> {
    try {
      const raw = await songloft.storage.get('source_batch');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async setBatchState(state: any): Promise<void> {
    await songloft.storage.set('source_batch', JSON.stringify(state));
  }

  async clearBatchState(): Promise<void> {
    try {
      await songloft.storage.delete('source_batch');
    } catch {
      /* ignore */
    }
  }
}
