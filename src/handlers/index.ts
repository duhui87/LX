/**
 * 汇总所有 handler 并注册到 router。
 */

import type { Router } from '@songloft/plugin-sdk';
import { createSearchHandler, createMusicUrlHandler } from '@songloft/plugin-sdk';
import { musicSdk, sources } from '../musicSdk/facade.js';
import { makeSearchFn, makeTopOneHandler, toSearchResult } from './search.js';
import { makeSourceRoutes } from './source.js';
import { makeSongListRoutes } from './songlist.js';
import { makeLeaderboardRoutes } from './leaderboard.js';
import { makeDirectRoutes } from './direct.js';
import { makeSongsImportHandler } from './songs.js';
import { ok, fail } from './response.js';

export interface HandlerContext {
  getRuntimeManager: () => any;
  getSourceManager: () => any;
}

export function buildRouter(router: Router, ctx: HandlerContext): void {
  const sourceRoutes = makeSourceRoutes(ctx);
  const songListRoutes = makeSongListRoutes();
  const leaderboardRoutes = makeLeaderboardRoutes();
  const directRoutes = makeDirectRoutes(ctx);
  const songsRoutes = makeSongsImportHandler();

  // ---- 主程序契约端点(走 SDK 工厂,返回裸 {results} / {url}) ----
  router.post('/api/search', createSearchHandler({ search: makeSearchFn(ctx) }));

  router.post(
    '/api/music/url',
    createMusicUrlHandler({
      resolveUrl: makeResolveUrl(ctx),
      fallbackSearch: makeFallbackSearch(ctx),
    })
  );

  // ---- 三合一 ----
  router.post('/api/search/topone', bodyHandler((body: any) => makeTopOneHandler(ctx)(body)));

  // ---- 音源管理 ----
  router.get('/api/sources', reqHandler(() => sourceRoutes.list()));
  router.post('/api/sources/import', reqHandler((req: any) => sourceRoutes.import(req)));
  router.post('/api/sources/import-url', bodyHandler((body: any) => sourceRoutes.importUrl(body)));
  router.delete('/api/sources', reqHandler((req: any) => sourceRoutes.remove(parseQueryFromReq(req))));
  router.put('/api/sources/toggle', bodyHandler((body: any) => sourceRoutes.toggle(body)));

  // ---- 歌单 ----
  router.get('/api/songlist/tags', reqHandler((req: any) => songListRoutes.tags(parseQueryFromReq(req))));
  router.get('/api/songlist/list', reqHandler((req: any) => songListRoutes.list(parseQueryFromReq(req))));
  router.get('/api/songlist/detail', reqHandler((req: any) => songListRoutes.detail(parseQueryFromReq(req))));
  router.get('/api/songlist/search', reqHandler((req: any) => songListRoutes.search(parseQueryFromReq(req))));
  router.get('/api/songlist/sorts', reqHandler((req: any) => songListRoutes.sorts(parseQueryFromReq(req))));

  // ---- 排行榜 ----
  router.get('/api/leaderboard/boards', reqHandler((req: any) => leaderboardRoutes.boards(parseQueryFromReq(req))));
  router.get('/api/leaderboard/list', reqHandler((req: any) => leaderboardRoutes.list(parseQueryFromReq(req))));

  // ---- Direct ----
  router.post('/api/direct/music/url', bodyHandler((body: any) => directRoutes.musicUrl(body)));
  router.get('/api/direct/lyric', reqHandler((req: any) => directRoutes.lyric(parseQueryFromReq(req))));

  // ---- 歌曲导入 ----
  router.post('/api/songs/import', bodyHandler((body: any) => songsRoutes.import(body)));
  router.post('/api/songs/import-to-playlist', bodyHandler((body: any) => songsRoutes.importToPlaylist(body)));

  // ---- 元信息 ----
  router.get('/api/meta', reqHandler(() => ok({ sources })));
}

/** 把 query 归一化为对象 */
function parseQueryFromReq(req: any): any {
  const q = req?.query;
  if (q && typeof q === 'object' && !Array.isArray(q)) return q;
  // 若宿主把 query 作为 "k=v&k2=v2" 或 [k,v] 形式
  if (typeof q === 'string') {
    const out: any = {};
    for (const pair of q.split('&')) {
      const [k, v] = pair.split('=');
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
    }
    return out;
  }
  if (Array.isArray(q)) {
    const out: any = {};
    for (let i = 0; i < q.length; i += 2) out[String(q[i])] = q[i + 1];
    return out;
  }
  return {};
}

/** 从 request 中解析 JSON body */
function parseBody(req: any): any {
  const raw = req?.body;
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  // Uint8Array
  if (typeof raw === 'object' && raw.buffer instanceof ArrayBuffer) {
    try {
      return JSON.parse(new TextDecoder('utf-8').decode(raw));
    } catch {
      return {};
    }
  }
  return raw;
}

/** bodyHandler:解析 JSON body 后传给 fn(始终返回合法 HTTPResponse) */
function bodyHandler(fn: (body: any) => Promise<any> | any): (req: any) => Promise<any> {
  return async (req: any) => {
    try {
      const body = parseBody(req);
      const result = await fn(body);
      return jsonResult(result);
    } catch (e: any) {
      return jsonResult(fail(500, String(e?.message ?? e)));
    }
  };
}

/** reqHandler:把完整请求对象(raw query/body/headers)传给 fn(始终返回合法 HTTPResponse) */
function reqHandler(fn: (req: any) => Promise<any> | any): (req: any) => Promise<any> {
  return async (req: any) => {
    try {
      const result = await fn(req);
      return jsonResult(result);
    } catch (e: any) {
      return jsonResult(fail(500, String(e?.message ?? e)));
    }
  };
}

function jsonResult(result: any): any {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  };
}

/** resolveUrl:把 source_data 解析为真实 URL */
function makeResolveUrl(ctx: HandlerContext) {
  return async (sourceData: any): Promise<{ url: string; headers?: Record<string, string> } | null> => {
    let data: any = sourceData;
    if (typeof sourceData === 'string') {
      try {
        data = JSON.parse(sourceData);
      } catch {
        return null;
      }
    }
    const platform = data?.platform ?? data?.songInfo?.source;
    const quality = data?.quality ?? '';
    const songInfo = data?.songInfo ?? {};
    if (!platform) return null;
    const runtime = ctx.getRuntimeManager();
    try {
      const res = await runtime.getMusicUrl({ ...songInfo, source: platform }, quality || '128k');
      return { url: res.url, headers: res.headers };
    } catch {
      return null;
    }
  };
}

/** fallbackSearch:主源失败且 hint.enabled 时跨平台自搜最匹配 */
function makeFallbackSearch(ctx: HandlerContext) {
  return async (hint: any): Promise<any | null> => {
    if (!hint?.enabled) return null;
    const keyword = `${hint?.title ?? ''} ${hint?.artist ?? ''}`.trim();
    if (!keyword) return null;

    for (const s of sources) {
      const sdk: any = (musicSdk as any)[s.id];
      if (!sdk?.musicSearch) continue;
      try {
        const res = await sdk.musicSearch.search(keyword, 1, 10);
        const list = res?.list ?? [];
        if (list.length === 0) continue;
        // 匹配标题最相近的
        let best = list[0];
        let bestScore = -1;
        const target = String(hint?.title ?? '').trim().toLowerCase();
        for (const item of list) {
          const name = String(item?.name ?? '').trim().toLowerCase();
          let score = 0;
          if (target && (name === target || name.includes(target) || target.includes(name))) {
            score = 100 - Math.min(Math.abs(name.length - target.length), 50);
          }
          if (score > bestScore) {
            bestScore = score;
            best = item;
          }
        }
        return { source_data: toSearchResult(s.id, best).source_data };
      } catch {
        /* try next */
      }
    }
    return null;
  };
}
