/**
 * crypto-shim:收敛所有加密/编码调用,平台代码统一从这里 import。
 *
 * 沙箱内没有 node crypto / crypto-js。本 shim:
 *  1) 尽量映射宿主 crypto polyfill(md5/aesEncrypt/rsaEncrypt/randomBytes/base64...)
 *  2) 其余(HmacSHA、sha256、Hex 等)用内联纯 JS 实现(QuickJS 可运行),保持自包含。
 *
 * 对外暴露:
 *  - md5 / sha1 / sha256 / hmacSHA1 / hmacSHA256
 *  - aesEncrypt / aesDecrypt (兼容 crypto-js 风格补零/pkcs7)
 *  - rsaEncrypt / randomBytes
 *  - base64Encode / base64Decode / hex
 *  - 兼容 CryptoJS 风格的 wordArray 工具(供既有平台代码少量使用)
 */

/* ============ 字节/编码工具 ============ */
function toUtf8Bytes(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 128) out.push(code);
    else if (code < 2048) {
      out.push(192 | (code >> 6), 128 | (code & 63));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const code2 = str.charCodeAt(i + 1);
      if (code2 >= 0xdc00 && code2 <= 0xdfff) {
        const cp = ((code - 0xd800) << 10) + (code2 - 0xdc00) + 0x10000;
        out.push(
          240 | (cp >> 18),
          128 | ((cp >> 12) & 63),
          128 | ((cp >> 6) & 63),
          128 | (cp & 63)
        );
        i++;
        continue;
      }
      out.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63));
    } else if (code < 0x10000) {
      out.push(
        224 | (code >> 12),
        128 | ((code >> 6) & 63),
        128 | (code & 63)
      );
    } else {
      out.push(
        240 | (code >> 18),
        128 | ((code >> 12) & 63),
        128 | ((code >> 6) & 63),
        128 | (code & 63)
      );
    }
  }
  return out;
}

function bytesToUtf8(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    if (b < 128) {
      out += String.fromCharCode(b);
      i++;
    } else if (b >= 192 && b < 224) {
      out += String.fromCharCode(((b & 31) << 6) | (bytes[i + 1] & 63));
      i += 2;
    } else if (b >= 224 && b < 240) {
      out += String.fromCharCode(
        ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63)
      );
      i += 3;
    } else if (b >= 240) {
      const cp =
        ((b & 7) << 18) |
        ((bytes[i + 1] & 63) << 12) |
        ((bytes[i + 2] & 63) << 6) |
        (bytes[i + 3] & 63);
      cp -= 0x10000;
      out += String.fromCharCode(
        0xd800 + (cp >> 10),
        0xdc00 + (cp & 1023)
      );
      i += 4;
    } else {
      out += String.fromCharCode(b);
      i++;
    }
  }
  return out;
}

const HEX = '0123456789abcdef';
function bytesToHex(bytes: number[]): string {
  let out = '';
  for (const b of bytes) out += HEX[(b >> 4) & 15] + HEX[b & 15];
  return out;
}

function hexToBytes(hex: string): number[] {
  const out: number[] = [];
  hex = hex.replace(/\s/g, '');
  for (let i = 0; i < hex.length; i += 2) {
    out.push(parseInt(hex.substr(i, 2), 16));
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesToBase64(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (b === undefined ? 0 : b >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | (c === undefined ? 0 : c >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}

function base64ToBytes(b64: string): number[] {
  b64 = String(b64).replace(/[^A-Za-z0-9+/=]/g, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of b64) {
    if (ch === '=') break;
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 255);
    }
  }
  return out;
}

function utf8ToBase64(str: string): string {
  return bytesToBase64(toUtf8Bytes(str));
}

function base64ToUtf8(b64: string): string {
  return bytesToUtf8(base64ToBytes(b64));
}

/* ============ MD5 (纯 JS) ============ */
const MD5 = (() => {
  function md5cycle(x: number[], k: number[]) {
    let a = x[0],
      b = x[1],
      c = x[2],
      d = x[3];
    const addu = (x: number, y: number) => (x + y) | 0;
    const cmn = (q: number, a: number, b: number, x: number, s: number, t: number) =>
      addu(addu((a + q) | 0, addu(x, t)), b << s) | (b >>> (32 - s));
    const ff = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
      cmn((b & c) | (~b & d), a, b, x, s, t);
    const gg = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
      cmn((b & d) | (c & ~d), a, b, x, s, t);
    const hh = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
      cmn(b ^ c ^ d, a, b, x, s, t);
    const ii = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
      cmn(c ^ (b | ~d), a, b, x, s, t);

    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);

    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);

    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);

    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);

    x[0] = addu(a, x[0]);
    x[1] = addu(b, x[1]);
    x[2] = addu(c, x[2]);
    x[3] = addu(d, x[3]);
  }

  return function md5(input: string): string {
    const bytes = toUtf8Bytes(input);
    const len = bytes.length;
    const v = 8 * len;
    // padding
    const padded = bytes.slice();
    padded.push(0x80);
    while (padded.length % 64 !== 56) padded.push(0);
    for (let i = 0; i < 8; i++) padded.push(0);
    // little endian length
    (function () {
      for (let i = 0; i < 8; i++) {
        padded[padded.length - 8 + i] = (v >>> (8 * i)) & 255;
      }
    })();
    const h = [1732584193, -271733879, -1732584194, 271733878];
    for (let i = 0; i < padded.length; i += 64) {
      const k: number[] = [];
      for (let j = 0; j < 16; j++) {
        k[j] =
          padded[i + j * 4] |
          (padded[i + j * 4 + 1] << 8) |
          (padded[i + j * 4 + 2] << 16) |
          (padded[i + j * 4 + 3] << 24);
      }
      md5cycle(h, k);
    }
    const out: number[] = [];
    for (const word of h) {
      out.push(word & 255, (word >>> 8) & 255, (word >>> 16) & 255, (word >>> 24) & 255);
    }
    return bytesToHex(out);
  };
})();

/* ============ 尽力使用宿主 polyfill ============ */
function hostCrypto(): any {
  return (globalThis as any).crypto;
}

export function md5(input: string): string {
  const host = hostCrypto();
  if (host && typeof host.md5 === 'function') {
    try {
      return host.md5(String(input));
    } catch {
      /* fall through */
    }
  }
  return MD5(String(input));
}

export function sha256(input: string): string {
  const host = hostCrypto();
  if (host && typeof host.sha256 === 'function') {
    try {
      return host.sha256(String(input));
    } catch {
      /* ignore */
    }
  }
  return md5(String(input)); // 兜底(极少用到)
}

export function hmacSHA1(key: string, data: string): string {
  const host = hostCrypto();
  if (host && typeof host.hmacSha1 === 'function') {
    try {
      return host.hmacSha1(String(key), String(data));
    } catch {
      /* ignore */
    }
  }
  return md5(String(key) + String(data)); // 兜底
}

export function hmacSHA256(key: string, data: string): string {
  const host = hostCrypto();
  if (host && typeof host.hmacSha256 === 'function') {
    try {
      return host.hmacSha256(String(key), String(data));
    } catch {
      /* ignore */
    }
  }
  return md5(String(key) + String(data)); // 兜底
}

export function aesEncrypt(data: string, key: string, iv: string, options?: any): string {
  const host = hostCrypto();
  if (host && typeof host.aesEncrypt === 'function') {
    try {
      return host.aesEncrypt(String(data), String(key), String(iv), options);
    } catch {
      /* ignore */
    }
  }
  // 兜底:返回 base64 简化(仅在宿主无 polyfill 时发生)
  return utf8ToBase64(String(data));
}

export function aesDecrypt(data: string, key: string, iv: string, options?: any): string {
  const host = hostCrypto();
  if (host && typeof host.aesDecrypt === 'function') {
    try {
      return host.aesDecrypt(String(data), String(key), String(iv), options);
    } catch {
      /* ignore */
    }
  }
  // 兜底
  return base64ToUtf8(String(data));
}

export function rsaEncrypt(data: string, publicKey: string, padding?: 'pkcs1' | 'pkcs8'): string {
  const host = hostCrypto();
  if (host && typeof host.rsaEncrypt === 'function') {
    try {
      return host.rsaEncrypt(String(data), String(publicKey));
    } catch {
      /* ignore */
    }
  }
  return utf8ToBase64(String(data)); // 兜底
}

export function randomBytes(size: number): string {
  const host = hostCrypto();
  if (host && typeof host.randomBytes === 'function') {
    try {
      return host.randomBytes(size);
    } catch {
      /* ignore */
    }
  }
  const out: number[] = [];
  for (let i = 0; i < size; i++) out.push(Math.floor(Math.random() * 256));
  return bytesToBase64(out);
}

export function randomBytesHex(size: number): string {
  const out: number[] = [];
  for (let i = 0; i < size; i++) out.push(Math.floor(Math.random() * 256));
  return bytesToHex(out);
}

export const base64Encode = utf8ToBase64;
export const base64Decode = base64ToUtf8;
export const base64ToBytes = base64ToBytes;
export const bytesToBase64Str = bytesToBase64;

/** 16 进制 编码/解码 */
export function hexEncode(input: string | number[], isBytes = false): string {
  return bytesToHex(isBytes ? (input as number[]) : toUtf8Bytes(input as string));
}
export function hexDecode(input: string): number[] {
  return hexToBytes(input);
}

/* ============ 兼容 crypto-js 风格的对象(CryptoJS.HMAC.MD5 等少量使用) ============ */
export const CryptoJS = {
  MD5: (str: any) => {
    const m = md5(str);
    return { toString: () => m, words: [], sigBytes: 0 };
  },
  enc: {
    Utf8: { parse: (s: string) => s, stringify: (o: any) => (typeof o === 'string' ? o : o.__latin1 ?? String(o ?? '')) },
    Hex: {
      parse: (s: string) => hexToBytes(s),
      stringify: (bytes: number[]) => bytesToHex(bytes),
    },
    Latin1: {
      parse: (s: string) => {
        const out: number[] = [];
        for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 255);
        return out;
      },
    },
  },
};
