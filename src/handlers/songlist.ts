/**
 * 歌单浏览 handler(转发 musicSdk)。
 *  GET /api/songlist/{tags,list,detail,search,sorts},带 source_id
 */

import { musicSdk } from '../musicSdk/facade.js';
import { ok, fail } from './response.js';

function getSdk(sourceId: string): any {
  return (musicSdk as any)[sourceId]?.songList;
}

export function makeSongListRoutes(): any {
  return {
    /** GET /api/songlist/tags?source_id= */
    async tags(query: any): Promise<any> {
      const sdk = getSdk(query?.source_id ?? 'kw');
      if (!sdk) return fail(400, 'unknown source_id');
      try {
        const res: any = await sdk.getTags();
        return ok(res);
      } catch (e: any) {
        return fail(500, e?.message ?? e);
      }
    },

    /** GET /api/songlist/list?source_id=&id=&page=&limit=&type=&category= */
    async list(query: any): Promise<any> {
      const sdk = getSdk(query?.source_id ?? 'kw');
      if (!sdk) return fail(400, 'unknown source_id');
      const info = {
        id: query?.id,
        page: Number(query?.page ?? 1),
        limit: Number(query?.limit ?? 20),
        type: query?.type,
        category: query?.category,
        name: query?.name,
      };
      try {
        const res: any = await sdk.getList(info);
        return ok(res);
      } catch (e: any) {
        return fail(500, e?.message ?? e);
      }
    },

    /** GET /api/songlist/detail?source_id=&id= */
    async detail(query: any): Promise<any> {
      const sdk = getSdk(query?.source_id ?? 'kw');
      if (!sdk) return fail(400, 'unknown source_id');
      try {
        const res: any = await sdk.getDetail({ id: query?.id });
        return ok(res);
      } catch (e: any) {
        return fail(500, e?.message ?? e);
      }
    },

    /** GET /api/songlist/search?source_id= (各平台无统一接口,占位返回空) */
    async search(query: any): Promise<any> {
      return ok({ list: [], isEnd: true });
    },

    /** GET /api/songlist/sorts?source_id= (占位) */
    async sorts(query: any): Promise<any> {
      return ok({ list: [] });
    },
  };
}
