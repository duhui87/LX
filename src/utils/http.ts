/**
 * 调用宿主 HTTP API 的辅助封装(callHostAPI)。
 * 所有 songloft.* 接口返回 Promise,必须 await;fetch 用宿主 fetch。
 */

const songloft: any = (globalThis as any).songloft;

export class HostApiError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

interface CallOptions {
  method?: string;
  query?: Record<string, any>;
  body?: any;
  headers?: Record<string, string>;
}

/** 计算到宿主的挂载路径 */
export async function callHostAPI(path: string, options: CallOptions = {}): Promise<any> {
  const hostUrl = await songloft.plugin.getHostUrl();
  const token = await songloft.plugin.getToken();
  let url = hostUrl + path;
  if (options.query) {
    const qs = Object.keys(options.query)
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(options.query[k]))}`)
      .join('&');
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(options.headers ?? {}),
  };
  let body: any;
  if (options.body != null) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body,
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    throw new HostApiError(res.status, `host api ${res.status}: ${text.slice(0, 300)}`);
  }
  return parsed;
}
