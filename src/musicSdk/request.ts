/**
 * HTTP 适配层:把 lxserver 的 needle 调用重写为宿主 fetch,保持同样的签名。
 *
 * lxserver 用法:
 *   const { promise, cancelHttp } = httpFetch(url, options)
 *   promise.then(({ body }) => ...)   // body 已 JSON.parse
 *
 * 我们保持 httpFetch(url, options) => { promise, cancelHttp } 完全一致,
 * 内部用 fetch 实现(沙箱真异步)。
 */

export interface HttpFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  /** 字符串或对象:对象自动 JSON.stringify */
  body?: any;
  /** 对象表单,urlencode */
  form?: Record<string, any>;
  /** multipart/form-data */
  formData?: Array<{ name: string; value: any; file?: { filename?: string; contentType?: string; data: Uint8Array } }> | Record<string, any>;
  timeout?: number;
  responseType?: 'json' | 'text' | 'arraybuffer';
  gzip?: boolean;
}

export interface HttpFetchResult {
  statusCode: number;
  statusMessage?: string;
  headers: Record<string, string>;
  body: any;
  response: any;
}

export interface HttpFetchReturn {
  promise: Promise<HttpFetchResult>;
  cancelHttp: () => void;
}

/** 默认请求头(照 lxserver options.js) */
const defaultHeaders: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Cache-Control': 'no-cache',
};

function buildFormBody(data: Record<string, any>): string {
  return Object.keys(data)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(data[k] ?? ''))}`)
    .join('&');
}

function buildFormData(
  data:
    | Array<{ name: string; value: any; file?: { filename?: string; contentType?: string; data: Uint8Array } }>
    | Record<string, any>
): { body: Uint8Array; contentType: string } {
  const boundary = `----songloft${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  const chunks: Uint8Array[] = [];
  const pushStr = (s: string) => {
    const bytes = new TextEncoder().encode(s);
    chunks.push(bytes);
  };
  const items: Array<{ name: string; value?: any; file?: { filename?: string; contentType?: string; data: Uint8Array } }> = Array.isArray(data)
    ? data
    : Object.keys(data).map((k) => ({ name: k, value: data[k] }));
  for (const it of items) {
    pushStr(`--${boundary}\r\n`);
    if (it.file) {
      pushStr(
        `Content-Disposition: form-data; name="${it.name}"; filename="${it.file.filename ?? 'file.js'}"\r\n` +
          `Content-Type: ${it.file.contentType ?? 'application/octet-stream'}\r\n\r\n`
      );
      chunks.push(it.file.data);
      pushStr('\r\n');
    } else {
      pushStr(`Content-Disposition: form-data; name="${it.name}"\r\n\r\n`);
      pushStr(String(it.value ?? '') + '\r\n');
    }
  }
  pushStr(`--${boundary}--\r\n`);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return { body: out, contentType: `multipart/form-data; boundary=${boundary}` };
}

function parseBody(buffer: Uint8Array, responseType?: string): any {
  const text = new TextDecoder('utf-8').decode(buffer);
  if (responseType === 'text' || responseType === 'arraybuffer') {
    return responseType === 'arraybuffer' ? buffer : text;
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

export function httpFetch(url: string, options: HttpFetchOptions = {}): HttpFetchReturn {
  const controller = new AbortController();
  const timeoutMs = options.timeout ?? 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const promise = (async (): Promise<HttpFetchResult> => {
    const headers: Record<string, string> = { ...defaultHeaders, ...(options.headers ?? {}) };
    let body: Uint8Array | string | undefined;

    if (options.form) {
      body = buildFormBody(options.form);
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (options.formData) {
      const fd = buildFormData(options.formData);
      body = fd.body;
      headers['Content-Type'] = fd.contentType;
    } else if (options.body != null) {
      if (typeof options.body === 'string') {
        body = options.body;
      } else if (options.body instanceof Uint8Array || options.body instanceof ArrayBuffer) {
        body = options.body;
      } else {
        body = JSON.stringify(options.body);
        headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      }
    }

    // 去掉不可 fetch 的 Content-Length 冲突(交给 fetch 自己算)
    delete headers['content-length'];
    delete headers['Content-Length'];

    try {
      const res = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body,
        signal: controller.signal,
      });
      const buf = new Uint8Array(await res.arrayBuffer());
      const parsed = parseBody(buf, options.responseType);
      return {
        statusCode: res.status,
        statusMessage: res.statusText,
        headers: normalizeHeaders(res.headers),
        body: parsed,
        response: res,
      };
    } catch (err: any) {
      throw err;
    } finally {
      clearTimeout(timer);
    }
  })();

  return {
    promise,
    cancelHttp: () => controller.abort(),
  };
}
