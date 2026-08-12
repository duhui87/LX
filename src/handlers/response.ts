/**
 * 统一响应封装(内部 UI 用):{code:0,msg:'success',data} / 带 warning / 错误 {code,msg,data:null}。
 * 注意:主程序契约端点(/api/search、/api/music/url)走 SDK 工厂,返回裸 {results}/{url},不经过这里。
 */

import type { HTTPResponse } from '@songloft/plugin-sdk';

export function ok(data: any, warning?: string): { code: number; msg: string; data: any; warning?: string } {
  const out: any = { code: 0, msg: 'success', data };
  if (warning) out.warning = warning;
  return out;
}

export function fail(statusCode: number, msg: string): { code: number; msg: string; data: null } {
  return { code: statusCode, msg, data: null };
}
