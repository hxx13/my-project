/**
 * 自有 Spring 后端请求（与 jtu 的 utils/request.js 完全独立）。
 *
 * 【OpenID 与「注销」本机缓存】当前 Spring 若使用 AuthService 内基于 jsCode 的 Mock
 * exchangeJsCodeForOpenId（开发占位），则每次 wx.login 的 jsCode 不同，得到的待绑定
 * openId 字符串也会变；接入微信官方 jscode2session 后，同一小程序同一用户 openId 稳定。
 * clearSpringSession 仅删除本机 storage，不改变微信侧账号。
 *
 * Storage 键（勿与 jtu 的 `token` 混用）：
 * - springToken, springRole, springRoleLevel, springRoleDesc, springUserInfo, springPendingOpenId
 * - AI 画像页缓存（注销校内登录时一并清除）：见 KEYS.AI_PORTRAIT_*
 *
 * ---------------------------------------------------------------------------
 * 【当前】直连 Spring 后端（aroultra.shsmu.edu.cn），不再经云函数中转。
 * - 不再需要 wx.cloud.init，base URL 由 envConfig.getEffectiveApiBaseUrl() 提供。
 * - 无 downloadFile 合法域名时：物资封面等通过 toAbsoluteMediaUrl 拼接 runtime-config 中的 publicBaseUrl。
 */

const envConfig = require('./envConfig.js');

const KEYS = {
  TOKEN: 'springToken',
  ROLE: 'springRole',
  ROLE_LEVEL: 'springRoleLevel',
  ROLE_DESC: 'springRoleDesc',
  USER_INFO: 'springUserInfo',
  PENDING_OPENID: 'springPendingOpenId',
  /** 管理端 network.upload.publicBaseUrl，用于把 /api/upload/... 拼成小程序可加载的绝对 HTTPS */
  UPLOAD_PUBLIC_BASE: 'springUploadPublicBaseUrl',
  /** 管理端 network.frontend.apiBaseUrl，用于把 /api/** 拼成可直开的完整地址 */
  API_PUBLIC_BASE: 'springApiPublicBaseUrl',
  /** pages/aiPortrait：12h 画像缓存与手动刷新冷却 */
  AI_PORTRAIT_CACHE: 'aroapp_aiPortrait_cache_v1',
  AI_PORTRAIT_MANUAL_AT: 'aroapp_aiPortrait_manualAtMs',
};

function parseBody(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return { _raw: raw };
    }
  }
  return { _raw: String(raw) };
}

function callSpringDirect(payload) {
  return new Promise((resolve, reject) => {
    const base = envConfig.getEffectiveApiBaseUrl().replace(/\/+$/, '');
    const url = `${base}${payload.path}`;
    wx.request({
      url,
      method: payload.method || 'GET',
      data: payload.data || {},
      header: {
        'Content-Type': 'application/json',
        ...(payload.authorization ? { Authorization: payload.authorization } : {}),
      },
      responseType: payload.responseType || 'text',
      success(res) {
        resolve({ statusCode: res.statusCode, data: res.data });
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络请求失败'));
      },
    });
  });
}

function persistSpringSession(authData) {
  if (!authData || typeof authData !== 'object') return;
  const token = authData.token;
  if (token) wx.setStorageSync(KEYS.TOKEN, token);
  if (authData.role != null && authData.role !== '') wx.setStorageSync(KEYS.ROLE, authData.role);
  if (authData.roleLevel != null) wx.setStorageSync(KEYS.ROLE_LEVEL, String(authData.roleLevel));
  if (authData.roleDesc) wx.setStorageSync(KEYS.ROLE_DESC, authData.roleDesc);
  if (authData.userInfo) {
    try {
      wx.setStorageSync(KEYS.USER_INFO, JSON.stringify(authData.userInfo));
    } catch (e) {
      wx.removeStorageSync(KEYS.USER_INFO);
    }
  }
  wx.removeStorageSync(KEYS.PENDING_OPENID);
}

function clearSpringSession() {
  wx.removeStorageSync(KEYS.TOKEN);
  wx.removeStorageSync(KEYS.ROLE);
  wx.removeStorageSync(KEYS.ROLE_LEVEL);
  wx.removeStorageSync(KEYS.ROLE_DESC);
  wx.removeStorageSync(KEYS.USER_INFO);
  wx.removeStorageSync(KEYS.PENDING_OPENID);
  try {
    wx.removeStorageSync(KEYS.AI_PORTRAIT_CACHE);
    wx.removeStorageSync(KEYS.AI_PORTRAIT_MANUAL_AT);
  } catch (e) {
    /* ignore */
  }
}

function getUploadPublicBaseUrl() {
  try {
    return wx.getStorageSync(KEYS.UPLOAD_PUBLIC_BASE) || '';
  } catch (e) {
    return '';
  }
}

function setUploadPublicBaseUrl(value) {
  const s = value != null ? String(value).trim() : '';
  if (s) {
    wx.setStorageSync(KEYS.UPLOAD_PUBLIC_BASE, s);
  } else {
    try {
      wx.removeStorageSync(KEYS.UPLOAD_PUBLIC_BASE);
    } catch (e) {
      /* ignore */
    }
  }
}

function getApiPublicBaseUrl() {
  try {
    return wx.getStorageSync(KEYS.API_PUBLIC_BASE) || '';
  } catch (e) {
    return '';
  }
}

function setApiPublicBaseUrl(value) {
  const s = value != null ? String(value).trim() : '';
  if (s) {
    wx.setStorageSync(KEYS.API_PUBLIC_BASE, s);
  } else {
    try {
      wx.removeStorageSync(KEYS.API_PUBLIC_BASE);
    } catch (e) {
      /* ignore */
    }
  }
}

/**
 * localhost / 内网 IP 强制 http://，因为开发机没有 SSL 证书。
 */
function fixLocalDevProtocol(url) {
  if (typeof url !== 'string' || !url) return url;
  return url.replace(/^https:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)/i, 'http://$1');
}

function deriveApiBaseFromUploadBase() {
  const uploadBase = getUploadPublicBaseUrl().replace(/\/+$/, '');
  if (!uploadBase || !/^https?:\/\//i.test(uploadBase)) return '';
  const matched = uploadBase.match(/^(https?:\/\/[^/]+)/i);
  if (!matched || !matched[1]) return '';
  return fixLocalDevProtocol(`${matched[1]}/api`);
}

/**
 * 将 Spring 返回的相对上传路径转为小程序 `<image>` / preview 可用的绝对 URL。
 * 依赖 GET /api/public/runtime-config 写入的 network.upload.publicBaseUrl（https 源，无尾斜杠）。
 */
function toAbsoluteMediaUrl(url) {
  if (url == null) return '';
  const u = String(url).trim();
  if (!u) return '';
  if (u.startsWith('cloud://')) return fixLocalDevProtocol(toAbsoluteApiUrl(`/api/upload/proxy-image?url=${encodeURIComponent(u)}`));
  if (/^https?:\/\//i.test(u)) return fixLocalDevProtocol(u);
  const base = getUploadPublicBaseUrl().replace(/\/+$/, '');
  if (!base || !/^https?:\/\//i.test(base)) return u;
  const path = u.startsWith('/') ? u : `/${u}`;
  return fixLocalDevProtocol(`${base}${path}`);
}

/**
 * 将 /api/** 这样的相对接口地址拼成完整可直开地址（含 ip 与端口）。
 */
function toAbsoluteApiUrl(url) {
  if (url == null) return '';
  const u = String(url).trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return fixLocalDevProtocol(u);
  const path = u.startsWith('/') ? u : `/${u}`;
  let base = getApiPublicBaseUrl().replace(/\/+$/, '');
  if (!base || !/^https?:\/\//i.test(base)) {
    base = deriveApiBaseFromUploadBase();
  }
  if (!base || !/^https?:\/\//i.test(base)) return path;
  base = fixLocalDevProtocol(base);
  if (base.endsWith('/api') && (path === '/api' || path.startsWith('/api/'))) {
    return `${base.slice(0, -4)}${path}`;
  }
  return `${base}${path}`;
}

function uploadFileDirect(tempFilePath, meta) {
  const token = wx.getStorageSync(KEYS.TOKEN) || '';
  if (!token) return Promise.reject(new Error('未登录，无法上传'));
  const base = envConfig.getEffectiveApiBaseUrl().replace(/\/+$/, '');
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${base}/api/upload`,
      filePath: tempFilePath,
      name: 'file',
      header: { Authorization: `Bearer ${token}` },
      formData: meta || {},
      success(res) {
        try {
          const body = JSON.parse(res.data);
          if (res.statusCode === 200 && body && body.success === true && body.data && body.data.url) {
            resolve(toAbsoluteMediaUrl(body.data.url));
            return;
          }
          reject(new Error((body && body.message) || `上传失败 HTTP ${res.statusCode}`));
        } catch (e) {
          reject(new Error('解析上传响应失败'));
        }
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '上传失败'));
      },
    });
  });
}

/**
 * 经云函数拉公开运行时配置（无需登录），写入 network.upload.publicBaseUrl。
 * @returns {Promise<Record<string, string>|null>}
 */
function refreshPublicRuntimeConfig() {
  return callSpringDirect({
    path: '/api/public/runtime-config',
    method: 'GET',
    data: {},
    authorization: '',
  })
    .then((res) => {
      const body = parseBody(res.data);
      if (res.statusCode === 200 && body && body.success === true && body.data && typeof body.data === 'object') {
        const raw = body.data['network.upload.publicBaseUrl'];
        if (raw != null) setUploadPublicBaseUrl(raw);
        const apiBase = body.data['network.frontend.apiBaseUrl'];
        if (apiBase != null) setApiPublicBaseUrl(apiBase);
        return body.data;
      }
      return null;
    })
    .catch(() => null);
}

/**
 * POST /api/auth/login/wechat
 * @returns {Promise<{ ok: boolean, bound?: boolean, openId?: string, message?: string }>}
 */
function loginWechat(jsCode) {
  return new Promise((resolve) => {
    if (!jsCode) {
      resolve({ ok: false, message: '无 jsCode' });
      return;
    }
    callSpringDirect({
      path: '/api/auth/login/wechat',
      method: 'POST',
      data: { jsCode },
    })
      .then((res) => {
        const status = res.statusCode;
        const body = parseBody(res.data);

        if (status === 200 && body && body.success === true && body.data && body.data.token) {
          persistSpringSession(body.data);
          resolve({ ok: true, bound: true });
          return;
        }

        if (status === 401 && body && typeof body.openId === 'string' && body.openId) {
          wx.setStorageSync(KEYS.PENDING_OPENID, body.openId);
          resolve({ ok: true, bound: false, openId: body.openId });
          return;
        }

        const msg =
          (body && (body.message || body.msg)) ||
          (status !== 200 ? `HTTP ${status}` : '静默登录未返回可解析结果');
        resolve({ ok: false, message: msg });
      })
      .catch((err) => {
        resolve({
          ok: false,
          message: (err && err.message) || '网络错误',
        });
      });
  });
}

/**
 * POST /api/auth/bind/wechat
 */
function bindWechat({ bindType, identifier, password }) {
  const openId = wx.getStorageSync(KEYS.PENDING_OPENID);
  if (!openId) {
    return Promise.reject(new Error('缺少待绑定 openId，请重新进入小程序'));
  }
  return callSpringDirect({
    path: '/api/auth/bind/wechat',
    method: 'POST',
    data: {
      openId,
      bindType: String(bindType || '').toUpperCase(),
      identifier: String(identifier || '').trim(),
      password: password != null ? String(password) : '',
    },
  }).then((res) => {
    const body = parseBody(res.data);
    if (res.statusCode === 200 && body && body.success === true && body.data && body.data.token) {
      persistSpringSession(body.data);
      return body.data;
    }
    const msg = (body && body.message) || `绑定失败 HTTP ${res.statusCode}`;
    throw new Error(msg);
  });
}

/** 仅 Spring 受保护接口：自动带 Authorization Bearer */
function springRequest(options) {
  const token = wx.getStorageSync(KEYS.TOKEN) || '';
  const urlPath = options.url.startsWith('/') ? options.url : `/${options.url}`;
  const authorization = token ? `Bearer ${token}` : '';
  const reqOpts = {
    path: urlPath,
    method: options.method || 'GET',
    data: options.data || {},
    authorization,
  };
  // 仅在调用方显式指定 responseType 时传递，否则走 callSpringDirect 默认 'text'
  if (options.responseType != null) {
    reqOpts.responseType = options.responseType;
  }
  return callSpringDirect(reqOpts).then((res) => ({
    statusCode: res.statusCode,
    data: res.data,
  }));
}

/**
 * 上传文件到 Spring /api/upload（替代旧云函数方案）
 * @deprecated 直接使用 uploadFileDirect
 */
async function uploadSpringFile(tempFilePath, meta) {
  return uploadFileDirect(tempFilePath, meta);
}

/**
 * 上传聊天附件到 Spring /api/chat/conversations/{id}/attachments
 */
async function uploadChatAttachment(conversationId, tempFilePath, meta) {
  const token = wx.getStorageSync(KEYS.TOKEN) || '';
  if (!token) throw new Error('未登录，无法上传');
  const rawId = String(conversationId || '').trim();
  if (!rawId) throw new Error('会话无效');
  const id = encodeURIComponent(rawId);
  const base = envConfig.getEffectiveApiBaseUrl().replace(/\/+$/, '');
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${base}/api/chat/conversations/${id}/attachments`,
      filePath: tempFilePath,
      name: 'file',
      header: { Authorization: `Bearer ${token}` },
      formData: meta || {},
      success(res) {
        try {
          const body = JSON.parse(res.data);
          if (res.statusCode === 200 && body && body.success === true && body.data) {
            resolve(body.data);
            return;
          }
          reject(new Error((body && body.message) || `上传失败 HTTP ${res.statusCode}`));
        } catch (e) {
          reject(new Error('解析上传响应失败'));
        }
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '上传失败'));
      },
    });
  });
}

/**
 * 上传文件模板到 Spring /api/admin/file-templates
 */
async function uploadFileTemplate(tempFilePath, meta) {
  const token = wx.getStorageSync(KEYS.TOKEN) || '';
  if (!token) throw new Error('未登录，无法上传');
  const base = envConfig.getEffectiveApiBaseUrl().replace(/\/+$/, '');
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${base}/api/admin/file-templates`,
      filePath: tempFilePath,
      name: 'file',
      header: { Authorization: `Bearer ${token}` },
      formData: meta || {},
      success(res) {
        try {
          const body = JSON.parse(res.data);
          if (res.statusCode === 200 && body && body.success === true && body.data) {
            resolve(body.data);
            return;
          }
          reject(new Error((body && body.message) || `上传失败 HTTP ${res.statusCode}`));
        } catch (e) {
          reject(new Error('解析上传响应失败'));
        }
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '上传失败'));
      },
    });
  });
}

function runWechatSilentLoginOnLaunch() {
  // 开发环境跳过微信静默登录，直接用账号密码登录即可
  if (envConfig.getEffectivePresetId() === 'dev') {
    wx.removeStorageSync(KEYS.PENDING_OPENID);
    console.log('[springAuth] 开发环境，跳过微信静默登录');
    return;
  }
  wx.login({
    timeout: 10000,
    success(res) {
      if (!res.code) {
        console.warn('[springAuth] wx.login 未返回 code');
        return;
      }
      loginWechat(res.code)
        .then((r) => {
          if (r.ok && r.bound) console.log('[springAuth] Spring 已绑定，会话已写入');
          else if (r.ok && r.openId) console.log('[springAuth] 待绑定，springPendingOpenId 已写入');
          else console.warn('[springAuth] 静默登录:', r.message || r);
        })
        .catch((e) => console.error('[springAuth]', e));
    },
    fail(err) {
      console.error('[springAuth] wx.login 失败', err);
    },
  });
}

/**
 * 使用本地 springToken 调用 POST /api/auth/session/refresh，按用户 ID 从库重载角色并写回 storage。
 * 学生绑定、教职工绑定后 token 形态一致，均走此路径；不依赖 wx.login 与 openId 映射。
 */
function refreshSpringSessionWithBearer() {
  const token = wx.getStorageSync(KEYS.TOKEN) || '';
  if (!token) {
    return Promise.resolve({ ok: false, message: '未登录', noToken: true });
  }
  return callSpringDirect({
    path: '/api/auth/session/refresh',
    method: 'POST',
    data: {},
    authorization: `Bearer ${token}`,
  })
    .then((res) => {
      const body = parseBody(res.data);
      if (res.statusCode === 200 && body && body.success === true && body.data && body.data.token) {
        persistSpringSession(body.data);
        return { ok: true };
      }
      const msg =
        (body && (body.message || body.msg)) ||
        (res.statusCode !== 200 ? `HTTP ${res.statusCode}` : '会话刷新失败');
      return { ok: false, message: msg };
    })
    .catch((err) => ({
      ok: false,
      message: (err && err.message) || '网络错误',
    }));
}

/**
 * 无 token 时：wx.login + POST /api/auth/login/wechat（依赖 openId；开发 Mock openId 不稳定时易判未绑定）。
 */
function refreshWechatSessionViaWxCode() {
  return new Promise((resolve) => {
    wx.login({
      timeout: 10000,
      success(res) {
        if (!res.code) {
          resolve({ ok: false, message: 'wx.login 未返回 code' });
          return;
        }
        loginWechat(res.code).then((r) => {
          if (r.ok && r.bound) {
            resolve({ ok: true });
            return;
          }
          if (r.ok && r.openId) {
            resolve({
              ok: false,
              message: '当前 code 未匹配到已绑定用户，请先完成校内绑定或使用已登录态刷新',
            });
            return;
          }
          resolve({ ok: false, message: r.message || '同步失败' });
        });
      },
      fail(err) {
        resolve({ ok: false, message: (err && err.errMsg) || 'wx.login 失败' });
      },
    });
  });
}

/**
 * 同步角色/会话：优先 Bearer session/refresh（学生、教职工通用）；失败或无 token 时再尝试 wx 静默登录。
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
/**
 * PATCH /api/auth/profile/display-nickname — 成功后返回完整 AuthData，请再 persistSpringSession。
 */
function updateDisplayNickname(displayNickname) {
  const token = wx.getStorageSync(KEYS.TOKEN) || '';
  if (!token) {
    return Promise.reject(new Error('未登录'));
  }
  return callSpringDirect({
    path: '/api/auth/profile/display-nickname',
    method: 'PATCH',
    data: { displayNickname: displayNickname != null ? String(displayNickname) : '' },
    authorization: `Bearer ${token}`,
  }).then((res) => {
    const body = parseBody(res.data);
    if (res.statusCode === 200 && body && body.success === true && body.data && body.data.token) {
      persistSpringSession(body.data);
      return body.data;
    }
    const msg = (body && body.message) || `保存失败 HTTP ${res.statusCode}`;
    throw new Error(msg);
  });
}

function refreshWechatSession() {
  return refreshSpringSessionWithBearer().then((first) => {
    if (first.ok) return first;
    if (!first.noToken) {
      return refreshWechatSessionViaWxCode().then((second) => {
        if (second.ok) return second;
        const a = first.message || '';
        const b = second.message || '';
        const merged = a && b && a !== b ? `${a}；${b}` : a || b || '同步失败';
        return { ok: false, message: merged };
      });
    }
    return refreshWechatSessionViaWxCode();
  });
}

/**
 * @deprecated Cloud sync; no longer needed with direct upload
 * @param {string[]} urls 图片 URL 数组
 * @returns {Promise<{mappings: Record<string,string>, unresolved?: number, pendingSync?: number}>}
 */
function resolveCloudUrls(urls) {
  if (!urls || urls.length === 0) return Promise.resolve({ mappings: {} });
  const candidates = urls.filter((u) => u && !u.startsWith('cloud://'));
  if (candidates.length === 0) return Promise.resolve({ mappings: {} });
  const joined = candidates.map((u) => encodeURIComponent(u)).join(',');
  return callSpringDirect({
    path: `/api/upload/cloud-mappings?urls=${joined}`,
    method: 'GET',
    data: {},
  }).then((res) => {
    let body = res.data;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    const data = (body && body.data) || {};
    return {
      mappings: data.mappings || {},
      unresolved: data.unresolved || 0,
      pendingSync: data.pendingSync || 0,
    };
  }).catch(() => ({ mappings: {}, unresolved: urls ? urls.length : 0, _failed: true }));
}

module.exports = {
  getEffectiveCloudEnvId: envConfig.getEffectiveCloudEnvId,
  KEYS,
  callSpringDirect,
  loginWechat,
  bindWechat,
  springRequest,
  uploadSpringFile,
  uploadChatAttachment,
  uploadFileTemplate,
  uploadFileDirect,
  runWechatSilentLoginOnLaunch,
  refreshWechatSession,
  updateDisplayNickname,
  persistSpringSession,
  clearSpringSession,
  getUploadPublicBaseUrl,
  setUploadPublicBaseUrl,
  getApiPublicBaseUrl,
  setApiPublicBaseUrl,
  toAbsoluteMediaUrl,
  resolveCloudUrls,
  toAbsoluteApiUrl,
  refreshPublicRuntimeConfig,
};
