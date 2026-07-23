/**
 * 学生进出状态 Socket.IO 轻量客户端（与 H5 useMobileSocket JWT 模式一致）
 * 收到 MOBILE_USER_NOTIFY(kind=refresh, reason=presence:*) 时触发 onPresenceRefresh
 */
const springAuth = require('./springAuth.js');
const { isPresenceRefreshNotify } = require('./studentPresenceHelpers.js');

var DEFAULT_SOCKET_PORT = 9092;
var FALLBACK_POLL_MS = 25000;

function resolveSocketOrigin() {
  var apiBase = springAuth.getApiPublicBaseUrl();
  if (apiBase) {
    try {
      var matched = String(apiBase).trim().match(/^(https?):\/\/([^/:]+)(?::(\d+))?/i);
      if (matched) {
        var scheme = matched[1] === 'https' ? 'wss' : 'ws';
        var host = matched[2];
        return scheme + '://' + host + ':' + DEFAULT_SOCKET_PORT;
      }
    } catch (e) {
      /* ignore */
    }
  }
  var uploadBase = springAuth.getUploadPublicBaseUrl();
  if (uploadBase) {
    var m2 = String(uploadBase).trim().match(/^(https?):\/\/([^/:]+)/i);
    if (m2) {
      return (m2[1] === 'https' ? 'wss' : 'ws') + '://' + m2[2] + ':' + DEFAULT_SOCKET_PORT;
    }
  }
  return '';
}

function encodeQuery(params) {
  return Object.keys(params)
    .filter(function (k) { return params[k] != null && params[k] !== ''; })
    .map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]));
    })
    .join('&');
}

function parseSocketIoEvent(data) {
  if (typeof data !== 'string' || !data) return null;
  if (data === '2') return { type: 'ping' };
  if (data === '3') return { type: 'pong' };
  if (data.indexOf('42') === 0) {
    try {
      var arr = JSON.parse(data.slice(2));
      if (Array.isArray(arr) && arr.length >= 2) {
        return { type: 'event', name: arr[0], payload: arr[1] };
      }
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * @param {{ onPresenceRefresh?: Function, onStatusChange?: Function }} handlers
 */
function createStudentPresenceSocket(handlers) {
  var socketTask = null;
  var pollTimer = null;
  var reconnectTimer = null;
  var disposed = false;
  var connected = false;

  function notifyStatus() {
    if (disposed) return;
    if (handlers && typeof handlers.onStatusChange === 'function') {
      handlers.onStatusChange({ connected: connected });
    }
  }

  function triggerRefresh(reason) {
    if (disposed) return;
    if (handlers && typeof handlers.onPresenceRefresh === 'function') {
      handlers.onPresenceRefresh(reason || 'socket');
    }
  }

  function startPollFallback() {
    if (disposed) return;
    stopPollFallback();
    pollTimer = setInterval(function () {
      if (disposed) return;
      triggerRefresh('poll');
    }, FALLBACK_POLL_MS);
  }

  function stopPollFallback() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function scheduleReconnect() {
    if (disposed || reconnectTimer) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      if (disposed) return;
      connect();
    }, 5000);
  }

  function handleMessage(raw) {
    if (disposed) return;
    var msg = parseSocketIoEvent(raw);
    if (!msg) return;
    if (msg.type === 'ping') {
      if (socketTask) socketTask.send({ data: '3' });
      return;
    }
    if (msg.type === 'event' && msg.name === 'MOBILE_USER_NOTIFY' && isPresenceRefreshNotify(msg.payload)) {
      triggerRefresh((msg.payload && msg.payload.reason) || 'notify');
    }
  }

  function connect() {
    if (disposed) return;
    var token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    if (!token) return;

    var origin = resolveSocketOrigin();
    if (!origin) {
      connected = false;
      notifyStatus();
      startPollFallback();
      return;
    }

    disconnectSocketOnly();

    var query = encodeQuery({
      EIO: '4',
      transport: 'websocket',
      channel: 'student',
      token: token,
    });
    var url = origin + '/socket.io/?' + query;

    try {
      socketTask = wx.connectSocket({
        url: url,
        fail: function () {
          if (disposed) return;
          connected = false;
          notifyStatus();
          startPollFallback();
          scheduleReconnect();
        },
      });
    } catch (e) {
      connected = false;
      notifyStatus();
      startPollFallback();
      scheduleReconnect();
      return;
    }

    socketTask.onOpen(function () {
      if (disposed) return;
      connected = true;
      notifyStatus();
      stopPollFallback();
    });

    socketTask.onMessage(function (res) {
      if (disposed) return;
      var raw = res && res.data;
      if (typeof raw === 'string' && raw.indexOf('0') === 0) {
        socketTask.send({ data: '40' });
        return;
      }
      if (typeof raw === 'string' && raw.indexOf('40') === 0) {
        return;
      }
      handleMessage(raw);
    });

    socketTask.onClose(function () {
      if (disposed) return;
      connected = false;
      notifyStatus();
      startPollFallback();
      scheduleReconnect();
    });

    socketTask.onError(function () {
      if (disposed) return;
      connected = false;
      notifyStatus();
      startPollFallback();
    });
  }

  function disconnectSocketOnly() {
    if (socketTask) {
      try {
        socketTask.close({});
      } catch (e) {
        /* ignore */
      }
      socketTask = null;
    }
  }

  function disconnect() {
    disposed = true;
    handlers = null;
    stopPollFallback();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    disconnectSocketOnly();
    connected = false;
  }

  return {
    connect: connect,
    disconnect: disconnect,
    isConnected: function () { return connected; },
  };
}

module.exports = {
  createStudentPresenceSocket: createStudentPresenceSocket,
  resolveSocketOrigin: resolveSocketOrigin,
};
