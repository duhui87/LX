/**
 * 咪咕音乐 (mg) musicSdk —— 移植自 lxserver,只做元数据(搜索/歌词/歌单/榜单)。
 */

import { httpFetch } from '../request.js';
import { get, decodeName, formatPlayCount, singerName } from '../index.js';

const API_URL = 'https://music.migu.cn/v3/api/music';
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://music.migu.cn/',
};

/** 搜索 */
export const musicSearch = {
  async search(str: string, page: number, limit = 20): Promise<any> {
    const url =
      `${API_URL}/search/searchSong?keyword=${encodeURIComponent(str)}` +
      `&pgc=1&rows=${limit}&searchSwitch='{song:1,album:0,singer:0,tag:0,lyric:0,poster:0,score:1}'&type=2`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: HEADERS,
      timeout: 10000,
    }).promise;
    const songs = body?.songResultData?.songs ?? [];
    const list = songs.map((raw: any) => {
      const singers = (raw.singers ?? []).map((s: any) => s.name ?? '');
      const cp = raw.copyrightId ?? '';
      return {
        singer: singerName(singers),
        name: decodeName(raw.songName),
        albumName: decodeName(raw.albumName),
        interval: String(raw.album?.length ?? 0),
        songmid: cp,
        musicId: cp,
        hash: raw.songId,
        copyrightId: cp,
        albummid: raw.albumId ?? '',
        pic: raw.albumImgs?.song ?? raw.albumImgs?.img ?? '',
        source: 'mg',
      };
    });
    return {
      isEnd: (get(body, 'songResultData.totalCount', 0) as number) <= page * limit,
      list,
    };
  },
};

/** 歌词 */
export async function getLyric(songInfo: any): Promise<string> {
  const cp = songInfo.copyrightId || songInfo.songmid || songInfo.musicId;
  if (!cp) throw new Error('mg: missing copyrightId');
  const url = `${API_URL}/audioPlayer/getLyric?copyrightId=${cp}&type=2`;
  const { body } = await httpFetch(url, {
    method: 'GET',
    headers: HEADERS,
    timeout: 10000,
  }).promise;
  return body?.lyric ?? '';
}

/** 封面(按需) */
export async function getPic(songInfo: any): Promise<string> {
  return songInfo.pic ?? '';
}

/** 歌单 */
export const songList = {
  async getTags(): Promise<any> {
    const url = `${API_URL}/songList/categoryTagList?type=2&pageSize=100`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: HEADERS,
      timeout: 10000,
    }).promise;
    const list = (body?.result ?? []).map((c: any) => ({
      id: String(c.categoryId ?? c.id),
      name: c.categoryName ?? c.name,
      list: (c.children ?? []).map((child: any) => ({
        id: String(child.categoryId ?? child.id),
        name: child.categoryName ?? child.name,
      })),
    }));
    return { list };
  },

  async getList(info: any): Promise<any> {
    const url =
      `${API_URL}/songList/list?type=2&page=${info.page}&pageSize=${info.limit}` +
      (info.id ? `&categoryId=${info.id}` : '');
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: HEADERS,
      timeout: 10000,
    }).promise;
    const list = (body?.result ?? []).map((p: any) => ({
      id: String(p.resourceId ?? p.id),
      name: p.resourceName ?? p.name,
      cover: p.contentImg ?? p.cover,
      playCount: formatPlayCount(p.resourceNumber),
      platform: 'mg',
    }));
    return { isEnd: list.length < info.limit, list };
  },

  async getDetail(info: any): Promise<any> {
    const url = `${API_URL}/songList/info?type=2&resourceId=${info.id}`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: HEADERS,
      timeout: 10000,
    }).promise;
    const d = body?.result ?? {};
    const list = (d.songItems ?? []).map((raw: any) => {
      const song = raw?.song ?? raw ?? {};
      return {
        singer: singerName((song.singers ?? []).map((s: any) => s.name ?? '')),
        name: decodeName(song.songName),
        albumName: decodeName(song.albumName),
        interval: String(song.length ?? 0),
        songmid: song.copyrightId ?? '',
        musicId: song.copyrightId ?? '',
        hash: song.songId,
        copyrightId: song.copyrightId ?? '',
        albummid: song.albumId ?? '',
        pic: song.albumImgs?.song ?? '',
        source: 'mg',
      };
    });
    return {
      name: d.resourceName ?? '',
      pic: d.contentImg ?? '',
      playCount: d.resourceNumber,
      list,
    };
  },
};

/** 排行榜 */
export const leaderboard = {
  async getBoards(): Promise<any> {
    const url = `${API_URL}/songList/topList?type=2&page=1&pageSize=30`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: HEADERS,
      timeout: 10000,
    }).promise;
    const list = (body?.result ?? []).map((b: any) => ({
      id: String(b.resourceId ?? b.id),
      shortName: b.resourceName ?? b.name,
      name: b.resourceName ?? b.name,
      type: 'mg',
    }));
    return { list };
  },

  async getList(info: any): Promise<any> {
    const url =
      `${API_URL}/songList/info?type=2&resourceId=${info.id}` +
      `&page=${info.page}&pageSize=${info.limit}`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: HEADERS,
      timeout: 10000,
    }).promise;
    const d = body?.result ?? {};
    const list = (d.songItems ?? []).map((raw: any) => {
      const song = raw?.song ?? raw ?? {};
      return {
        singer: singerName((song.singers ?? []).map((s: any) => s.name ?? '')),
        name: decodeName(song.songName),
        albumName: decodeName(song.albumName),
        interval: String(song.length ?? 0),
        songmid: song.copyrightId ?? '',
        musicId: song.copyrightId ?? '',
        hash: song.songId,
        copyrightId: song.copyrightId ?? '',
        albummid: song.albumId ?? '',
        pic: song.albumImgs?.song ?? '',
        source: 'mg',
      };
    });
    return { isEnd: list.length < info.limit, list };
  },
};

/** 热搜(可选) */
export const hotSearch = {
  async getAll(): Promise<any> {
    const url = `${API_URL}/search/hotWordList`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: HEADERS,
      timeout: 10000,
    }).promise;
    const list = (body?.result ?? []).map((h: any) => h.word ?? h.searchWord ?? '');
    return { list };
  },
};
