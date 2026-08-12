/**
 * 音源管理 handler。
 *  GET /api/sources
 *  POST /api/sources/import(multipart,.js 和 .zip)
 *  POST /api/sources/import-url
 *  DELETE /api/sources?id=
 *  PUT /api/sources/toggle
 */

import { ok, fail } from './response.js';
import { httpFetch } from '../musicSdk/request.js';

type StartupContext = {
  getSourceManager: () => any;
};

/** Uint8Array → latin1 字符串(按字节) */
function u8ToLatin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

/** 解析 multipart/form-data 的 RFC2047 字段名 */
function parseDisposition(line: string): { name?: string; filename?: string } {
  const out: any = {};
  const nameM = line.match(/name="([^"]*)"/);
  if (nameM) out.name = nameM[1];
  const fnM = line.match(/filename="([^"]*)"/);
  if (fnM) out.filename = fnM[1];
  return out;
}

/** 从 latin1 multipart body 提取指定 name 的文件字段 */
function extractMultipartFile(
  bodyLatin1: string,
  boundary: string | null
): { filename?: string; data: string } | null {
  if (!boundary) return null;
  const b = `--${boundary}`;
  let idx = bodyLatin1.indexOf(b);
  while (idx >= 0) {
    const partStart = bodyLatin1.indexOf('\r\n\r\n', idx);
    if (partStart < 0) break;
    const headerBlock = bodyLatin1.slice(idx + b.length, partStart);
    if (headerBlock.startsWith('--')) break;
    const disp = parseDisposition(headerBlock);
    if (disp.name === 'file') {
      let contentStart = partStart + 4;
      const contentEnd = bodyLatin1.indexOf(`\r\n--${boundary}`, contentStart);
      const endIdx = contentEnd >= 0 ? contentEnd : bodyLatin1.length;
      return {
        filename: disp.filename,
        data: bodyLatin1.slice(contentStart, endIdx),
      };
    }
    idx = bodyLatin1.indexOf(b, partStart + 4);
  }
  return null;
}

/** 从当前文件类型判断 .js / .zip */
function isZipFilename(name: string | undefined): boolean {
  return !!name && name.toLowerCase().endsWith('.zip');
}

export function makeSourceRoutes(ctx: StartupContext): any {
  const srcMgr = () => ctx.getSourceManager();

  return {
    /** GET /api/sources */
    async list(): Promise<any> {
      const mgr = srcMgr();
      const sources = mgr.getRecords().map((r: any) => ({
        ...r,
        loading: mgr.getBatchState().loading,
      }));
      return ok({
        sources,
        batch: mgr.getBatchState(),
      });
    },

    /** POST /api/sources/import */
    async import(req: any): Promise<any> {
      const mgr = srcMgr();
      const contentType = req?.headers?.['content-type'] ?? req?.headers?.['Content-Type'] ?? '';
      const boundaryM = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
      const boundary = boundaryM ? (boundaryM[1] || boundaryM[2]).trim() : null;

      const body: Uint8Array = req?.body ?? new Uint8Array(0);
      const bodyLatin1 = body instanceof Uint8Array ? u8ToLatin1(body) : String(body ?? '');

      const file = extractMultipartFile(bodyLatin1, boundary);
      if (!file || !file.data) return fail(400, 'file field required');

      const filename = file.filename || 'source.js';
      let record;
      if (isZipFilename(filename)) {
        const zipLatin1 = file.data; // zip body 保持 latin1
        const result = await mgr.importZip(zipLatin1);
        return ok({ imported: result.imported, records: result.records });
      }

      // .js 脚本:内容可能是中英混合,需要 latin1→utf8
      const script = latin1ToUtf8(file.data);
      record = await mgr.importScript(script, filename);
      return ok({ imported: 1, records: [record] });
    },

    /** POST /api/sources/import-url */
    async importUrl(body: any): Promise<any> {
      const mgr = srcMgr();
      const url = body?.url;
      if (!url) return fail(400, 'url required');
      try {
        const { body: script } = await httpFetch(String(url), {
          method: 'GET',
          timeout: 15000,
        }).promise;
        const text = typeof script === 'string' ? script : JSON.stringify(script);
        // 网络取回的内容按 utf8 解码
        const filename = String(url).split('/').pop()?.split('?')[0] || 'source.js';
        const record = await mgr.importScript(text, filename);
        return ok({ imported: 1, records: [record] });
      } catch (e: any) {
        return fail(500, `download failed: ${e?.message ?? e}`);
      }
    },

    /** DELETE /api/sources?id= */
    async remove(query: any): Promise<any> {
      const mgr = srcMgr();
      const id = query?.id;
      if (!id) return fail(400, 'id required');
      const removed = await mgr.remove(String(id));
      return removed ? ok(true) : fail(404, 'source not found');
    },

    /** PUT /api/sources/toggle */
    async toggle(body: any): Promise<any> {
      const mgr = srcMgr();
      const id = body?.id;
      if (!id) return fail(400, 'id required');
      try {
        const rec = await mgr.toggle(String(id));
        return ok(rec);
      } catch (e: any) {
        return fail(500, `toggle failed: ${e?.message ?? e}`);
      }
    },
  };
}

/** latin1(字节)字符串 → utf8 字符串 */
function latin1ToUtf8(latin1: string): string {
  const bytes = new Uint8Array(latin1.length);
  for (let i = 0; i < latin1.length; i++) bytes[i] = latin1.charCodeAt(i) & 255;
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return latin1;
  }
}
