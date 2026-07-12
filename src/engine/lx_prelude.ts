export const LX_PRELUDE_JS = `
(function() {
  globalThis.window = globalThis;
  globalThis.global = globalThis;

  const _eventHandlers = {};

  globalThis.lx = {
    currentScriptInfo: null,
    
    request(url, options, callback) {
      const method = (options.method || 'GET').toUpperCase();
      const headers = options.headers || {};
      let body = null;

      if (options.form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = Object.keys(options.form).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(options.form[k])).join('&');
      } else if (options.body) {
        body = typeof options.body === 'object' ? JSON.stringify(options.body) : options.body;
        if (typeof options.body === 'object' && !headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }

      fetch(url, { method, headers, body })
        .then(res => res.text().then(text => {
          let parsed = text;
          try { parsed = JSON.parse(text); } catch(_) {}
          const respHeaders = {};
          res.headers.forEach((v, k) => { respHeaders[k] = v; });
          callback(null, { statusCode: res.status, statusMessage: "", headers: respHeaders, body: parsed }, parsed);
        }))
        .catch(err => callback(err, null, null));
    },

    send(eventName, data) {
      if (typeof __go_send === 'function') {
        __go_send(eventName, JSON.stringify(data));
      }
    },

    on(eventName, handler) {
      _eventHandlers[eventName] = handler;
    },

    _dispatch(reqId, eventName, dataJSON) {
      const data = JSON.parse(dataJSON);
      const handler = _eventHandlers[eventName];
      if (!handler) {
        this.send('dispatchError', { id: reqId, error: 'No handler for ' + eventName });
        return;
      }

      try {
        const result = handler(data);
        if (result && typeof result.then === 'function') {
          result.then(
            res => this.send('dispatchResult', { id: reqId, result: res }),
            err => this.send('dispatchError', { id: reqId, error: err.message || err })
          );
        } else {
          this.send('dispatchResult', { id: reqId, result: result });
        }
      } catch(e) {
        this.send('dispatchError', { id: reqId, error: e.message });
      }
    },

    utils: {
      crypto: {
        md5(str) { return globalThis.crypto?.polyfill?.md5?.(str) || ""; }
      }
    }
  };
})();
`;
