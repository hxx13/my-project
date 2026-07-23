/**
 * 云函数 springProxy：将小程序请求转发到自建 Spring。
 *
 * 环境变量说明见同目录 ENV_CONSOLE.txt
 *
 * 入参：{ path, method, data?, authorization? }
 */

const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const BASE = (process.env.SPRING_BASE_URL || '').trim();
const SECRET = (process.env.PROXY_SHARED_SECRET || '').trim();

/** 逗号分隔前缀，默认放行小程序已接入的核心前缀。 */
function loadAllowedPrefixes() {
  const raw = (process.env.ALLOWED_API_PREFIXES || '/api/auth,/api/me,/api/mp,/api/admin,/api/notifications,/api/repair,/api/purchase,/api/supplies,/api/material,/api/upload,/api/public,/api/chat,/api/v1').trim();
  if (!raw) return ['/api/auth'];
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

const ALLOWED_PREFIXES = loadAllowedPrefixes();

function buildMultipartBody(filePayload) {
  const fileName = String((filePayload && filePayload.fileName) || `upload_${Date.now()}.jpg`).replace(/[\r\n"]/g, '_');
  const mimeType = String((filePayload && filePayload.mimeType) || 'image/jpeg');
  const base64 = String((filePayload && filePayload.base64) || '');
  if (!base64) {
    throw new Error('上传文件内容为空');
  }
  const boundary = `----SpringProxyBoundary${Date.now()}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    'utf8'
  );
  const fileBuffer = Buffer.from(base64, 'base64');
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    boundary,
    body: Buffer.concat([head, fileBuffer, tail]),
  };
}

function normalizePath(path) {
  if (!path || typeof path !== 'string') return '';
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!p.startsWith('/api/')) return '';
  if (p.includes('..')) return '';
  return p;
}

function isPathAllowed(path) {
  const p = path.replace(/\/+$/, '') || path;
  return ALLOWED_PREFIXES.some((prefix) => {
    const pre = prefix.replace(/\/+$/, '');
    return p === pre || p.startsWith(`${pre}/`);
  });
}

exports.main = async (event) => {
  const path = normalizePath(event.path);
  if (!path) {
    return {
      ok: false,
      statusCode: 400,
      body: { success: false, message: 'path 不合法，须以 /api/ 开头' },
    };
  }
  if (!isPathAllowed(path)) {
    return {
      ok: false,
      statusCode: 403,
      body: {
        success: false,
        message: `path 不在云函数白名单内，当前允许前缀：${ALLOWED_PREFIXES.join(', ')}`,
      },
    };
  }
  if (!BASE) {
    return {
      ok: false,
      statusCode: 500,
      body: { success: false, message: '云函数未配置环境变量 SPRING_BASE_URL' },
    };
  }

  const method = String(event.method || 'GET').toUpperCase();
  const data = event.data != null && typeof event.data === 'object' ? event.data : {};
  const authorization = event.authorization ? String(event.authorization) : '';
  const responseType = String(event.responseType || 'json').toLowerCase() === 'arraybuffer' ? 'arraybuffer' : 'json';
  const uploadFile = data && data.__uploadFile ? data.__uploadFile : null;

  const url = `${BASE.replace(/\/$/, '')}${path}`;
  const headers = {
    Accept: 'application/json',
  };
  if (path.includes('/export-excel') || path.includes('/export/excel')) {
    headers.Accept = '*/*';
  }
  if (SECRET) {
    headers['X-Proxy-Secret'] = SECRET;
  }
  if (authorization) {
    headers.Authorization = authorization;
  }

  let bodyData = method === 'GET' ? undefined : data;
  let queryData = method === 'GET' ? data : undefined;
  const chatAttachmentPath =
    /^\/api\/chat\/conversations\/[^/]+\/attachments$/.test(path) && method === 'POST' && uploadFile;
  const fileTemplateUploadPath = path === '/api/admin/file-templates' && method === 'POST' && uploadFile;
  if (uploadFile && method === 'POST' && (path === '/api/upload' || chatAttachmentPath || fileTemplateUploadPath)) {
    const multipart = buildMultipartBody(uploadFile);
    headers['Content-Type'] = `multipart/form-data; boundary=${multipart.boundary}`;
    bodyData = multipart.body;
    queryData = undefined;
  } else if (method !== 'GET') {
    headers['Content-Type'] = 'application/json; charset=UTF-8';
  }

  try {
    const resp = await axios({
      method,
      url,
      data: bodyData,
      params: queryData,
      headers,
      responseType,
      timeout: 28000,
      validateStatus: () => true,
    });
    if (responseType === 'arraybuffer') {
      const bodyBuffer = Buffer.isBuffer(resp.data) ? resp.data : Buffer.from(resp.data || '');
      return {
        ok: true,
        statusCode: resp.status,
        body: {
          isBase64: true,
          bodyBase64: bodyBuffer.toString('base64'),
          contentType: resp.headers ? resp.headers['content-type'] : '',
          contentDisposition: resp.headers ? resp.headers['content-disposition'] : '',
        },
      };
    }
    return {
      ok: true,
      statusCode: resp.status,
      body: resp.data,
    };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return {
      ok: false,
      statusCode: 0,
      body: { success: false, message: msg },
    };
  }
};
