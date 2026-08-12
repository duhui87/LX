/**
 * 洛雪音源 前端(vanilla JS, Material 风格,跟随宿主主题)。
 * 调用本插件的 JSON API:相对路径 ../api(从 /static/ 上溯到 /api)。
 */
(function () {
  'use strict';

  const API = '../api';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    sources: [],            // 音源管理:内置平台 + 导入音源
    importQueue: new Map(), // 音乐库导入队列
    lib: { platform: 'kw', type: 'leaderboard', boards: [], tags: [], subId: '' },
  };

  async function api(path, options) {
    const res = await fetch(API + path, {
      method: options?.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = { code: res.status, msg: res.statusText, data: null }; }
    return data;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function banner(msg, kind) {
    const el = $('#banner');
    if (!msg) { el.classList.add('hidden'); return; }
    el.textContent = msg;
    el.style.color = kind === 'error' ? 'var(--danger)' : 'var(--warn)';
    el.classList.remove('hidden');
  }

  /* ================= Tab 切换 ================= */
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      $$('.tabpanel').forEach((p) => {
        p.classList.toggle('active', p.id === 'tab-' + tab.dataset.tab);
      });
    });
  });

  /* ================= 平台/音源加载 ================= */
  async function loadMeta() {
    const meta = await api('/meta');
    const list = meta?.data?.sources || [];
    state.sources = list;
    const searchSel = $('#search-source');
    searchSel.innerHTML = list.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    const libPlat = $('#lib-platform');
    libPlat.innerHTML = list.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  }

  /* ================= Tab: 搜索 ================= */
  $('#btn-search').addEventListener('click', doSearch);
  $('#search-keyword').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  async function doSearch() {
    const keyword = $('#search-keyword').value.trim();
    if (!keyword) return;
    const source = $('#search-source').value;
    const quality = $('#search-quality').value;
    const btn = $('#btn-search');
    btn.classList.add('loading');
    const data = await api('/search', {
      method: 'POST',
      body: { keyword, source_id: source, quality, page: 1, page_size: 20 },
    });
    btn.classList.remove('loading');
    const results = data?.results || [];
    renderSearchResults(results, source, quality);
  }

  function renderSearchResults(results, source, quality) {
    const box = $('#search-result');
    if (!results.length) { box.innerHTML = '<div class="empty">未找到结果</div>'; return; }
    box.innerHTML = results.map((r, i) => {
      const dur = fmtTime(r.duration);
      return `<div class="item">
        <div class="main"><div class="title">${esc(r.title)}</div>
        <div class="sub">${esc(r.artist)} · ${esc(r.album || '单曲')} · ${dur}</div></div>
        <div class="dur">${esc(source)}</div>
        <div class="actions">
          <button class="btn small" data-action="play" data-i="${i}">试听</button>
          <button class="btn small primary" data-action="importq" data-i="${i}">加入队列</button>
        </div>
      </div>`;
    }).join('');
    // 绑定按钮
    const data = results;
    box.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const i = +btn.dataset.i;
        const r = data[i];
        const songItem = { platform: source, quality, ...r };
        if (btn.dataset.action === 'play') trial(songItem);
        else addToQueue(songItem);
      });
    });
  }

  function fmtTime(sec) {
    sec = Number(sec) || 0;
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  async function trial(songItem) {
    let sd = songItem.source_data;
    if (typeof sd === 'string') sd = JSON.parse(sd);
    const data = await api('/direct/music/url', { method: 'POST', body: { songInfo: sd?.songInfo, quality: songItem.quality || '128k' } });
    const url = data?.data?.url;
    if (!url) { banner('解析失败:' + (data?.msg || '未知'), 'error'); return; }
    banner('', '');
    window.open(url, '_blank');
  }

  /* ================= 导入队列 ================= */
  function addToQueue(songItem) {
    const key = songItem.source_data;
    state.importQueue.set(key, songItem);
    renderQueue();
  }

  function removeFromQueue(key) { state.importQueue.delete(key); renderQueue(); }

  function renderQueue() {
    const box = $('#import-queue');
    const arr = Array.from(state.importQueue.entries());
    if (!arr.length) { box.innerHTML = '<div class="empty">勾选歌曲后加入导入队列</div>'; return; }
    box.innerHTML = arr.map(([key, r]) => {
      return `<div class="item"><div class="main"><div class="title">${esc(r.title)}</div>
      <div class="sub">${esc(r.artist)} · ${esc(r.platform)}</div></div>
      <div class="actions"><button class="btn small danger" data-rm="${esc(key)}">移除</button></div></div>`;
    }).join('');
    box.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => removeFromQueue(b.dataset.rm)));
  }

  $('#btn-import-all').addEventListener('click', async () => {
    const songs = Array.from(state.importQueue.values()).map((r) => ({
      platform: r.platform,
      quality: r.quality,
      title: r.title,
      artist: r.artist,
      album: r.album,
      duration: r.duration,
      cover_url: r.cover_url,
      song: parseSourceData(r.source_data),
    }));
    if (!songs.length) return;
    const btn = $('#btn-import-all');
    btn.classList.add('loading');
    const data = await api('/songs/import', { method: 'POST', body: { songs } });
    btn.classList.remove('loading');
    if (data?.code === 0) {
      banner(`已导入 ${data.data.imported} 首,失败 ${data.data.failed} 首`, 'ok');
      state.importQueue.clear();
      renderQueue();
    } else {
      banner('导入失败:' + (data?.msg || ''), 'error');
    }
  });

  function parseSourceData(sd) {
    if (typeof sd === 'string') { try { return JSON.parse(sd).songInfo || {}; } catch { return {}; } }
    return sd?.songInfo || {};
  }

  /* ================= Tab: 音源管理 ================= */
  $('#btn-import-url').addEventListener('click', importUrl);
  $('#source-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file, file.name);
    fetch(API + '/sources/import', { method: 'POST', body: form })
      .then((r) => r.json())
      .then((d) => {
        if (d?.code === 0) banner(`已导入 ${d.data.imported} 个音源,后台加载中...`, 'ok');
        else banner('导入失败:' + (d?.msg || ''), 'error');
        e.target.value = '';
        setTimeout(loadSources, 1500);
      })
      .catch((err) => banner('导入失败:' + err.message, 'error'));
  });

  async function importUrl() {
    const url = $('#source-url').value.trim();
    if (!url) return;
    const data = await api('/sources/import-url', { method: 'POST', body: { url } });
    if (data?.code === 0) banner('已导入音源,后台加载中...', 'ok');
    else banner('导入失败:' + (data?.msg || ''), 'error');
    setTimeout(loadSources, 1500);
  }

  async function loadSources() {
    const data = await api('/sources');
    const sources = data?.data?.sources || [];
    const batch = data?.data?.batch || {};
    renderSources(sources);
    renderBatch(batch);
    // 前端提示横幅:无已启用音源时提示无法播放
    const hasReady = sources.some((s) => s.ready && s.enabled);
    if (!hasReady) {
      banner('尚未启用可用音源:可搜索/浏览元数据,但导入的歌曲将无法解析播放 URL。', 'warn');
    } else {
      banner('', 'ok');
    }
  }

  function renderSources(sources) {
    const box = $('#source-list');
    if (!sources.length) { box.innerHTML = '<div class="empty">尚未导入任何音源</div>'; return; }
    box.innerHTML = sources.map((s) => {
      const plat = s.sources ? Object.keys(s.sources).join(', ') : (s.loading ? '加载中...' : '未就绪');
      return `<div class="item"><div class="main">
        <div class="title">${esc(s.name)} ${s.ready ? '' : '<span class="dur">(未就绪)</span>'}</div>
        <div class="sub">v${esc(s.version || '0')} · ${esc(s.author || '未知作者')} · 支持:${esc(plat)}</div>
        ${s.error ? `<div class="sub" style="color:var(--danger)">错误:${esc(s.error)}</div>` : ''}
      </div>
      <div class="actions">
        <button class="btn small" data-toggle="${esc(s.id)}">${s.enabled ? '禁用' : '启用'}</button>
        <button class="btn small danger" data-del="${esc(s.id)}">删除</button>
      </div></div>`;
    }).join('');
    box.querySelectorAll('[data-toggle]').forEach((b) =>
      b.addEventListener('click', async () => {
        await api('/sources/toggle', { method: 'PUT', body: { id: b.dataset.toggle } });
        loadSources();
      })
    );
    box.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('确定删除该音源?')) return;
        await api('/sources?id=' + encodeURIComponent(b.dataset.del), { method: 'DELETE' });
        loadSources();
      })
    );
  }

  function renderBatch(batch) {
    const box = $('#batch-progress');
    if (!batch?.loading) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const pct = batch.total ? Math.round((batch.done / batch.total) * 100) : 0;
    box.querySelector('#batch-bar').style.width = pct + '%';
    box.querySelector('#batch-text').textContent =
      `正在加载音源 ${batch.done}/${batch.total}` + (batch.current ? `: ${batch.current}` : '');
  }

  /* ================= Tab: 音乐库 ================= */
  $('#btn-browse').addEventListener('click', browse);
  $('#lib-platform').addEventListener('change', () => { state.lib.platform = $('#lib-platform').value; loadSubOptions(); });
  $('#lib-listtype').addEventListener('change', () => { state.lib.type = $('#lib-listtype').value; loadSubOptions(); });

  async function loadSubOptions() {
    const type = state.lib.type;
    const platform = state.lib.platform;
    const sel = $('#lib-sub');
    if (type === 'leaderboard') {
      const d = await api('/leaderboard/boards?source_id=' + platform);
      state.lib.boards = d?.data?.list || [];
      sel.innerHTML = state.lib.boards.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
    } else {
      const d = await api('/songlist/tags?source_id=' + platform);
      const tags = d?.data?.list || [];
      sel.innerHTML = tags.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    }
  }

  async function browse() {
    const type = state.lib.type;
    const platform = state.lib.platform;
    const subId = $('#lib-sub').value;
    let list = [];
    if (type === 'leaderboard') {
      const d = await api(`/leaderboard/list?source_id=${platform}&id=${encodeURIComponent(subId)}&page=1&limit=20`);
      list = d?.data?.list || [];
    } else {
      const d = await api(`/songlist/detail?source_id=${platform}&id=${encodeURIComponent(subId)}`);
      list = d?.data?.list || [];
    }
    // 结果适配:排行榜返回 list,歌单 detail 返回 list
    const songs = list;
    renderLibResults(songs, platform);
  }

  function renderLibResults(songs, platform) {
    const box = $('#lib-result');
    if (!songs.length) { box.innerHTML = '<div class="empty">无歌曲</div>'; return; }
    box.innerHTML = songs.map((s, i) => {
      return `<div class="item"><div class="main"><div class="title">${esc(s.name)}</div>
      <div class="sub">${esc(s.singer || s.singerName || '')} · ${esc(s.albumName || '')}</div></div>
      <div class="dur">${fmtTime(s.interval || s.duration)}</div>
      <div class="actions"><button class="btn small primary" data-add="${i}">加入队列</button></div></div>`;
    }).join('');
    box.querySelectorAll('[data-add]').forEach((b) => {
      b.addEventListener('click', () => {
        const s = songs[+b.dataset.add];
        addToQueue({
          platform,
          quality: '128k',
          title: s.name, artist: s.singer || '', album: s.albumName || '',
          duration: Number(s.interval) || 0, cover_url: s.pic || '',
          source_data: JSON.stringify({ platform, quality: '128k', songInfo: s }),
        });
      });
    });
  }

  /* ================= init ================= */
  (async () => {
    await loadMeta();
    await loadSources();
    await loadSubOptions();
    setInterval(() => { if ($('#tab-source').classList.contains('active')) loadSources(); }, 3000);
  })();
})();
