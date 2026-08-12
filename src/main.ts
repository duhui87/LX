/**
 * 插件入口:生命周期 onInit / onDeinit / onHTTPRequest。
 */

import { createRouter } from '@songloft/plugin-sdk';
import { RuntimeManager } from './engine/manager.js';
import { SourceManager } from './source/manager.js';
import { buildRouter } from './handlers/index.js';

const songloft: any = (globalThis as any).songloft;

let runtimeManager: RuntimeManager | null = null;
let sourceManager: SourceManager | null = null;
let router: any = null;
let initialized = false;

/** 确保 musicSdk 平台代码所需的全局(global/window) */
function ensureGlobals(): void {
  const g: any = globalThis;
  if (!g.window) g.window = g;
  if (!g.global) g.global = g;
}

export async function onInit(): Promise<void> {
  ensureGlobals();
  if (initialized) return;
  songloft?.log?.info('lxmusic plugin initializing...');

  runtimeManager = new RuntimeManager();
  sourceManager = new SourceManager(runtimeManager);
  await sourceManager.init();

  router = createRouter ? createRouter() : null;
  if (router) {
    buildRouter(router, {
      getRuntimeManager: () => runtimeManager,
      getSourceManager: () => sourceManager,
    });
  }

  initialized = true;
  songloft?.log?.info(
    `lxmusic plugin ready: loaded ${sourceManager.getRecords().filter((r) => r.ready).length} enabled source(s)`
  );
}

export async function onDeinit(): Promise<void> {
  if (runtimeManager) {
    try {
      await runtimeManager.destroyAll();
    } catch (e) {
      songloft?.log?.warn(`onDeinit destroyAll: ${(e as any)?.message}`);
    }
  }
  runtimeManager = null;
  sourceManager = null;
  router = null;
  initialized = false;
}

export async function onHTTPRequest(req: any): Promise<any> {
  try {
    // 未初始化时按需初始化
    if (!initialized) {
      await onInit();
    }
    if (typeof router === 'function') {
      return await router(req);
    }
    if (router && typeof router.handle === 'function') {
      return await router.handle(req);
    }
    if (router && typeof router.dispatch === 'function') {
      return await router.dispatch(req);
    }
    return fallbackResponse(404, 'no router');
  } catch (e: any) {
    songloft?.log?.error(`onHTTPRequest error: ${(e as any)?.message ?? e}`);
    return fallbackResponse(500, `internal error: ${(e as any)?.message ?? ''}`);
  }
}

/** 兜底响应:永远返回合法对象,避免 undefined 被上游退化成 200+空 body */
function fallbackResponse(statusCode: number, msg: string): any {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: statusCode, msg, data: null }),
  };
}

// QuickJS 需显式挂到 globalThis
(globalThis as any).onInit = onInit;
(globalThis as any).onDeinit = onDeinit;
(globalThis as any).onHTTPRequest = onHTTPRequest;
