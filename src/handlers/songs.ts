/**
 * 导入歌曲到库 handler。
 *  POST /api/songs/import:批量调宿主 POST /api/v1/songs/remote。
 */

import { musicSdk } from '../musicSdk/facade.js';
import { callHostAPI } from '../utils/http.js';
import { ok, fail } from './response.js';

const songloft: any = (globalThis as any).songloft;

/** 计算去重 key:<platform>:<稳定id>(songmid→musicId→hash→copyrightId) */
export function computeDedupKey(platform: string, song: any): string {
  const id =
    song.songmid ??
    song.musicId ??
    song.hash ??
    song.copyrightId ??
    song.strMediaMid;
  return id ? `${platform}:${id}` : '';
}

interface ImportItem {
  platform?: string;
  quality?: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  cover_url?: string;
  song?: any;
}

export function makeSongsImportHandler(): any {
  return {
    async import(body: any): Promise<any> {
      const items: ImportItem[] = body?.songs ?? [];
      if (!Array.isArray(items) || items.length === 0) {
        return fail(400, 'songs array required');
      }
      const batchResults: any[] = [];
      for (const it of items) {
        const platform = it.platform ?? it.song?.source ?? 'kw';
        const sdk: any = (musicSdk as any)[platform];
        const song = it.song ?? {};
        const dedupKey = computeDedupKey(platform, song);

        // 歌词:优先内存取,失败则用 direct/lyric URL
        let lyric = '';
        let lyricSource: string | null = null;
        if (sdk?.getLyric) {
          try {
            lyric = await sdk.getLyric({ source: platform, ...song }) ?? '';
          } catch {
            lyric = '';
          }
        }
        if (!lyric) {
          // 用 direct/lyric URL 形式,客户端拉取时主程序代理回本插件
          const qs = new URLSearchParams({
            platform,
            songmid: song.songmid ?? song.musicId ?? '',
            hash: song.hash ?? '',
            copyrightId: song.copyrightId ?? '',
          }).toString();
          lyric = `/api/v1/jsplugin/lxmusic/api/direct/lyric?${qs}`;
          lyricSource = 'url';
        }

        const payload = {
          title: it.title ?? song.name ?? '',
          artist: it.artist ?? song.singer ?? '',
          album: it.album ?? song.albumName ?? '',
          cover_url: it.cover_url ?? song.pic ?? '',
          duration: it.duration ?? Number(song.interval) || 0,
          plugin_entry_path: 'lxmusic',
          source_data: JSON.stringify({
            platform,
            quality: it.quality ?? '',
            songInfo: {
              source: platform,
              songmid: song.songmid,
              musicId: song.musicId,
              hash: song.hash,
              copyrightId: song.copyrightId,
              strMediaMid: song.strMediaMid,
              albumMid: song.albummid,
            },
          }),
          dedup_key: dedupKey,
          lyric_source: lyricSource,
          lyric,
        };

        try {
          const res = await callHostAPI('/api/v1/songs/remote', {
            method: 'POST',
            body: payload,
          });
          batchResults.push({ ok: true, res, dedupKey });
        } catch (e: any) {
          batchResults.push({ ok: false, error: String(e?.message ?? e), dedupKey });
        }
      }

      return ok({
        imported: batchResults.filter((r) => r.ok).length,
        failed: batchResults.filter((r) => !r.ok).length,
        results: batchResults,
      });
    },

    /** POST /api/songs/import-to-playlist:导入到库后再加入歌单(可选) */
    async importToPlaylist(body: any): Promise<any> {
      const { playlistId, songs } = body ?? {};
      if (!playlistId || !Array.isArray(songs)) return fail(400, 'playlistId + songs required');
      const songIds: string[] = [];
      for (const it of songs) {
        const platform = it.platform ?? it.song?.source ?? 'kw';
        const song = it.song ?? {};
        const dedupKey = computeDedupKey(platform, song);
        if (!dedupKey) continue;
        // 通过宿主找已导入歌曲
        try {
          const res = await callHostAPI('/api/v1/songs', { query: { dedup_key: dedupKey } });
          const found = Array.isArray(res?.songs) ? res.songs.find((s: any) => s.dedup_key === dedupKey) : res?.song;
          if (found?.id) songIds.push(found.id);
        } catch {
          /* ignore */
        }
      }
      const added: string[] = [];
      for (const id of songIds) {
        try {
          await callHostAPI(`/api/v1/playlists/${playlistId}/songs`, { method: 'POST', body: { song_id: id } });
          added.push(id);
        } catch {
          /* ignore */
        }
      }
      return ok({ added: added.length, songIds: added });
    },
  };
}
