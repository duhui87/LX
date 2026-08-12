# Songloft「洛雪音源」插件 (lxmusic)

为 [Songloft](https://opencode.ai) 自托管音乐服务器实现的 JS 插件,分两条能力线(与 lxserver 设计同构):

- **机制 A —— 内置 musicSdk**:自带 **kw / kg / tx / wy / mg** 五平台元数据能力(搜索、歌词、歌单、排行榜),从 lxserver(`src/modules/utils/musicSdk/`)移植,不依赖任何外部音乐 SDK 包。
- **机制 B —— lxmusic 引擎**:通过 `songloft.jsenv` 子 VM,加载用户导入的「洛雪自定义音源」`.js` 脚本(社区脚本,常被 jsjiami 混淆),使其在独立 QuickJS VM 中运行,并由插件把歌曲解析成真实 CDN 播放 URL。

**关键分工**:musicSdk 只做元数据,**永不解析播放直链**;直链一律走机制 B 的自定义源脚本。未导入任何音源时,搜索/歌单/排行榜可正常使用,但导入的歌曲无法播放(前端会显示提示横幅)。

## 构建

```bash
npm install
npm run build    # 产物 dist/lxmusic.jsplugin.zip
npm run validate # 校验哈希
```

## 路由(前缀 /api/v1/jsplugin/lxmusic)

- 主程序契约: `POST /api/search`、`POST /api/music/url`
- 音源管理: `GET /api/sources`、`POST /api/sources/import`、`POST /api/sources/import-url`、`DELETE /api/sources`、`PUT /api/sources/toggle`
- 歌单/榜单: `GET /api/songlist/{tags,list,detail,...}`、`GET /api/leaderboard/{boards,list}`
- Direct: `POST /api/direct/music/url`、`GET /api/direct/lyric`
- 三合一: `POST /api/search/topone`
- 导入库: `POST /api/songs/import`
- 静态前端: `static/`

## 免责声明

> 本项目仅供**个人学习、研究**用途。内置 musicSdk 仅访问各音乐平台**公开**的搜索/歌词接口;音源脚本与其返回的音频数据均属**第三方版权内容**,本插件**不附带任何音源**。
>
> - 禁止用于商业用途;
> - 用户须自行负责导入/使用音源所产生的版权数据,并在使用后**自行清除**;
> - 请遵守当地法律法规与各平台服务条款。

## LICENSE

MIT,详见 [LICENSE](LICENSE)。
