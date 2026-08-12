/**
 * 搜索相关 handler。
 *  - POST /api/search(主程序契约,由 SDK createSearchHandler 生成)
 *  - POST /api/search/topone(三合一:搜索+匹配+解析 URL)
 */

import type { SearchResultItem } from '@songloft/plugin-sdk';
import { musicSdk } from '../musicSdk/facade.js';
import { ok, fail } from './response.js';

type StartupContext = {
  getRuntimeManager: () => any;
  getSourceManager: () => any;
};

/** 把 musicSdk 平台搜索结果归一化为 SearchResultItem */
export function toSearchResult(platform: string, item: any): SearchResultItem {
  const songInfo = {
    source: platform,
    songmid: item.songmid,
    musicId: item.musicId,
    hash: item.hash,
    copyrightId: item.copyrightId,
    strMediaMid: item.strMediaMid,
    albumMid: item.albummid,
    name: item.name,
    singer: item.singer,
    albumName: item.albumName,
    duration: item.interval,
    pic: item.pic,
  };
  return {
    title: item.name ?? '',
    artist: Array.isArray(item.singer) ? item.singer.map((s: any) => s.name ?? s).join('/') : (item.singer ?? ''),
    album: item.albumName ?? '',
    duration: Number(item.interval) || 0,
    cover_url: item.pic ?? '',
    source_data: JSON.stringify({
      platform,
      quality: item._quality ?? '',
      songInfo,
    }),
  };
}

/** SDK 工厂的 search 回调 */
export function makeSearchFn(ctx: StartupContext) {
  return async (params: {
    keyword: string;
    source_id?: string;
    quality?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: SearchResultItem[] }> => {
    const platform = params.source_id ?? 'kw';
    const sdk: any = (musicSdk as any)[platform];
    if (!sdk) {
      return { results: [] };
    }
    const page = params.page ?? 1;
    const limit = params.page_size ?? 20;
    try {
      const res = await sdk.musicSearch.search(params.keyword ?? '', page, limit);
      const results = (res?.list ?? []).map((item: any) =>
        toSearchResult(platform, { ...item, _quality: params.quality })
      );
      return { results };
    } catch (e: any) {
      songloftLog(`search ${platform} error: ${e?.message}`);
      return { results: [] };
    }
  };
}

/** POST /api/search/topone:搜索 + 匹配 + 解析 URL,返回最佳可播放项 */
export function makeTopOneHandler(ctx: StartupContext) {
  return async (body: any): Promise<any> => {
    const { keyword, source_id = 'kw', quality = '128k' } = body ?? {};
    if (!keyword) return fail(400, 'keyword required');
    const platform = source_id;
    const sdk: any = (musicSdk as any)[platform];
    if (!sdk) return fail(400, `unknown source: ${platform}`);

    let list: any[] = [];
    try {
      const res = await sdk.musicSearch.search(keyword, 1, 20);
      list = res?.list ?? [];
    } catch {
      return fail(500, 'search failed');
    }
    if (list.length === 0) return ok({ found: false, item: null });

    // 取第一个,附带解析 URL
    const first = list[0];
    const runtime = ctx.getRuntimeManager();
    let url: string | null = null;
    let resolveError: string | null = null;
    try {
      const r = await runtime.getMusicUrl(
        {
          source: platform,
          songmid: first.songmid,
          musicId: first.musicId,
          hash: first.hash,
          copyrightId: first.copyrightId,
          strMediaMid: first.strMediaMid,
        },
        quality
      );
      url = r.url;
    } catch (e: any) {
      resolveError = String(e?.message ?? e);
    }

    return ok({
      found: true,
      item: {
        song: toSearchResult(platform, first),
        url,
        resolveError,
      },
    });
  };
}

function songloftLog(msg: string): void {
  const s: any = (globalThis as any).songloft;
  s?.log?.info(msg);
}
