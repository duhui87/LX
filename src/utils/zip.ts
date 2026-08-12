/**
 * ZIP 解析:QuickJS 无 zip 库,手写解析 Central Directory。
 * 支持 STORE(0) 和 DEFLATE(8,用宿主 __go_raw_inflate(hex))。
 * body 为 latin1 字符串(按字节匹配 EOCD/header)。
 */

const songloft: any = (globalThis as any).songloft;

interface Entry {
  name: string;
  data: Uint8Array;
  isDir: boolean;
}

/** latin1 字符串 → Uint8Array */
function latin1ToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255;
  return out;
}

/** latin1 字符串 → utf8 字符串 */
function latin1ToUtf8(s: string): string {
  try {
    return new TextDecoder('utf-8').decode(latin1ToBytes(s));
  } catch {
    return s;
  }
}

/** 从 latin1 body 中按字节搜索字节序列(返回字节偏移) */
function indexOfBytes(bytes: number[], haystack: string, from: number): number {
  let start = from;
  for (;;) {
    const charIdx = haystack.indexOf(String.fromCharCode(bytes[0]), start);
    if (charIdx < 0) return -1;
    // 逐字节比对
    let ok = true;
    for (let j = 0; j < bytes.length; j++) {
      if (haystack.charCodeAt(charIdx + j) !== bytes[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return charIdx;
    start = charIdx + 1;
  }
}

/** 读取小端 uint16/uint32 */
function readU16(s: string, off: number): number {
  return s.charCodeAt(off) | (s.charCodeAt(off + 1) << 8);
}
function readU32(s: string, off: number): number {
  return (
    (s.charCodeAt(off) | (s.charCodeAt(off + 1) << 8) | (s.charCodeAt(off + 2) << 16) | (s.charCodeAt(off + 3) << 24)) >>>
    0
  );
}

function decodeName(bytes: Uint8Array): string {
  // ZIP 中文件名通常是 UTF-8 编码,但按字节存;直接 utf8 解码
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    let out = '';
    for (const b of bytes) out += String.fromCharCode(b);
    return out;
  }
}

/**
 * 解析 ZIP latin1 body,返回文件列表。
 * @param body latin1 编码的 ZIP 字节
 */
export function parseZip(body: string): Entry[] {
  const entries: Entry[] = [];
  // 找 EOCD (PK\x05\x06)
  const eocdSig = [0x50, 0x4b, 0x05, 0x06];
  const eocd = indexOfBytes(eocdSig, body, 0);
  if (eocd < 0) {
    // 无中央目录,尝试 local-header fallback
    return parseLocalOnly(body);
  }
  const totalEntries = readU16(body, eocd + 10);
  const cdOffset = readU32(body, eocd + 16);
  const cdSize = readU32(body, eocd + 12);

  let off = cdOffset;
  const end = cdOffset + cdSize;
  while (off < end && off + 4 <= body.length) {
    // central directory header PK\x01\x02
    if (readU32(body, off) !== 0x02014b50) {
      off += 4;
      continue;
    }
    const method = readU16(body, off + 10);
    const compSize = readU32(body, off + 20);
    const uncompSize = readU32(body, off + 24);
    const nameLen = readU16(body, off + 28);
    const extraLen = readU16(body, off + 30);
    const commentLen = readU16(body, off + 32);
    const localHeaderOffset = readU32(body, off + 42);
    const nameBytes = latin1ToBytes(body.substr(off + 46, nameLen));
    const name = decodeName(nameBytes);
    const isDir = name.endsWith('/') || name.endsWith('\\');

    // 读取 local file header 以定位数据(handles general purpose bit 3 无解,这里简化:直接由 local header 推算数据偏移)
    let dataOffset = -1;
    if (localHeaderOffset + 30 <= body.length && readU32(body, localHeaderOffset) === 0x04034b50) {
      const lhNameLen = readU16(body, localHeaderOffset + 26);
      const lhExtraLen = readU16(body, localHeaderOffset + 28);
      dataOffset = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
    } else {
      dataOffset = -1;
    }

    if (!isDir && dataOffset >= 0) {
      let data: Uint8Array;
      if (method === 0) {
        data = latin1ToBytes(body.substr(dataOffset, compSize));
      } else if (method === 8) {
        // DEFLATE:用宿主 inflate(取 compSize 字节 hex)
        const compBytes = latin1ToBytes(body.substr(dataOffset, compSize));
        const hex = Array.from(compBytes)
          .map((b) => ('0' + (b & 255).toString(16)).slice(-2))
          .join('');
        const inflated = songloft && typeof (globalThis as any).__go_raw_inflate === 'function'
          ? (globalThis as any).__go_raw_inflate(hex)
          : '';
        data = typeof inflated === 'string' ? latin1ToBytes(inflated) : new Uint8Array(0);
      } else {
        data = new Uint8Array(0);
      }
      entries.push({ name, data, isDir: false });
    }

    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** 无中央目录时按 local headers 顺序扫描(极简 fallback) */
function parseLocalOnly(body: string): Entry[] {
  const entries: Entry[] = [];
  const sig = [0x50, 0x4b, 0x03, 0x04];
  let off = indexOfBytes(sig, body, 0);
  while (off >= 0) {
    if (readU32(body, off) !== 0x04034b50) {
      const next = indexOfBytes(sig, body, off + 1);
      off = next;
      continue;
    }
    const method = readU16(body, off + 8);
    const compSize = readU32(body, off + 18);
    const nameLen = readU16(body, off + 26);
    const extraLen = readU16(body, off + 28);
    const nameBytes = latin1ToBytes(body.substr(off + 30, nameLen));
    const name = decodeName(nameBytes);
    const isDir = name.endsWith('/') || name.endsWith('\\');
    const dataOffset = off + 30 + nameLen + extraLen;
    if (!isDir && method === 0 && dataOffset + compSize <= body.length) {
      entries.push({ name, data: latin1ToBytes(body.substr(dataOffset, compSize)), isDir: false });
    } else if (!isDir && method === 8) {
      const compBytes = latin1ToBytes(body.substr(dataOffset, compSize));
      const hex = Array.from(compBytes)
        .map((b) => ('0' + (b & 255).toString(16)).slice(-2))
        .join('');
      const inflated =
        typeof (globalThis as any).__go_raw_inflate === 'function'
          ? (globalThis as any).__go_raw_inflate(hex)
          : '';
      entries.push({ name, data: typeof inflated === 'string' ? latin1ToBytes(inflated) : new Uint8Array(0), isDir: false });
    }
    const next = indexOfBytes(sig, body, dataOffset);
    off = next;
  }
  return entries;
}

/** 过滤需要排除的条目(目录/__MACOSX/._*/.DS_Store) */
export function filterZipEntries(entries: Entry[]): Entry[] {
  return entries.filter((e) => {
    const n = e.name;
    if (e.isDir) return false;
    if (n.startsWith('__MACOSX/')) return false;
    if (n.startsWith('._')) return false;
    if (n.endsWith('.DS_Store')) return false;
    if (n.endsWith('/')) return false;
    return true;
  });
}

/** 从 ZIP 中提取 .js 脚本文件(返回 {name, script} 列表) */
export function extractScriptsFromZip(entries: Entry[]): Array<{ name: string; script: string }> {
  return filterZipEntries(entries)
    .filter((e) => e.name.toLowerCase().endsWith('.js'))
    .map((e) => ({
      name: e.name.split('/').pop() || e.name,
      script: latin1ToUtf8(
        Array.from(e.data)
          .map((b) => String.fromCharCode(b))
          .join('')
      ),
    }));
}

export { latin1ToUtf8, latin1ToBytes };
