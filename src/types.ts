/**
 * 内部共享类型定义。
 * 注意:主程序契约端点(/api/search、/api/music/url)的对外形态由 @songloft/plugin-sdk
 * (SearchResultItem / MusicUrlFallbackHint / FallbackMatch) 定义;此处为本插件内部自用类型。
 */

/** 平台 id */
export type PlatformId = 'kw' | 'kg' | 'tx' | 'wy' | 'mg';

/** 音源元数据(JSDoc 解析结果) */
export interface SourceInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  path?: string;
  filename?: string;
  rawScript?: string;
  /** 从脚本头 JSDoc 提取到的作者信息可能带 updateTime 等,保留原始信息 */
  extra?: Record<string, string>;
}

/** 一个音源在磁盘/存储中的持久化形态 */
export interface SourceRecord extends SourceInfo {
  enabled: boolean;
  addedAt: number;
  /** 初始化后归档的 sources 描述 */
  sources?: Record<string, SourceCapability>;
  /** 当前状态(batch 加载期间为 false,加载成功后才为 true) */
  ready: boolean;
  error?: string;
}

/** 音源能力描述(来自 inited 事件) */
export interface SourceCapability {
  name: string;
  type: 'music' | 'lyric';
  actions: string[];
  qualitys: string[];
}

/** 平台 → 支持该平台的音源 id 列表(由 RuntimeManager 维护) */
export type PlatformSourceIndex = Record<string, string[]>;

/** 归一化后的歌曲信息(小写驼峰,供机制 B 解析 URL 用) */
export interface SongInfo {
  source?: string;
  songmid?: string;
  musicId?: string;
  hash?: string;
  copyrightId?: string;
  strMediaMid?: string;
  albumMid?: string;
  name?: string;
  singer?: string | Array<{ name?: string; id?: string }> | string[];
  album?: string;
  duration?: number;
  [k: string]: any;
}

/** 机制 B 解析音乐 URL 的结果 */
export interface MusicUrlResult {
  url: string;
  headers?: Record<string, string>;
  source?: string;
  quality?: string;
}

/** 存储键 */
export const STORAGE_KEYS = {
  sourceIndex: 'source_index',
  sourceScriptPrefix: 'source_script_',
} as const;

/** Songloft 宿主唱歌单相关片段(由宿主注入) */
export interface PlaylistTrack {
  songmid?: string;
  musicId?: string;
  hash?: string;
  copyrightId?: string;
  strMediaMid?: string;
  albumMid?: string;
  name?: string;
  singer?: string;
  album?: string;
  duration?: number;
  [k: string]: any;
}

/** 从音源脚本发出的 event(投递)描述 */
export interface LxEvent {
  name: string;
  data: any;
}
