/**
 * 音源脚本元数据解析(从脚本头 JSDoc 提取 @name/@version/@description/@author/@homepage)。
 */

import type { SourceInfo } from '../types.js';

/** 从脚本源码头部提取 JSDoc 块(/ ** ... * / 或 /*! ... * /) */
function extractJSDoc(script: string): string | null {
  const m = script.match(/\/\*\*([\s\S]*?)\*\//) || script.match(/\/\*\!([\s\S]*?)\*\//);
  if (!m) return null;
  // 去掉行首 * 与空白
  const lines = m[1]
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\*\s?/, ''))
    .join('\n');
  return lines;
}

function extractTag(doc: string, tag: string): string {
  const re = new RegExp(`@${tag}\\s+([^\\n@]+)`, 'i');
  const m = doc.match(re);
  if (!m) return '';
  return m[1].trim();
}

/** 中文 slug(保留中文,其余字符转安全) */
export function slugify(name: string): string {
  const s = String(name || '')
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '_');
  return s || 'unnamed';
}

/**
 * 解析脚本元数据。
 * @param script 脚本源码
 * @param fallbackName 文件名推断
 */
export function parseSourceInfo(script: string, fallbackName?: string): SourceInfo {
  const doc = extractJSDoc(script) ?? '';
  const name =
    extractTag(doc, 'name') ||
    extractTag(doc, 'title') ||
    fallbackName?.replace(/\.js$/i, '') ||
    'unnamed';
  const version = extractTag(doc, 'version') || '0.0.0';
  const description = extractTag(doc, 'description');
  const author = extractTag(doc, 'author');
  const homepage = extractTag(doc, 'homepage') || extractTag(doc, 'website');

  // 收集附加字段(updateTime 等)
  const extra: Record<string, string> = {};
  const otherTags = doc.match(/@(\w+)\s+([^\n@]+)/g) ?? [];
  for (const raw of otherTags) {
    const mm = raw.match(/@(\w+)\s+([\s\S]*)/);
    if (!mm) continue;
    const key = mm[1].toLowerCase();
    if (!['name', 'title', 'version', 'description', 'author', 'homepage', 'website'].includes(key)) {
      extra[key] = mm[2].trim();
    }
  }

  return {
    id: slugify(name),
    name,
    version,
    description,
    author,
    homepage,
    extra,
    rawScript: script,
  };
}

/** 解析压缩包内单个脚本文件的元数据(复用 parseSourceInfo) */
export function parseScriptFile(script: string, filename?: string): SourceInfo {
  return parseSourceInfo(script, filename);
}
