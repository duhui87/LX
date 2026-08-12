/**
 * musicSdk 顶层 facade。
 * 导出 { sources, kw, kg, tx, wy, mg }。
 * 每平台暴露 musicSearch.search / getLyric / songList / leaderboard 等方法
 * (接口形态照 lxserver 各 index.js)。
 */

import * as kw from './kw/index.js';
import * as kg from './kg/index.js';
import * as tx from './tx/index.js';
import * as wy from './wy/index.js';
import * as mg from './mg/index.js';

export const sources: Array<{ id: string; name: string }> = [
  { id: 'kw', name: '酷我音乐' },
  { id: 'kg', name: '酷狗音乐' },
  { id: 'tx', name: 'QQ音乐' },
  { id: 'wy', name: '网易云音乐' },
  { id: 'mg', name: '咪咕音乐' },
];

export const musicSdk = { kw, kg, tx, wy, mg };

export type MusicSdkPlatforms = {
  kw: typeof kw;
  kg: typeof kg;
  tx: typeof tx;
  wy: typeof wy;
  mg: typeof mg;
};

export const kwSdk = kw;
export const kgSdk = kg;
export const txSdk = tx;
export const wySdk = wy;
export const mgSdk = mg;
