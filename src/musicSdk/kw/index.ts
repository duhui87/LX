/**
 * 酷我音乐 (kw) musicSdk —— 移植自 lxserver,只做元数据(搜索/歌词/歌单/榜单),不做直链解析。
 */

import { httpFetch } from '../request.js';
import { decodeName, formatPlayCount, formatPlayTime, singerName } from '../index.js';

const KUWO_SONG_INFO_URL = 'http://www.kuwo.cn/api/www/music/musicInfo?mid=';
const KUWO_SONG_INFO_HEADERS = {
  Referer: 'http://www.kuwo.cn/',
  csrf: '0',
};

interface KwSearchRawItem {
  NAME?: string;
  ARTIST?: string;
  ALBUM?: string;
  DURATION?: string;
  TIME?: string;
  MUSICRID?: string;
  DC_TARGETID?: string;
  web_albumpic_short?: string;
  web_albumpic?: string;
  albumid?: string;
}

/** 搜索 */
export const musicSearch = {
  async search(str: string, page: number, limit = 20): Promise<any> {
    const url =
      `http://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(str)}` +
      `&pn=0&rn=${limit}&uid=794762570&ver=kwplayer_9.2.2.1&vipver=1&show_copyright_off=1` +
      `&newver=1&ft=music&lplist=ft&n=10&plat=0&encoding=utf8&from=pc&json=true&musicid=&issame=1`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: { Referer: 'http://www.kuwo.cn/' },
      timeout: 10000,
    }).promise;
    try {
      const musicList: KwSearchRawItem[] = body?.musiclist ?? [];
      const list = musicList.map((raw) => {
        const match = raw.NAME?.match(/(.+)\s*$/);
        const name = decodeName(raw.NAME);
        return {
          singer: decodeName(raw.ARTIST),
          name,
          albumName: decodeName(raw.ALBUM),
          interval: raw.DURATION ?? raw.TIME,
          songmid: raw.MUSICRID?.replace('MUSIC_', ''),
          hash: raw.DC_TARGETID,
          albummid: raw.albumid,
          pic: raw.web_albumpic_short,
          source: 'kw',
          musicId: raw.MUSICRID?.replace('MUSIC_', ''),
          copyrightId: raw.DC_TARGETID,
          _raw: raw,
        };
      });
      return {
        isEnd: list.length < limit,
        list,
      };
    } catch {
      return { isEnd: true, list: [] };
    }
  },
};

/** 歌词 */
export async function getLyric(songInfo: any): Promise<string> {
  const mid = songInfo.songmid || songInfo.musicId;
  if (!mid) throw new Error('kw: missing songmid');
  const url = `http://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${mid}`;
  const { body } = await httpFetch(url, {
    method: 'GET',
    headers: { Referer: 'http://m.kuwo.cn/' },
    timeout: 10000,
  }).promise;
  const data = body?.data ?? {};
  const lrclist: Array<{ lineLyric?: string; time?: string }> = data.lrclist ?? [];
  if (!lrclist.length) {
    return data.lrclist?.length === 0 ? '' : (data.lrc ?? '');
  }
  const lrc = lrclist
    .map((l) => {
      const t = Math.floor(Number(l.time) || 0);
      const m = Math.floor(t / 60);
      const s = t % 60;
      return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.00]${l.lineLyric ?? ''}`;
    })
    .join('\n');
  return lrc;
}

/** 歌曲封面(按需) */
export async function getPic(songInfo: any): Promise<string> {
  const mid = songInfo.songmid || songInfo.musicId;
  if (mid) {
    const { body } = await httpFetch(KUWO_SONG_INFO_URL + mid, {
      method: 'GET',
      headers: KUWO_SONG_INFO_HEADERS,
      timeout: 10000,
    }).promise;
    const albumPic = body?.data?.albumpic;
    if (albumPic) return albumPic;
  }
  return songInfo.pic ?? songInfo.albumcover ?? '';
}

/** 歌单 */
export const songList = {
  async getTags(): Promise<any> {
    const url = 'http://www.kuwo.cn/api/www/playlist/getTagList?loginUid=0&loginSid=0';
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: { Referer: 'http://www.kuwo.cn/', csrf: '0' },
      timeout: 10000,
    }).promise;
    const list =
      body?.data?.tagList?.map((t: any) => ({
        id: String(t.id),
        name: t.name,
        list: t?.childs?.map((c: any) => ({ id: String(c.id), name: c.name })) ?? [],
      })) ?? [];
    return { list };
  },

  async getList(info: any): Promise<any> {
    const url =
      `http://www.kuwo.cn/api/www/playlist/getPlayListByTag?loginUid=0&loginSid=0` +
      `&tagId=${info.id}&pn=${info.page}&rn=${info.limit}&order=hot&httpsStatus=1`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: { Referer: 'http://www.kuwo.cn/', csrf: '0' },
      timeout: 10000,
    }).promise;
    const playLists = body?.data?.list ?? [];
    return {
      isEnd: (body?.data?.total ?? 0) <= info.page * info.limit,
      list: playLists.map((p: any) => ({
        id: String(p.id),
        name: p.name,
        cover: p.pic_300,
        playCount: formatPlayCount(p.listencnt),
        platform: 'kw',
      })),
    };
  },

  async getDetail(info: any): Promise<any> {
    const url = `http://www.kuwo.cn/api/www/playlist/playListInfo?pid=${info.id}`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: { Referer: 'http://www.kuwo.cn/', csrf: '0' },
      timeout: 10000,
    }).promise;
    const d = body?.data ?? {};
    const musicList = d.musicList ?? [];
    return {
      name: d.name,
      pic: d.pic_300 ?? d.pic,
      playCount: d.listencnt,
      list: musicList.map((raw: any) => ({
        singer: singerName(raw.artist),
        name: raw.name,
        albumName: raw.album,
        interval: raw.duration,
        songmid: String(raw.id),
        musicId: String(raw.id),
        hash: raw.score100,
        albummid: raw.albumId,
        pic: raw.albumpic,
        source: 'kw',
      })),
    };
  },
};

/** 排行榜 */
export const leaderboard = {
  async getBoards(): Promise<any> {
    const url =
      `http://www.kuwo.cn/api/www/bang/bang/bangMenu?loginUid=0&loginSid=0&bangId=17&pn=0&rn=20` +
      `&httpsStatus=1`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: { Referer: 'http://www.kuwo.cn/', csrf: '0' },
      timeout: 10000,
    }).promise;
    const rankData = body?.data?.list ?? [];
    const groups = rankData.filter((b: any) => b.klink === undefined || b.type === undefined);
    const kids: any[] = [];
    for (const g of groups) {
      if (Array.isArray(g.dataList)) kids.push(...g.dataList);
    }
    const list = kids.map((b: any) => ({
      id: String(b.bangId ?? b.id),
      shortName: b.shortName ?? b.name,
      name: b.name,
      type: 'kw',
      list: [],
    }));
    return { list };
  },

  async getList(info: any): Promise<any> {
    const url =
      `http://www.kuwo.cn/api/www/bang/bang/musicList?loginUid=0&loginSid=0&bangId=${info.id}` +
      `&pn=${info.page}&rn=${info.limit}&httpsStatus=1`;
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: { Referer: 'http://www.kuwo.cn/', csrf: '0' },
      timeout: 10000,
    }).promise;
    const musicList = body?.data?.musicList ?? [];
    return {
      isEnd: musicList.length < info.limit,
      list: musicList.map((raw: any) => ({
        singer: singerName(raw.artist),
        name: raw.name,
        albumName: raw.album,
        interval: formatPlayTime(raw.duration),
        songmid: String(raw.id),
        musicId: String(raw.id),
        hash: raw.score100,
        albummid: raw.albumId,
        pic: raw.albumpic,
        source: 'kw',
      })),
    };
  },
};

/** 热搜(可选) */
export const hotSearch = {
  async getAll(): Promise<any> {
    const url = 'http://www.kuwo.cn/api/www/search/searchKey?key=热搜榜&httpsStatus=1';
    const { body } = await httpFetch(url, {
      method: 'GET',
      headers: { Referer: 'http://www.kuwo.cn/', csrf: '0' },
      timeout: 10000,
    }).promise;
    const list = body?.data?.list ?? [];
    return { list: list.map((l: any) => l.searchWord ?? l.key ?? '') };
  },
};
