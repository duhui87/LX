import { createRouter, createSearchHandler, createMusicUrlHandler, jsonResponse } from '@songloft/plugin-sdk';

// 1. 初始化生命周期
globalThis.onInit = async function() {
  console.log("Songloft lxmusic plugin initialized.");
};

// 2. 释放生命周期
globalThis.onDeinit = async function() {
  console.log("Songloft lxmusic plugin deinitialized.");
};

// 3. 构建核心契约路由
const router = createRouter();

// 机制 A: 集成搜索契约
// 修复：根据 SDK 签名，传入的三个参数为扁平参数，且直接返回数组[cite: 1]
router.post('/api/search', createSearchHandler({
  async search(keyword: string, page?: number, pageSize?: number) {
    // 提示：此处后续可以接入移植的 musicSdk facade[cite: 1]
    return []; 
  }
}));

// 机制 B: 直链解析契约
router.post('/api/music/url', createMusicUrlHandler({
  async resolveUrl(sourceData: any) {
    return {
      url: "",
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    };
  },
  async fallbackSearch(hint: any) {
    return null;
  }
}));

// 4. QuickJS 全局 HTTP 请求网关与强制安全防崩溃兜底[cite: 1]
globalThis.onHTTPRequest = async function(request: any) {
  try {
    const response = await router.handle(request);
    if (!response) {
      return jsonResponse({ code: 404, msg: "Route not found", data: null }, 404);
    }
    return response;
  } catch (err: any) {
    // 拦截沙箱内部未捕获异常，防止宿主退化成 200 + 空 body 导致上游系统崩溃[cite: 1]
    return jsonResponse({
      code: 500,
      msg: err.message || "Sandboxed runtime error",
      data: null
    }, 500);
  }
};
