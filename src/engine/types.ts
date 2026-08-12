/**
 * 机制 B(lxmusic 引擎 / jsenv)类型定义。
 */

/** 音源能力描述(from inited) */
export interface ScriptSources {
  [platform: string]: {
    name: string;
    type: 'music' | 'lyric';
    actions: string[];
    qualitys: string[];
  };
}

/** jsenv 事件监听器(宿主注入到父侧的回调) */
export interface LxEventPayload {
  id?: string | number;
  source?: string;
  action?: string;
  info?: any;
  result?: any;
  error?: any;
}

/** 单个音源运行时 */
export interface SourceRuntime {
  /** 全局唯一 env 名(只含安全字符) */
  envName: string;
  sourceId: string;
  /** 支持的平台(来自 inited) */
  sources: ScriptSources;
  /** 成功率统计 */
  stats: { successCalls: number; totalCalls: number };
}

/** jsenv.executeParallel 调用描述 */
export interface JsenvCall {
  envName: string;
  code: string;
  timeoutMs?: number;
}

/** 竞速结果 */
export interface ParallelResult {
  envName: string;
  ok: boolean;
  data?: any;
  error?: any;
}
