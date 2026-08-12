/**
 * Direct handlers(供前端/其它插件直接调用,返回 {code:0,data} 封装)。
 *  POST /api/direct/music/url:{songInfo:{source,songmid,...},quality}
 *  GET /api/direct/lyric?(platform|source=)&songmid=&... 
 */

import { musicSdk } from '../musicSdk/facade.js';
import { ok, fail } from './response.js';

type StartupContext = {
  getRuntimeManager: () => any;
};

export function makeDirectRoutes(ctx: StartupContext): any {
  return {
    /** POST /api/direct/music/url */
    async musicUrl(body: any): Promise<any> {
      const { songInfo, quality = '128k' } = body ?? {};
      if (!songInfo?.source && !songInfo?.platform) return fail(400, 'songInfo.source required');
      const runtime = ctx.getRuntimeManager();
      const platform = songInfo.source ?? songInfo.platform;
      try {
        const res = await runtime.getMusicUrl(
          {
            source: platform,
            songmid: songInfo.songmid,
            musicId: songInfo.musicId,
            hash: songInfo.hash,
            copyrightId: songInfo.copyrightId,
            strMediaMid: songInfo.strMediaMid,
          },
          quality
        );
        return ok({ url: res.url, headers: res.headers, source: res.source, quality });
      } catch (e: any) {
        return fail(500, `resolve failed: ${e?.message ?? e}`);
      }
    },

    /** GET /api/direct/lyric */
    async lyric(query: any): Promise<any> {
      const platform = query?.platform ?? query?.source ?? query?.source_id ?? 'kw';
      const sdk: any = (musicSdk as any)[platform];
      if (!sdk || typeof sdk.getLyric !== 'function') return fail(400, `unsupported platform: ${platform}`);
      const songInfo = {
        source: platform,
        songmid: query?.songmid,
        musicId: query?.songmid || query?.musicId,
        hash: query?.hash,
        copyrightId: query?.copyrightId,
        strMediaMid: query?.strMediaMid,
      };
      try {
        const lyric = await sdk.getLyric(songInfo);
        return ok({ lyric });
      } catch (e: any) {
        return fail(500, e?.message ?? e);
      }
    },
  };
}
