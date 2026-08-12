/**
 * 排行榜 handler(转发 musicSdk)。
 *  GET /api/leaderboard/{boards,list},带 source_id
 */

import { musicSdk } from '../musicSdk/facade.js';
import { ok, fail } from './response.js';

function getSdk(sourceId: string): any {
  return (musicSdk as any)[sourceId]?.leaderboard;
}

export function makeLeaderboardRoutes(): any {
  return {
    /** GET /api/leaderboard/boards?source_id= */
    async boards(query: any): Promise<any> {
      const sdk = getSdk(query?.source_id ?? 'kw');
      if (!sdk) return fail(400, 'unknown source_id');
      try {
        const res: any = await sdk.getBoards();
        return ok(res);
      } catch (e: any) {
        return fail(500, e?.message ?? e);
      }
    },

    /** GET /api/leaderboard/list?source_id=&id=&page=&limit= */
    async list(query: any): Promise<any> {
      const sdk = getSdk(query?.source_id ?? 'kw');
      if (!sdk) return fail(400, 'unknown source_id');
      const info = {
        id: query?.id,
        page: Number(query?.page ?? 1),
        limit: Number(query?.limit ?? 20),
      };
      try {
        const res: any = await sdk.getList(info);
        return ok(res);
      } catch (e: any) {
        return fail(500, e?.message ?? e);
      }
    },
  };
}
