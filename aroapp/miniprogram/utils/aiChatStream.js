/**
 * 智能助手（球球）SSE 流式客户端 —— 小程序侧。
 *
 * 接口与 Web 端完全一致（同一套后端契约）：
 *   POST /api/v1/twin/scan-assistant/ask/stream
 *   POST /api/v1/twin/scan-assistant/ask/greet/stream
 * 事件名：started / delta / interaction / tool / usage / done / error / navigate / download / image
 *
 * 【为什么不用 springRequest】那是对 wx.request 的一次性 Promise 封装，
 * 拿不到分块回调。这里必须开 enableChunked + onChunkReceived（基础库 2.20.2+），
 * 才能边收边渲染。
 *
 * 【为什么手写 UTF-8 解码】小程序没有 TextDecoder；wx.arrayBufferToBase64
 * 按块转换会在中文正好被切到两块中间时出乱码。这里把跨块的不完整尾字节留着，
 * 等下一块补全再解。
 */

const envConfig = require('./envConfig.js');
const springAuth = require('./springAuth.js');

const TOKEN_KEY = 'springToken';
const ASK_PATH = '/api/v1/twin/scan-assistant/ask/stream';
const GREET_PATH = '/api/v1/twin/scan-assistant/ask/greet/stream';

/** 增量 UTF-8 解码器：push(arrayBuffer) -> 本块解出的字符串 */
function createUtf8Decoder() {
  let pending = [];
  return function push(arrayBuffer) {
    const incoming = new Uint8Array(arrayBuffer);
    const buf = pending.length
      ? pending.concat(Array.prototype.slice.call(incoming))
      : Array.prototype.slice.call(incoming);
    let out = '';
    let i = 0;
    while (i < buf.length) {
      const b = buf[i];
      let need;
      if (b < 0x80) need = 1;
      else if ((b & 0xe0) === 0xc0) need = 2;
      else if ((b & 0xf0) === 0xe0) need = 3;
      else if ((b & 0xf8) === 0xf0) need = 4;
      else {
        i += 1; // 非法首字节，丢掉
        continue;
      }
      if (i + need > buf.length) break; // 尾部是半个字，等下一块
      let cp;
      if (need === 1) cp = b;
      else if (need === 2) cp = ((b & 0x1f) << 6) | (buf[i + 1] & 0x3f);
      else if (need === 3) cp = ((b & 0x0f) << 12) | ((buf[i + 1] & 0x3f) << 6) | (buf[i + 2] & 0x3f);
      else
        cp =
          ((b & 0x07) << 18) |
          ((buf[i + 1] & 0x3f) << 12) |
          ((buf[i + 2] & 0x3f) << 6) |
          (buf[i + 3] & 0x3f);
      out += String.fromCodePoint(cp);
      i += need;
    }
    pending = buf.slice(i);
    return out;
  };
}

/**
 * SSE 行解析。空行结束一个事件块。
 * 注意别在 `event:` 行就派发 —— data 行可能排在 event 行之后，提前 flush 会丢包。
 */
function createSseParser(handlers) {
  let buffer = '';
  let eventName = 'message';
  let dataLines = [];

  const dispatch = () => {
    if (dataLines.length === 0) {
      eventName = 'message';
      return;
    }
    const raw = dataLines.join('\n');
    dataLines = [];
    const name = eventName;
    eventName = 'message';

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      payload = { text: raw };
    }

    if (name === 'delta') {
      if (typeof payload.text === 'string' && handlers.onDelta) handlers.onDelta(payload.text);
    } else if (name === 'started') {
      if (handlers.onStarted) handlers.onStarted();
    } else if (name === 'interaction') {
      if (handlers.onInteraction) {
        handlers.onInteraction({
          token: String(payload.token == null ? '' : payload.token),
          kind: String(payload.kind == null ? '' : payload.kind),
          question: String(payload.question == null ? '' : payload.question),
          options: Array.isArray(payload.options) ? payload.options : [],
          multiSelect: payload.multiSelect === true,
        });
      }
    } else if (name === 'download') {
      // 助手算好了一次导出，交给**载体**用它自己的登录态去取文件（后端不签发公开下载链接）。
      // 与 web 面板同一个事件，只是那边渲染成卡片、这边存盘后 openDocument 打开。
      if (handlers.onDownload) {
        let dl = null;
        // 球球这条链把载荷包成 {payload:"<json>"}（适配层只搬不改），网关那条直接给对象 —— 两种都收
        if (payload && typeof payload.payload === 'string' && payload.payload) {
          try {
            dl = JSON.parse(payload.payload);
          } catch (e) {
            dl = null;
          }
        } else if (payload && typeof payload.kind === 'string') {
          dl = payload;
        }
        if (dl) handlers.onDownload(dl);
      }
    } else if (name === 'usage') {
      if (handlers.onUsage) handlers.onUsage(payload);
    } else if (name === 'navigate') {
      // 助手要「带用户去某个页面」（如「帮我打开报修申请」）。
      // path 是**小程序自己的页面路径**（服务端按载体查的，不是 web 的 /admin/...），
      // 这里原样交给载体去 wx.navigateTo / switchTab。
      if (handlers.onNavigate && typeof payload.path === 'string' && payload.path) {
        handlers.onNavigate({
          path: payload.path,
          label: typeof payload.label === 'string' ? payload.label : '',
        });
      }
    } else if (name === 'tool') {
      // 工具进度（running / done / failed）。**长任务在对话里可见全靠它** ——
      // 用户要能看出「还在跑」还是「已经黄了」，而不是干等（真机反馈过截图那种）。
      if (handlers.onTool) {
        handlers.onTool({
          name: typeof payload.name === 'string' ? payload.name : '',
          status: typeof payload.status === 'string' ? payload.status : '',
        });
      }
    } else if (name === 'image') {
      // 助手要在对话里放一张图。小程序**截不了自己的原生界面**，所以这条链上的图一律是
      // 服务端渲染好、按 exportId 取回来的（path 基本上是空的；真有 path 小程序也截不了）。
      if (handlers.onImage) {
        handlers.onImage({
          exportId: typeof payload.exportId === 'number' ? payload.exportId : undefined,
          label: typeof payload.label === 'string' ? payload.label : '',
          path: typeof payload.path === 'string' ? payload.path : '',
        });
      }
    } else if (name === 'done') {
      if (handlers.onDone) handlers.onDone(payload);
    } else if (name === 'error') {
      if (handlers.onError) handlers.onError(String(payload.message || '对话失败'));
    }
  };

  return function feed(chunk) {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line === '') dispatch();
      else if (line.indexOf('event:') === 0) eventName = line.slice(6).trim();
      else if (line.indexOf('data:') === 0) dataLines.push(line.slice(5).replace(/^\s+/, ''));
    }
  };
}

function httpMessage(status) {
  if (status === 401 || status === 403) return '登录已过期，请重新登录后再试';
  if (status === 404) return '对话服务未部署到这个环境';
  return '对话服务暂时不可用（HTTP ' + status + '）';
}

/** 网络层失败：wx 给的是 "request:fail TypeError: Failed to fetch" 这类给开发者看的东西 */
function networkMessage(err) {
  var raw = (err && err.errMsg) || '';
  if (/timeout/i.test(raw)) return '网络有点慢，请稍后再试';
  if (/domain|not in domain/i.test(raw)) return '当前环境未配置对话服务域名';
  return '连不上服务器，检查一下网络再试';
}

/**
 * 发一条流式请求。
 * handlers: { onStarted, onDelta, onInteraction, onUsage, onDone, onError }
 * @returns {{ abort: function }}
 */
function streamRequest(path, body, handlers) {
  const base = envConfig.getEffectiveApiBaseUrl().replace(/\/+$/, '');
  const token = wx.getStorageSync(TOKEN_KEY) || '';
  const decodeChunk = createUtf8Decoder();
  let settled = false;

  // 包一层：done 事件与 success 回调只会收尾一次
  const sink = {
    onStarted: handlers.onStarted,
    onDelta: handlers.onDelta,
    onInteraction: handlers.onInteraction,
    // ⚠ 这里是**白名单**：新加的事件不接上就等于没实现（dispatch 只认 sink 上的字段）
    onNavigate: handlers.onNavigate,
    onDownload: handlers.onDownload,
    onImage: handlers.onImage,
    onTool: handlers.onTool,
    onUsage: handlers.onUsage,
    onError(msg) {
      if (settled) return;
      settled = true;
      if (handlers.onError) handlers.onError(msg);
    },
    onDone(payload) {
      if (settled) return;
      settled = true;
      if (handlers.onDone) handlers.onDone(payload || {});
    },
  };

  const feed = createSseParser(sink);

  const task = wx.request({
    url: base + path,
    method: 'POST',
    data: body || {},
    enableChunked: true,
    responseType: 'arraybuffer',
    header: Object.assign(
      {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      token ? { Authorization: 'Bearer ' + token } : {},
    ),
    success(res) {
      // chunked 模式下 success 只表示流结束；错误看 statusCode
      if (res.statusCode && res.statusCode >= 400) {
        sink.onError(httpMessage(res.statusCode));
        return;
      }
      // 没收到 done 事件就断了（服务端异常关闭），也要让界面收尾
      sink.onDone({});
    },
    fail(err) {
      sink.onError(networkMessage(err));
    },
  });

  if (task && task.onChunkReceived) {
    task.onChunkReceived((res) => {
      try {
        feed(decodeChunk(res.data));
      } catch (e) {
        /* 单块解析失败不中断整条流 */
      }
    });
  } else {
    sink.onError('当前微信版本不支持流式对话，请升级微信后重试');
  }

  return {
    abort() {
      settled = true;
      try {
        task.abort();
      } catch (e) {
        /* ignore */
      }
    },
  };
}

/** 提问（可选带上历史会话、附图与附件） */
function streamAsk(question, handlers, options) {
  const opts = options || {};
  const body = { question: question };
  if (opts.sessionId) body.sessionId = opts.sessionId;
  if (opts.newSession) body.newSession = true;
  if (opts.images && opts.images.length) body.images = opts.images;
  // 附件与图片不同：服务端会解析并落库，之后追问仍看得见这份文件
  if (opts.spreadsheets && opts.spreadsheets.length) body.spreadsheets = opts.spreadsheets;
  // 载体标识：服务端靠**入口页面的 `/mp` 前缀**判别是不是小程序（contextPageSource）。
  // 小程序自己的路由是 /pages/...，所以要补上这个前缀 —— 少了它就当 web 处理，
  // 「帮我打开 X」会返回 web 的 /admin/... 路径，小程序跳不过去。
  body.contextPage = '/mp' + currentRoute();
  return streamRequest(ASK_PATH, body, handlers);
}

/** 当前页面路由（"/pages/xxx/index"）；拿不到返回空串（服务端按 web 兜底）。 */
function currentRoute() {
  try {
    const stack = getCurrentPages();
    const top = stack && stack.length ? stack[stack.length - 1] : null;
    const route = top && top.route ? String(top.route) : '';
    return route ? '/' + route.replace(/^\/+/, '') : '';
  } catch (e) {
    return '';
  }
}

/** 主动问好：打开抽屉时触发，不等用户先说话 */
function streamGreet(handlers) {
  return streamRequest(GREET_PATH, {}, handlers);
}

/**
 * 回写一次「写操作确认」（interaction）。
 *
 * **不走 ask/stream** —— 挂起态在服务端，这里只回传选择值。把它当新消息发出去，
 * 那条待办的调用就成了孤儿：用户点了确认，实际什么都没执行。
 * token 是挂起记录的凭证，sessionId 是它的坐标，两个都得上。
 */
function streamInteraction(sessionId, token, value, handlers) {
  return streamRequest(
    '/api/v1/ai/sessions/' + sessionId + '/interactions/' + encodeURIComponent(token) + '/stream',
    { value: value },
    handlers,
  );
}

/**
 * 会话列表。**只留 source=scan 的** —— 那是球球自己的会话；
 * 同一个人可能还有别的来源会话，混进来点开会跳到一个不认识的话题。
 */
function fetchSessions() {
  return springAuth
    .springRequest({ url: '/api/v1/ai/sessions?page=0&size=50', method: 'GET', data: {} })
    .then(function (res) {
      var body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      var list = (body && body.data && body.data.list) || [];
      return list.filter(function (s) {
        return (s.source || 'scan') === 'scan';
      });
    });
}

/** 某条历史会话的全部消息（用于「点开旧对话接着聊」） */
function fetchSessionMessages(sessionId) {
  return springAuth
    .springRequest({ url: '/api/v1/ai/sessions/' + sessionId + '/messages', method: 'GET', data: {} })
    .then(function (res) {
      var body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      return (body && body.data) || [];
    });
}

/**
 * 删掉一条历史对话。**服务端软删**（列表/续聊不再出现，审计留痕保留）—— 与网页端同一个接口。
 * 写请求必须看 success：HTTP 200 + success:false 也是失败。
 */
function deleteSession(sessionId) {
  return springAuth
    .springRequest({ url: '/api/v1/ai/sessions/' + sessionId, method: 'DELETE', data: {} })
    .then(function (res) {
      var body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (body && body.success === false) {
        throw new Error(body.message || '删除失败');
      }
      return true;
    });
}

/**
 * 某条会话产出的**导出产物**（含挂载点 messageId、标签、参数、是否已有文件）。
 *
 * <p>为什么抽屉要它：服务端历史里只有文字，**没有那条下载指令** —— 只拉消息的话，
 * 切走再切回来（或缓存过期后重开）卡片就没了（真机 2026-10-09 反馈）。
 * 与网页端同一口径：产物单独取一趟，再按 messageId 挂回它当年那一轮。
 */
function fetchSessionExports(sessionId) {
  return springAuth
    .springRequest({ url: '/api/v1/ai/sessions/' + sessionId + '/exports', method: 'GET', data: {} })
    .then(function (res) {
      var body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      return (body && body.data) || [];
    });
}

module.exports = {
  streamAsk,
  streamGreet,
  streamInteraction,
  fetchSessions,
  fetchSessionMessages,
  fetchSessionExports,
  deleteSession,
};
