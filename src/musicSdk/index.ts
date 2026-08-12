/**
 * 共享工具函数(照 lxserver modules/utils/index.js 移植,按需裁剪 + 沙箱适配)。
 */

/** 字节 → 可读大小字符串 */
export function sizeFormate(sizeStr?: string | number): string {
  const size = parseInt(String(sizeStr ?? '0'), 10);
  if (isNaN(size) || size <= 0) return '0MB';
  let sizeNum = size;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIdx = 0;
  while (sizeNum >= 1024 && unitIdx < units.length - 1) {
    sizeNum /= 1024;
    unitIdx++;
  }
  return `${sizeNum.toFixed(2)}${units[unitIdx]}`;
}

/** 通用 URL 解码,name 字段往往被编码过 */
export function decodeName(name?: string, ...args: any[]): string {
  try {
    return decodeURIComponent(name ?? '') + args.join('');
  } catch {
    return String(name ?? '') + args.join('');
  }
}

/** 秒 → mm:ss 播放时长 */
export function formatPlayTime(second: string | number): string {
  const sec = Math.floor(Number(second) || 0);
  if (sec <= 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 时间戳/日期 → YYYY-MM-DD */
export function dateFormat(time: number | string | Date | undefined, fmt = 'YYYY-MM-DD'): string {
  const d = time instanceof Date ? time : new Date(Number(time) || Date.now());
  const pad = (n: number) => String(n).padStart(2, '0');
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  };
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (k) => map[k]);
}

/** 播放量格式化(万/亿) */
export function formatPlayCount(count: string | number): string {
  const num = Number(count) || 0;
  if (num < 10000) return String(num);
  if (num < 100000000) {
    return `${(num / 10000).toFixed(1)}万`;
  }
  return `${(num / 100000000).toFixed(1)}亿`;
}

/** 简单的类 lodash get */
export function get(obj: any, path: string, def?: any): any {
  const keys = Array.isArray(path) ? path : path.split('.');
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return def;
    cur = cur[k];
  }
  return cur === undefined ? def : cur;
}

/** 简单深合并(用于合并默认 headers 等) */
export function assign(target: Record<string, any>, ...sources: any[]): Record<string, any> {
  for (const src of sources) {
    if (src == null) continue;
    for (const k of Object.keys(src)) {
      target[k] = src[k];
    }
  }
  return target;
}

/** 标准化歌曲名字符串(数组歌手 → 字符串) */
export function singerName(singer?: string | Array<any> | string): string {
  if (Array.isArray(singer)) {
    return singer.map((s) => (typeof s === 'string' ? s : s?.name ?? '')).filter(Boolean).join('/');
  }
  return String(singer ?? '');
}

/** 去除字符串 HTML 实体 */
export function decodeHtml(str?: string): string {
  const text = String(str ?? '');
  const map: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  };
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => map[m] ?? m);
}

/** 首字母大写容错:补齐缺失的 fallback 字段 */
export function normalizeSongInfo(song: any): any {
  if (!song) return song;
  const s = { ...song };
  // musicId 与 songmid 互为 fallback
  if (!s.musicId && s.songmid) s.musicId = s.songmid;
  if (!s.songmid && s.musicId) s.songmid = s.musicId;
  return s;
}
