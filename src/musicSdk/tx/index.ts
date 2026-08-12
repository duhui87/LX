/**
 * QQ音乐 (tx) musicSdk —— 移植自 lxserver,只做元数据(搜索/歌词/歌单/榜单)。
 */

import { httpFetch } from '../request.js';
import { get, decodeName, formatPlayCount, singerName } from '../index.js';

const SEARCH_URL = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp';
const LYRIC_URL = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg';
const SONG_LIST_URL = 'https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg';
const LEADERBOARD_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://y.qq.com/',
};

/** 搜索 */
export const musicSearch = {
  async search(str: string, page: number, limit = 20): Promise<any> {
    const url =
      `${SEARCH_URL}?_=${Date.now()}&format=json&p=${page}&n=${limit}&w=${encodeURIComponent(str)}` +
      `&cr=1&aggr=1&lossless=1&ct=24&cv=0`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: HEADERS,
      timeout: 10000,
    }).promise;
    const data = body?.data ?? {};
    const song = data.song ?? {};
    const list: any[] = [];
    const items = song.list ?? [];
    for (const raw of items) {
      const albumMid = raw.albummid ?? '';
      const album = raw.albumname ?? '';
      list.push({
        singer: singerName((raw.singer ?? []).map((s: any) => s.name)),
        name: raw.songname ?? '',
        albumName: album,
        interval: String(raw.interval),
        songmid: raw.songmid,
        albummid: albumMid,
        strMediaMid: raw.strmediamid ?? albumMid,
        pic: albumMid
          ? `https://y.gtimg.cn/music/photo_new/T002R68x68M000${albumMid}.jpg`
          : '',
        source: 'tx',
        musicId: raw.songmid,
        copyrightId: raw.songmid,
      });
    }
    return {
      isEnd: (song.curnum ?? list.length) < limit,
      list,
    };
  },
};

/** 歌词 */
export async function getLyric(songInfo: any): Promise<string> {
  const mid = songInfo.songmid || songInfo.musicId;
  if (!mid) throw new Error('tx: missing songmid');
  const url = `${LYRIC_URL}?songmid=${encodeURIComponent(mid)}&format=json&nobase64=1`;
  const { body } = await httpFetch(url, {
    method: 'GET',
    headers: HEADERS,
    timeout: 10000,
  }).promise;
  return body?.lyric ?? '';
}

/** 封面(按需) */
export async function getPic(songInfo: any): Promise<string> {
  const mid = songInfo.albummid ?? songInfo.albumMid;
  if (!mid) return '';
  return `https://y.gtimg.cn/music/photo_new/T002R500x500M000${mid}.jpg`;
}

/** 歌单 */
export const songList = {
  async getTags(): Promise<any> {
    const msg =
      '{"comm":{"ct":23,"cv":0},"playlist_tags":{"method":"twv.zone.tag.get","param":{"categoryId":10000000},"module":"music.playlist.PlayListPlazaServer"}}';
    const { body } = await httpFetch(LEADERBOARD_URL, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: msg,
      timeout: 10000,
    }).promise;
    const tags: any[] = [];
    const cats = get(body, 'playlist_tags.data.v_category', []);
    for (const c of cats) {
      const children = (c.v_item ?? c.vall_item ?? []).map((v: any) => ({
        id: String(v.v_id ?? v.id),
        name: v.v_name ?? v.name,
      }));
      tags.push({ id: String(c.v_id ?? c.id), name: c.v_name ?? c.name, list: children });
    }
    return { list: tags };
  },

  async getList(info: any): Promise<any> {
    const msg = JSON.stringify({
      comm: { ct: 23, cv: 0 },
      playlist: {
        method: 'twv.playlist.simple.get',
        param: { id: info.id, version: 8, page: info.page, perpage: info.limit },
        module: 'music.musicasset.PlaylistServer',
      },
    });
    const { body } = await httpFetch(LEADERBOARD_URL, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: msg,
      timeout: 10000,
    }).promise;
    const p = get(body, 'playlist.data', {});
    const list = (get(p, 'videolist', []) || get(p, 'songlist', []) || []).map((s: any) => ({
      id: String(s.tid ?? s.dissid),
      name: s.tname ?? s.diss_name,
      cover: `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.pic_mid ?? ''}.jpg`,
      playCount: formatPlayCount(s.listen_num),
      platform: 'tx',
    }));
    return { isEnd: get(p, 'curpage', 1) >= get(p, 'totalpage', 999), list };
  },

  async getDetail(info: any): Promise<any> {
    const msg = JSON.stringify({
      comm: { ct: 23, cv: 0 },
      playlist: {
        method: 'twv.playlist.get',
        param: { id: info.id, cmd: 1 },
        module: 'music.musicasset.PlaylistServer',
      },
    });
    const { body } = await httpFetch(LEADERBOARD_URL, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: msg,
      timeout: 10000,
    }).promise;
    const p = get(body, 'playlist.data', {});
    const list = (get(p, 'musiclist', []) || []).map((raw: any) => ({
      singer: singerName((raw.singer ?? []).map((s: any) => s.name)),
      name: raw.name ?? '',
      albumName: raw.album?.name ?? '',
      interval: String(raw.interval ?? 0),
      songmid: raw.mid,
      strMediaMid: raw.strMediaMid ?? raw.mid,
      albummid: raw.album?.mid ?? '',
      pic: raw.album?.mid
        ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${raw.album.mid}.jpg`
        : '',
      source: 'tx',
      musicId: raw.mid,
    }));
    return {
      name: get(p, 'dirinfo.title', ''),
      pic: get(p, 'dirinfo.pic_mid', '')
        ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${get(p, 'dirinfo.pic_mid')}.jpg`
        : '',
      playCount: get(p, 'dirinfo.visitnum', 0),
      list,
    };
  },
};

/** 排行榜 */
export const leaderboard = {
  async getBoards(): Promise<any> {
    const msg = JSON.stringify({
      comm: { ct: 23, cv: 0 },
      rankList: {
        method: 'get_rank_list',
        param: { page: 1, limit: 30, period: 0 },
        module: 'music.toplist.ToplistInfoServer',
      },
    });
    const { body } = await httpFetch(LEADERBOARD_URL, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: msg,
      timeout: 10000,
    }).promise;
    const list = get(body, 'rankList.data.group.0.toplist', []).map((b: any) => ({
      id: String(b.id),
      shortName: b.title ?? b.name,
      name: b.title ?? b.name,
      type: 'tx',
    }));
    return { list };
  },

  async getList(info: any): Promise<any> {
    const msg = JSON.stringify({
      comm: { ct: 23, cv: 0 },
      rankList: {
        method: 'get_rank_detail',
        param: { topId: info.id, page: info.page, num: info.limit },
        module: 'music.toplist.ToplistInfoServer',
      },
    });
    const { body } = await httpFetch(LEADERBOARD_URL, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: msg,
      timeout: 10000,
    }).promise;
    const p = get(body, 'rankList.data', {});
    const list = (p.song ?? []).map((raw: any) => ({
      singer: singerName((raw.singer ?? []).map((s: any) => s.name)),
      name: raw.name ?? '',
      albumName: raw.album?.name ?? '',
      interval: String(raw.interval ?? 0),
      songmid: raw.mid,
      strMediaMid: raw.file?.strMediaMid ?? raw.mid,
      albummid: raw.album?.mid ?? '',
      pic: raw.album?.mid
        ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${raw.album.mid}.jpg`
        : '',
      source: 'tx',
      musicId: raw.mid,
    }));
    return { isEnd: list.length < info.limit, list };
  },
};

/** 热搜(可选) */
export const hotSearch = {
  async getAll(): Promise<any> {
    const msg = JSON.stringify({
      comm: { ct: 23, cv: 0 },
      hotkey: {
        method: 'get_tab_list',
        param: { tab_id: 'qq.music.search.hot' },
        module: 'music.srch.HotkeyService',
      },
    });
    const { body } = await httpFetch(LEADERBOARD_URL, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: msg,
      timeout: 10000,
    }).promise;
    const list = get(body, 'hotkey.data.item', []).map((l: any) => l.value ?? l.key ?? '');
    return { list };
  },
};
