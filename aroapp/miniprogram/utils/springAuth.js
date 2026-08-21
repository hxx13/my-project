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
 * 【当前】经微信云开发云函数 springProxy 转发到自建 Spring，不在小程序端直连公网 Spring。
 * - 须在 app.js onLaunch 中先 wx.cloud.init（见 CLOUD_ENV_ID）。
 * - 云函数环境变量：SPRING_BASE_URL、可选 PROXY_SHARED_SECRET（与 Spring app.mp.proxy.secret 一致）。
 * - 若 springRequest 需访问 /api 下其它前缀，在云函数配置 ALLOWED_API_PREFIXES（逗号分隔），见 cloudfunctions/springProxy/ENV_CONSOLE.txt。
 * - 无 downloadFile 合法域名时：物资封面等可用 uploadCloudMediaFile 得到 cloud://，由 toAbsoluteMediaUrl 原样透出给 <image>。
 */

const envConfig = require('./envConfig.js');

/** 生产云环境 ID（与 PRESETS.prod.cloudEnvId 一致，保留作默认别名） */
const CLOUD_ENV_ID = 'aroapp-d0gf62u0p13ac9c9c';

const CLOUD_FN_SPRING_PROXY = 'springProxy';

/** 客户端等待云函数返回的上限（毫秒）。默认 3000 会导致 WinCC/归档等慢请求 errCode -504003 */
const SPRING_PROXY_CALL_TIMEOUT_MS = 60000;

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

/**
 * 经云函数转发到 Spring。
 * @param {{ path: string, method?: string, data?: object, authorization?: string, responseType?: string }} payload
 * @returns {Promise<{ statusCode: number, data: unknown }>}
 */
function callSpringProxy(payload) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
      reject(new Error('当前基础库不支持 wx.cloud，请升级微信或检查 app.json cloud 配置'));
      return;
    }
    wx.cloud.callFunction({
      name: CLOUD_FN_SPRING_PROXY,
      config: { env: envConfig.getEffectiveCloudEnvId() },
      timeout: SPRING_PROXY_CALL_TIMEOUT_MS,
      data: {
        path: payload.path,
        method: payload.method || 'GET',
        data: payload.data != null ? payload.data : {},
        authorization: payload.authorization || '',
        responseType: payload.responseType || 'json',
      },
      success(res) {
        const r = res.result;
        if (!r || typeof r !== 'object') {
          reject(new Error('云函数返回异常'));
          return;
        }
        if (r.ok === false) {
          const msg =
            (r.body && (r.body.message || r.body.msg)) ||
            r.message ||
            '云函数转发失败';
          reject(new Error(msg));
          return;
        }
        const statusCode = typeof r.statusCode === 'number' ? r.statusCode : 0;
        resolve({ statusCode, data: r.body });
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '云函数调用失败'));
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

function deriveApiBaseFromUploadBase() {
  const uploadBase = getUploadPublicBaseUrl().replace(/\/+$/, '');
  if (!uploadBase || !/^https?:\/\//i.test(uploadBase)) return '';
  const matched = uploadBase.match(/^(https?:\/\/[^/]+)/i);
  if (!matched || !matched[1]) return '';
  return `${matched[1]}/api`;
}

/**
 * 将 Spring 返回的相对上传路径转为小程序 `<image>` / preview 可用的绝对 URL。
 * 依赖 GET /api/public/runtime-config 写入的 network.upload.publicBaseUrl（https 源，无尾斜杠）。
 */
function toAbsoluteMediaUrl(url) {
  if (url == null) return '';
  const u = String(url).trim();
  if (!u) return '';
  if (u.startsWith('cloud://')) return u;
  if (/^https?:\/\//i.test(u)) return u;
  const base = getUploadPublicBaseUrl().replace(/\/+$/, '');
  if (!base || !/^https?:\/\//i.test(base)) return u;
  const path = u.startsWith('/') ? u : `/${u}`;
  return `${base}${path}`;
}

/**
 * 将 /api/** 这样的相对接口地址拼成完整可直开地址（含 ip 与端口）。
 */
function toAbsoluteApiUrl(url) {
  if (url == null) return '';
  const u = String(url).trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  const path = u.startsWith('/') ? u : `/${u}`;
  let base = getApiPublicBaseUrl().replace(/\/+$/, '');
  if (!base || !/^https?:\/\//i.test(base)) {
    base = deriveApiBaseFromUploadBase();
  }
  if (!base || !/^https?:\/\//i.test(base)) return path;
  if (base.endsWith('/api') && (path === '/api' || path.startsWith('/api/'))) {
    return `${base.slice(0, -4)}${path}`;
  }
  return `${base}${path}`;
}

/**
 * 上传图片等到微信云开发存储，返回 cloud:// fileID（不经自建域名，便于无合法域名场景展示）。
 * @param {string} tempFilePath 本地临时路径
 * @param {string} [cloudDir] 云存储目录，默认 uploads
 */
function uploadCloudMediaFile(tempFilePath, cloudDir) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
      reject(new Error('当前基础库不支持 wx.cloud.uploadFile'));
      return;
    }
    const dir = (cloudDir && String(cloudDir).replace(/^\/+|\/+$/g, '')) || 'uploads';
    const pathLower = String(tempFilePath || '').toLowerCase();
    let ext = 'jpg';
    if (pathLower.endsWith('.png')) ext = 'png';
    else if (pathLower.endsWith('.webp')) ext = 'webp';
    else if (pathLower.endsWith('.gif')) ext = 'gif';
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const cloudPath = `${dir}/${suffix}.${ext}`;
    wx.cloud.uploadFile({
      config: { env: envConfig.getEffectiveCloudEnvId() },
      cloudPath,
      filePath: tempFilePath,
      success(res) {
        if (res.fileID) resolve(String(res.fileID).trim());
        else reject(new Error('云上传未返回 fileID'));
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '云上传失败'));
      },
    });
  });
}

/**
 * 经云函数拉公开运行时配置（无需登录），写入 network.upload.publicBaseUrl。
 * @returns {Promise<Record<string, string>|null>}
 */
function refreshPublicRuntimeConfig() {
  return callSpringProxy({
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
    callSpringProxy({
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
  return callSpringProxy({
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
  return callSpringProxy({
    path: urlPath,
    method: options.method || 'GET',
    data: options.data || {},
    authorization,
    responseType: options.responseType || 'json',
  }).then((res) => ({
    statusCode: res.statusCode,
    data: res.data,
  }));
}

function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (res) => resolve(res.data || ''),
      fail: (err) => reject(new Error((err && err.errMsg) || '读取文件失败')),
    });
  });
}

function getFileSize(filePath) {
  return new Promise((resolve) => {
    wx.getFileInfo({
      filePath,
      success(res) {
        resolve(Number(res && res.size) || 0);
      },
      fail() {
        resolve(0);
      },
    });
  });
}

function compressImageFile(filePath, quality) {
  return new Promise((resolve, reject) => {
    if (typeof wx.compressImage !== 'function') {
      reject(new Error('当前基础库不支持图片压缩'));
      return;
    }
    wx.compressImage({
      src: filePath,
      quality,
      compressedWidth: 0,
      compressedHeight: 0,
      success(res) {
        resolve((res && res.tempFilePath) || filePath);
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '压缩失败'));
      },
    });
  });
}

async function ensureUploadableFile(tempFilePath) {
  let path = tempFilePath;
  const maxBytes = 420 * 1024; // 预留 base64 + JSON 包装开销，降低 callFunction 超限概率
  let size = await getFileSize(path);
  if (size > 0 && size <= maxBytes) return path;

  const qualities = [72, 58, 46, 34, 26];
  for (let i = 0; i < qualities.length; i += 1) {
    try {
      path = await compressImageFile(path, qualities[i]);
      size = await getFileSize(path);
      if (size > 0 && size <= maxBytes) {
        return path;
      }
    } catch (e) {
      // ignore and continue with original/last path
    }
  }
  return path;
}

/**
 * 上传图片到 Spring /api/upload，返回可访问 url。
 * 通过云函数中转上传，避免小程序端直连 multipart 的限制。
 */
async function uploadSpringFile(tempFilePath, meta) {
  const token = wx.getStorageSync(KEYS.TOKEN) || '';
  if (!token) throw new Error('未登录，无法上传');
  const fileName = (meta && meta.fileName) || `img_${Date.now()}.jpg`;
  const mimeType = (meta && meta.mimeType) || 'image/jpeg';
  const uploadPath = await ensureUploadableFile(tempFilePath);
  const base64 = await readFileBase64(uploadPath);
  let res;
  try {
    res = await callSpringProxy({
      path: '/api/upload',
      method: 'POST',
      authorization: `Bearer ${token}`,
      data: {
        __uploadFile: {
          fileName,
          mimeType,
          base64,
        },
      },
    });
  } catch (err) {
    const msg = (err && err.message) || '';
    if (/callfunction|request:fail|data too large|参数过大|limit/i.test(msg)) {
      throw new Error('图片过大或上传链路异常，请换小图重试');
    }
    throw err;
  }
  const body = parseBody(res.data);
  if (res.statusCode === 200 && body && body.success === true && body.data && body.data.url) {
    return toAbsoluteMediaUrl(body.data.url);
  }
  const msg = (body && body.message) || `上传失败 HTTP ${res.statusCode}`;
  throw new Error(msg);
}

/**
 * 站内信附件：POST /api/chat/conversations/{id}/attachments（经云函数 multipart，与 uploadSpringFile 同源）。
 */
async function uploadChatAttachment(conversationId, tempFilePath, meta) {
  const token = wx.getStorageSync(KEYS.TOKEN) || '';
  if (!token) throw new Error('未登录，无法上传');
  const rawId = String(conversationId || '').trim();
  if (!rawId) throw new Error('会话无效');
  const id = encodeURIComponent(rawId);
  const fileName = (meta && meta.fileName) || `file_${Date.now()}`;
  const mimeType = (meta && meta.mimeType) || 'application/octet-stream';
  const base64 = await readFileBase64(tempFilePath);
  let res;
  try {
    res = await callSpringProxy({
      path: `/api/chat/conversations/${id}/attachments`,
      method: 'POST',
      authorization: `Bearer ${token}`,
      data: {
        __uploadFile: {
          fileName,
          mimeType,
          base64,
        },
      },
    });
  } catch (err) {
    const msg = (err && err.message) || '';
    if (/callfunction|request:fail|data too large|参数过大|limit/i.test(msg)) {
      throw new Error('文件过大或上传链路异常，请换小文件重试');
    }
    throw err;
  }
  const body = parseBody(res.data);
  if (res.statusCode === 200 && body && body.success === true && body.data) {
    return body.data;
  }
  const msg = (body && body.message) || `上传失败 HTTP ${res.statusCode}`;
  throw new Error(msg);
}

/**
 * 文件模板库：POST /api/admin/file-templates（multipart field `file`，与 Spring AdminFileTemplateController 一致）。
 */
async function uploadFileTemplate(tempFilePath, meta) {
  const token = wx.getStorageSync(KEYS.TOKEN) || '';
  if (!token) throw new Error('未登录，无法上传');
  const fileName = (meta && meta.fileName) || `template_${Date.now()}`;
  const mimeType = (meta && meta.mimeType) || 'application/octet-stream';
  const base64 = await readFileBase64(tempFilePath);
  let res;
  try {
    res = await callSpringProxy({
      path: '/api/admin/file-templates',
      method: 'POST',
      authorization: `Bearer ${token}`,
      data: {
        __uploadFile: {
          fileName,
          mimeType,
          base64,
        },
      },
    });
  } catch (err) {
    const msg = (err && err.message) || '';
    if (/callfunction|request:fail|data too large|参数过大|limit/i.test(msg)) {
      throw new Error('文件过大或上传链路异常，请换小文件重试');
    }
    throw err;
  }
  const body = parseBody(res.data);
  if (res.statusCode === 200 && body && body.success === true && body.data) {
    return body.data;
  }
  const msg = (body && body.message) || `上传失败 HTTP ${res.statusCode}`;
  throw new Error(msg);
}

function runWechatSilentLoginOnLaunch() {
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
  return callSpringProxy({
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
  return callSpringProxy({
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
 * 批量解析 HTTP 图片 URL → 微信云 cloud:// fileID。
 * 小程序加载图片列表后调用，优先使用 CDN 地址。
 * @param {string[]} urls 图片 URL 数组
 * @returns {Promise<{mappings: Record<string,string>, unresolved?: number, pendingSync?: number}>}
 */
function resolveCloudUrls(urls) {
  if (!urls || urls.length === 0) return Promise.resolve({ mappings: {} });
  const candidates = urls.filter((u) => u && !u.startsWith('cloud://'));
  if (candidates.length === 0) return Promise.resolve({ mappings: {} });
  const joined = candidates.map((u) => encodeURIComponent(u)).join(',');
  return callSpringProxy({
    path: `/api/upload/cloud-mappings?urls=${joined}`,
    method: 'GET',
    data: {},
    authorization: '',
  }).then((res) => {
    const body = (res && res.data) || {};
    const data = (body && body.data) || {};
    return {
      mappings: data.mappings || {},
      unresolved: data.unresolved || 0,
      pendingSync: data.pendingSync || 0,
    };
  }).catch(() => ({ mappings: {}, unresolved: urls ? urls.length : 0, _failed: true }));
}

/**
 * 触发微信云 syncToWechat 批量同步（异步，fire-and-forget）。
 * 将后端磁盘上的图片上传到微信云存储并回填 cloud:// fileID。
 */
function triggerCloudSync() {
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') return;
  wx.cloud.callFunction({
    name: 'syncToWechat',
    config: { env: envConfig.getEffectiveCloudEnvId() },
    data: {},
  }).then((res) => {
    const r = res.result || {};
    console.log('[syncToWechat]', r.message || r.synced, 'synced:', r.synced, 'failed:', r.failed);
  }).catch((e) => {
    console.warn('[syncToWechat] trigger failed:', e && e.errMsg);
  });
}

module.exports = {
  CLOUD_ENV_ID,
  getEffectiveCloudEnvId: envConfig.getEffectiveCloudEnvId,
  CLOUD_FN_SPRING_PROXY,
  KEYS,
  callSpringProxy,
  loginWechat,
  bindWechat,
  springRequest,
  uploadSpringFile,
  uploadChatAttachment,
  uploadFileTemplate,
  uploadCloudMediaFile,
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
  triggerCloudSync,
  toAbsoluteApiUrl,
  refreshPublicRuntimeConfig,
};
