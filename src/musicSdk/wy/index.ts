/**
 * 网易云音乐 (wy) musicSdk —— 移植自 lxserver,只做元数据(搜索/歌词/歌单/榜单)。
 */

import { httpFetch } from '../request.js';
import { get, formatPlayCount, singerName } from '../index.js';

const SEARCH_URL = 'https://music.163.com/api/search/get';
const SONG_DETAIL_URL = 'https://music.163.com/api/song/detail';
const LYRIC_URL = 'https://music.163.com/api/song/lyric';
const PLAYLIST_DETAIL_URL = 'https://music.163.com/api/playlist/detail';
const PLAYLIST_CATALOGUE_URL = 'https://music.163.com/api/playlist/catalogue';
const TOPLIST_URL = 'https://music.163.com/api/toplist';

function getArtist(arr: any[] | undefined): string {
  return (arr ?? []).map((a) => a.name ?? '').join('/');
}

/** 搜索 */
export const musicSearch = {
  async search(str: string, page: number, limit = 20): Promise<any> {
    const url =
      `${SEARCH_URL}?s=${encodeURIComponent(str)}&type=1&offset=${(page - 1) * limit}` +
      `&limit=${limit}${page > 1 ? '&total=true' : ''}`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: { Referer: 'https://music.163.com/' },
      timeout: 10000,
    }).promise;
    const result = body?.result ?? {};
    const songs = result.songs ?? [];
    const list = songs.map((raw: any) => ({
      singer: getArtist(raw.artists),
      name: raw.name,
      albumName: raw.album?.name ?? '',
      interval: String(raw.duration / 1000),
      songmid: String(raw.id),
      musicId: String(raw.id),
      copyrightId: String(raw.id),
      albummid: String(raw.album?.id ?? ''),
      pic: `https://p1.music.126.net/${encodeURIComponent((raw.album?.blurPicUrl ?? '').split('/').pop() ?? '')}`,
      source: 'wy',
    }));
    return {
      isEnd: (songs as any[]).length < limit,
      list,
    };
  },
};

/** 歌词 */
export async function getLyric(songInfo: any): Promise<string> {
  const mid = songInfo.songmid || songInfo.musicId;
  if (!mid) throw new Error('wy: missing id');
  const url = `${LYRIC_URL}?id=${mid}&lv=1&kv=1&tv=-1`;
  const { body } = await httpFetch(url, {
    method: 'GET',
    headers: { Referer: 'https://music.163.com/' },
    timeout: 10000,
  }).promise;
  return body?.lrc?.lyric ?? '';
}

/** 封面(按需) */
export async function getPic(songInfo: any): Promise<string> {
  if (songInfo.pic) return songInfo.pic;
  const mid = songInfo.songmid || songInfo.musicId;
  if (!mid) return '';
  const url = `${SONG_DETAIL_URL}?id=${mid}`;
  const { body } = await httpFetch(url, {
    method: 'GET',
    headers: { Referer: 'https://music.163.com/' },
    timeout: 10000,
  }).promise;
  return get(body, 'songs.0.album.picUrl', '');
}

/** 歌单 */
export const songList = {
  async getTags(): Promise<any> {
    const { body } = await httpFetch(PLAYLIST_CATALOGUE_URL, {
      method: 'GET',
      headers: { Referer: 'https://music.163.com/' },
      timeout: 10000,
    }).promise;
    const bindings = body?.sub ?? [];
    const list = bindings.map((b: any) => ({
      id: String(b.category),
      name: b.name,
      list: (b.subs ?? []).map((s: any, i: number) => ({
        id: `${b.category}-${i}`,
        name: s.category ?? s.name,
      })),
    }));
    return { list };
  },

  async getList(info: any): Promise<any> {
    const [cat, idx] = String(info.id).split('-');
    const catName = info.name ?? '';
    const url =
      `https://music.163.com/api/playlist/list?cat=${encodeURIComponent(catName)}` +
      `&order=hot&offset=${(info.page - 1) * info.limit}&limit=${info.limit}&total=true`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: { Referer: 'https://music.163.com/' },
      timeout: 10000,
    }).promise;
    const playlists = body?.playlists ?? [];
    return {
      isEnd: (playlists as any[]).length < info.limit,
      list: playlists.map((p: any) => ({
        id: String(p.id),
        name: p.name,
        cover: p.coverImgUrl,
        playCount: formatPlayCount(p.playCount),
        platform: 'wy',
      })),
    };
  },

  async getDetail(info: any): Promise<any> {
    const url = `${PLAYLIST_DETAIL_URL}?id=${info.id}`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: { Referer: 'https://music.163.com/' },
      timeout: 10000,
    }).promise;
    const d = body?.result ?? {};
    const list = (d.tracks ?? []).map((raw: any) => ({
      singer: getArtist(raw.artists),
      name: raw.name,
      albumName: raw.album?.name ?? '',
      interval: String(raw.duration / 1000),
      songmid: String(raw.id),
      musicId: String(raw.id),
      albummid: String(raw.album?.id ?? ''),
      pic: raw.album?.blurPicUrl ?? '',
      source: 'wy',
    }));
    return {
      name: d.name,
      pic: d.coverImgUrl,
      playCount: formatPlayCount(d.playCount),
      list,
    };
  },
};

/** 排行榜 */
export const leaderboard = {
  async getBoards(): Promise<any> {
    const { body } = await httpFetch(TOPLIST_URL, {
      method: 'GET',
      headers: { Referer: 'https://music.163.com/' },
      timeout: 10000,
    }).promise;
    const list = (body?.list ?? []).map((b: any) => ({
      id: String(b.id),
      shortName: b.name,
      name: b.name,
      type: 'wy',
      updateFrequency: b.updateFrequency,
    }));
    return { list };
  },

  async getList(info: any): Promise<any> {
    const { body } = await httpFetch(`${TOPLIST_URL}/detail?id=${info.id}`, {
      method: 'GET',
      headers: { Referer: 'https://music.163.com/' },
      timeout: 10000,
    }).promise;
    const list = (body?.list ?? []).map((raw: any) => ({
      singer: getArtist(raw.artists),
      name: raw.name,
      albumName: raw.album?.name ?? '',
      interval: String(raw.duration / 1000),
      songmid: String(raw.id),
      musicId: String(raw.id),
      albummid: String(raw.album?.id ?? ''),
      pic: raw.album?.blurPicUrl ?? '',
      source: 'wy',
    }));
    return { isEnd: body?.list?.length < info.limit, list };
  },
};

/** 热搜 */
export const hotSearch = {
  async getAll(): Promise<any> {
    const url = 'https://music.163.com/api/search/hot';
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: { Referer: 'https://music.163.com/' },
      timeout: 10000,
    }).promise;
    const list = (get(body, 'result.hots', []) as any[]).map((h) => h.first ?? '');
    return { list };
  },
};
