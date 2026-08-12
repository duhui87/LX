/**
 * 酷狗音乐 (kg) musicSdk —— 移植自 lxserver,只做元数据(搜索/歌词/歌单/榜单)。
 */

import { httpFetch } from '../request.js';
import { decodeName, formatPlayCount, formatPlayTime, singerName } from '../index.js';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://www.kugou.com/',
};

/** 搜索 */
export const musicSearch = {
  async search(str: string, page: number, limit = 20): Promise<any> {
    const url =
      `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(str)}` +
      `&page=${page}&pagesize=${limit}&showtype=1`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: HEADERS,
      timeout: 10000,
    }).promise;
    const list: any[] = [];
    const data = body?.data ?? {};
    const info = data.info ?? [];
    for (const raw of info) {
      list.push({
        singer: decodeName(raw.singername),
        name: decodeName(raw.songname),
        albumName: decodeName(raw.album_name),
        interval: formatPlayTime(raw.duration),
        songmid: String(raw.album_id),
        musicId: String(raw.album_id),
        hash: raw.hash,
        albummid: raw.album_id,
        pic: raw.album_audio_id
          ? `https://imgessl.kugou.com/standard/${raw.album_audio_id}_1.jpg`
          : '',
        source: 'kg',
      });
    }
    return {
      isEnd: (info as any[]).length < limit,
      list,
    };
  },
};

/** 通过 hash 拿到详情(用于取 lyrics;也用于稳定 id) */
async function getSongInfoByHash(hash: string, albumId?: string | number): Promise<any | null> {
  let url =
    `http://mobilecdn.kugou.com/api/v3/song/info?format=json&hash=${hash}` +
    (albumId != null ? `&album_id=${albumId}` : '');
  let { body } = await httpFetch(url, {
    method: 'GET',
    headers: HEADERS,
    timeout: 10000,
  }).promise;
  if (body?.status !== 1) {
    // 备用接口
    url = `http://www.kugou.com/index.php?r=play/getdata&hash=${hash}`;
    const res = await httpFetch(url, {
      method: 'GET',
      headers: { ...HEADERS, Referer: 'http://www.kugou.com/' },
      timeout: 10000,
    }).promise;
    body = res.body;
    if (!body || body.err_code !== 0) return null;
    return body.data ?? null;
  }
  return body?.data?.info ?? null;
}

/** 歌词 */
export async function getLyric(songInfo: any): Promise<string> {
  const hash = songInfo.hash || songInfo.hash320;
  if (!hash) throw new Error('kg: missing hash');
  const url =
    `http://m.kugou.com/app/i/krc.php?cmd=100&keyword=${encodeURIComponent(hash)}` +
    `&timelength=1&d=0&hash=${encodeURIComponent(hash)}`;
  const { body } = await httpFetch(url, {
    method: 'GET',
    headers: { Referer: 'http://m.kugou.com/' },
    responseType: 'text',
    timeout: 10000,
  }).promise;
  const text = typeof body === 'string' ? body : String(body ?? '');
  return text;
}

/** 封面(按需) */
export async function getPic(songInfo: any): Promise<string> {
  if (songInfo.pic) return songInfo.pic;
  const info = await getSongInfoByHash(songInfo.hash, songInfo.albummid);
  return info?.img ?? '';
}

/** 歌单 */
export const songList = {
  async getTags(): Promise<any> {
    const url = 'http://mobilecdn.kugou.com/api/v3/tag/list?platform=2';
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: HEADERS,
      timeout: 10000,
    }).promise;
    const list = (body?.data?.info ?? []).map((t: any) => ({
      id: String(t.special_tag_id),
      name: t.special_tag_name,
      list: [],
    }));
    return { list };
  },

  async getList(info: any): Promise<any> {
    let url: string;
    if (info.type === 'yy' && info.category) {
      url =
        `http://mobilecdn.kugou.com/api/v3/rank/special?format=json&version=9108&t=${info.category}` +
        `&page=${info.page}&pagesize=${info.limit}`;
    } else {
      url =
        `http://mobilecdn.kugou.com/api/v3/special/song?format=json&platform=2&id=${info.id}` +
        `&page=${info.page}&pagesize=${info.limit}`;
    }
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: HEADERS,
      timeout: 10000,
    }).promise;
    const inValid = body?.err_code !== 0;
    if (inValid) return { isEnd: true, list: [] };
    const infoList = body?.data?.info ?? [];
    if (info.type === 'yy') {
      return {
        isEnd: infoList.length < info.limit,
        list: infoList.map((s: any) => ({
          id: String(s.special_id),
          name: s.special_name,
          cover: s.img,
          playCount: formatPlayCount(s.play_count),
          platform: 'kg',
        })),
      };
    }
    return {
      isEnd: infoList.length < info.limit,
      list: infoList.map((s: any) => ({
        id: String(s.special_id),
        name: s.special_name,
        cover: s.img,
        playCount: formatPlayCount(s.play_count),
        platform: 'kg',
      })),
    };
  },

  async getDetail(info: any): Promise<any> {
    const url =
      `http://mobilecdn.kugou.com/api/v3/special/info?platform=2&id=${info.id}` +
      `&pagesize=100&page=1`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: HEADERS,
      timeout: 10000,
    }).promise;
    const d = body?.data ?? {};
    const list = (d.songs ?? []).map((raw: any) => ({
      singer: singerName([raw.singername]),
      name: decodeName(raw.songname),
      albumName: decodeName(raw.album_name),
      interval: formatPlayTime(raw.duration),
      songmid: String(raw.album_id),
      musicId: String(raw.album_id),
      hash: raw.hash,
      albummid: raw.album_id,
      pic: '',
      source: 'kg',
    }));
    return {
      name: d.special_name,
      pic: d.img,
      playCount: d.play_count,
      list,
    };
  },
};

/** 排行榜 */
export const leaderboard = {
  async getBoards(): Promise<any> {
    const url =
      `http://mobilecdn.kugou.com/api/v3/rank/list?format=json&platform=2&version=9108&page=1` +
      `&pagesize=30&cuserid=0`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: HEADERS,
      timeout: 10000,
    }).promise;
    const list = (body?.data?.info ?? []).map((b: any) => ({
      id: String(b.rank_id),
      shortName: b.rank_name,
      name: b.rank_name,
      type: 'kg',
    }));
    return { list };
  },

  async getList(info: any): Promise<any> {
    const url =
      `http://mobilecdn.kugou.com/api/v3/rank/song?format=json&platform=2&version=9108&rankid=${info.id}` +
      `&page=${info.page}&pagesize=${info.limit}&cuserid=0`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: HEADERS,
      timeout: 10000,
    }).promise;
    const list = (body?.data?.info ?? []).map((raw: any) => ({
      singer: singerName([raw.singername]),
      name: decodeName(raw.songname),
      albumName: decodeName(raw.album_name),
      interval: formatPlayTime(raw.duration),
      songmid: String(raw.album_id),
      musicId: String(raw.album_id),
      hash: raw.hash,
      albummid: raw.album_id,
      pic: '',
      source: 'kg',
    }));
    return { isEnd: list.length < info.limit, list };
  },
};

/** 热搜(可选) */
export const hotSearch = {
  async getAll(): Promise<any> {
    const url = 'http://mobilecdn.kugou.com/api/v3/search/hot?format=json&cuserid=0';
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: HEADERS,
      timeout: 10000,
    }).promise;
    const list = (body?.data?.info ?? []).map((l: any) => l.keyword ?? '');
    return { list };
  },
};
