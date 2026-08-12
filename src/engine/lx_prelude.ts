/**
 * LX_PRELUDE:注入每个子 VM 的初始化代码字符串。
 * 构造洛雪自定义音源脚本期望的全局 `lx`(遵循 lx-music-desktop 自定义源 API)。
 */

export const LX_PRELUDE = `
(globalThis.window = globalThis), (globalThis.global = globalThis);
var __lx_listeners = {};
var __LX = (globalThis.lx = {});

__LX.utils = {
  buffer: {
    ByteToHex: function (bytes) {
      return Array.from(bytes)
        .map(function (b) {
          return ((b & 0xff).toString(16)).padStart(2, '0');
        })
        .join('');
    },
    HexToByte: function (hex) {
      var out = new Uint8Array(hex.length / 2);
      for (var i = 0; i < hex.length; i += 2) {
        out[i / 2] = parseInt(hex.substr(i, 2), 16);
      }
      return out;
    },
  },
  crypto: {
    md5: function (str) {
      return (typeof crypto !== 'undefined' && crypto.md5) ? crypto.md5(String(str)) : '';
    },
    md5Hex: function (str) { return this.md5(str); },
    aesEncrypt: function (data, key, iv) {
      return crypto.aesEncrypt ? crypto.aesEncrypt(String(data), String(key), String(iv || '')) : '';
    },
    aesDecrypt: function (data, key, iv) {
      return crypto.aesDecrypt ? crypto.aesDecrypt(String(data), String(key), String(iv || '')) : '';
    },
    rsaEncrypt: function (data, pub) {
      return crypto.rsaEncrypt ? crypto.rsaEncrypt(String(data), String(pub)) : '';
    },
    randomBytes: function (n) {
      return crypto.randomBytes ? crypto.randomBytes(n) : '';
    },
    hmacSHA1: function (k, d) { return crypto.hmacSha1 ? crypto.hmacSha1(String(k), String(d)) : ''; },
    hmacSHA256: function (k, d) { return crypto.hmacSha256 ? crypto.hmacSha256(String(k), String(d)) : ''; },
    sha1: function (d) { return crypto.sha1 ? crypto.sha1(String(d)) : ''; },
  },
  zlib: {
    inflate: function (data) {
      return zlib && zlib.inflate ? Promise.resolve(zlib.inflate(data)) : Promise.resolve(String(data || ''));
    },
    deflate: function (data) {
      return zlib && zlib.deflate ? Promise.resolve(zlib.deflate(data)) : Promise.resolve(String(data || ''));
    },
  },
};

__LX.send = function (eventName, data) {
  var dataJson = typeof data === 'string' ? data : JSON.stringify(data ?? null);
  if (eventName === 'inited' && data && data.sources) {
    __LX.__sources = data.sources;
  }
  try {
    __go_send(eventName, dataJson);
  } catch (e) {
    // 忽略 send 抛错
  }
  return true;
};

__LX.on = function (eventName, handler) {
  if (!__lx_listeners[eventName]) __lx_listeners[eventName] = [];
  __lx_listeners[eventName].push(handler);
  return true;
};

__LX._dispatch = function (reqId, eventName, dataJSON) {
  var data = typeof dataJSON === 'string' ? JSON.parse(dataJSON) : (dataJSON ?? null);
  var handlers = __lx_listeners[eventName] || [];
  var watchdogSet = false;
  var watchdog = setTimeout(function () {
    watchdogSet = false;
    try {
      __go_send('dispatchError', JSON.stringify({ id: reqId, error: 'timeout' }));
    } catch (e) {}
  }, 18000);

  function settle(fn, payload) {
    if (!watchdogSet) return;
    watchdogSet = false;
    clearTimeout(watchdog);
    try {
      __go_send(fn, JSON.stringify(payload));
    } catch (e) {}
  }

  if (!handlers.length) {
    try {
      __go_send('dispatchError', JSON.stringify({ id: reqId, error: 'no handler' }));
    } catch (e) {}
    return;
  }
  watchdogSet = true;
  var lastHandler = handlers[handlers.length - 1];
  var settleSeen = false;
  function finalSettle(result) {
    if (settleSeen) return;
    settleSeen = true;
    settle('dispatchResult', { id: reqId, result: result });
  }
  function finalError(err) {
    if (settleSeen) return;
    settleSeen = true;
    settle('dispatchError', { id: reqId, error: String((err && err.message) || err) });
  }
  (function run(i) {
    if (i >= handlers.length) {
      finalError('no settle');
      return;
    }
    var r;
    try {
      r = handlers[i](data, {
        send: __LX.send,
        on: __LX.on,
      });
    } catch (e) {
      finalError(e);
      return;
    }
    if (r && typeof r.then === 'function') {
      r.then(function (v) { finalSettle(v); }, function (e) { finalError(e); });
    } else if (i === handlers.length - 1) {
      finalSettle(r);
    } else {
      run(i + 1);
    }
  })(0);
};

__LX.request = function (url, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }
  options = options || {};
  var method = (options.method || 'GET').toUpperCase();
  var headers = Object.assign({}, options.headers || {});
  var body;
  var formData;

  if (options.form && typeof options.form === 'object') {
    body = Object.keys(options.form)
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(String(options.form[k] ?? '')); })
      .join('&');
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (options.body != null) {
    if (typeof options.body === 'string') {
      body = options.body;
    } else {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      body = JSON.stringify(options.body);
    }
  } else if (options.formData) {
    var fd = options.formData;
    if (typeof fd === 'object' && fd.getBoundary && fd.getHeaders) {
      // 兼容某种 form-data 实例
      formData = true;
      try { body = fd.getBuffer && fd.getBuffer(); headers = Object.assign(headers, fd.getHeaders()); } catch (e) { body = undefined; }
    }
  }

  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = setTimeout(function () {
    if (controller) controller.abort();
    if (callback) {
      try { callback(new Error('timeout')); } catch (e) {}
    }
  }, options.timeout || 15000);

  fetch(url, {
    method: method,
    headers: headers,
    body: body,
    signal: controller ? controller.signal : undefined,
  })
    .then(function (res) {
      clearTimeout(timer);
      return res.arrayBuffer().then(function (buf) {
        var text = new TextDecoder('utf-8').decode(buf);
        var parsedBody = text;
        try {
          var cont = res.headers.get('content-type') || '';
          if (cont.indexOf('json') >= 0 || (/^[\\[\\{]/).test(text.trim())) {
            parsedBody = JSON.parse(text);
          }
        } catch (e) { /* keep text */ }
        var statusMessage = res.statusText;
        var statusCode = res.status;
        if (callback) {
          callback(
            null,
            { statusCode: statusCode, statusMessage: statusMessage, headers: {}, body: parsedBody },
            parsedBody
          );
        }
      });
    })
    .catch(function (err) {
      clearTimeout(timer);
      if (callback) {
        try { callback(err); } catch (e) {}
      }
    });

  return {
    abort: function () {
      clearTimeout(timer);
      if (controller) controller.abort();
      if (callback) { try { callback(new Error('abort')); } catch (e) {} }
    },
  };
};

__LX.currentScriptInfo = null;
__LX.__sources = null;
`;

/** 注入 currentScriptInfo 的代码片段 */
export function injectScriptInfo(scriptInfo: any): string {
  return `globalThis.lx && (globalThis.lx.currentScriptInfo = ${JSON.stringify(scriptInfo)});`;
}

/** 构造一次 dispatch(请求 URL 解析)的代码 */
export function buildDispatchCode(reqId: string, eventName: string, dataJson: string): string {
  return `globalThis.lx._dispatch(${JSON.stringify(reqId)}, ${JSON.stringify(eventName)}, ${JSON.stringify(dataJson)});`;
}

/** 构造音源脚本初始化代码(注入元数据 + 运行脚本) */
export function buildInitCode(script: string, scriptInfo: any): string {
  return `${injectScriptInfo(scriptInfo)}\n;(function(){\n${script}\n})();`;
}
