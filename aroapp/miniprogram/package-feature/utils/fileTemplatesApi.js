/**
 * 文件模板库：列表/下载/上传与 Web `fileTemplates.api.ts`、`AdminFileTemplateController` 同源。
 */
const springAuth = require('../../utils/springAuth.js');

function parseList(res) {
  const { statusCode, data } = res;
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false };
    }
  }
  if (statusCode === 401 || statusCode === 403) return { ok: false, message: '无权限' };
  if (!body || typeof body !== 'object') return { ok: false, message: '响应无效' };
  const ok = body.success === true || body.success === 'true' || Number(body.code) === 200;
  if (!ok) return { ok: false, message: (body && body.message) || '请求失败' };
  const msg = body.message != null ? String(body.message).trim() : '';
  const schemaHint = msg && msg !== '操作成功' ? msg : '';
  const rows = Array.isArray(body.data) ? body.data : [];
  return { ok: true, rows, schemaHint };
}

/**
 * @param {number|null} [folderId] 缺省/null/undefined = 全部；0 = 只看未归类；正数 = 该文件夹直属
 */
async function fetchFileTemplates(folderId) {
  let url = '/api/admin/file-templates';
  // 0 是有意义的筛选值（未归类），只有 null/undefined 才表示「不筛选」，故不能用 falsy 判断
  if (folderId !== null && folderId !== undefined) {
    url += `?folderId=${encodeURIComponent(String(folderId))}`;
  }
  const res = await springAuth.springRequest({ url, method: 'GET', data: {} });
  return parseList(res);
}

/** 下载到本地临时路径，供 wx.openDocument */
async function downloadTemplateToTempFile(id, fallbackName) {
  const enc = encodeURIComponent(String(id || '').trim());
  // 直连模式：直接拿 ArrayBuffer + 从响应头取文件名，不再有 isBase64/bodyBase64 那层
  const { data, contentDisposition } = await springAuth.springRequestBinary(
    `/api/admin/file-templates/${enc}/download`,
    { errorMessage: '下载失败', forbiddenMessage: '无权限下载' },
  );
  let ext = 'bin';
  const remoteName = springAuth.parseContentDispositionFilename(contentDisposition);
  const dot = remoteName.lastIndexOf('.');
  if (dot > 0) {
    ext = remoteName.slice(dot + 1).replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'bin';
  }
  const base = String(fallbackName || 'template').replace(/[\\/]/g, '_');
  const path = `${wx.env.USER_DATA_PATH}/tpl_${Date.now()}_${base.slice(0, 40)}.${ext}`;
  wx.getFileSystemManager().writeFileSync(path, data);
  return path;
}

/**
 * 上传文件模板。调用方把 folderId 放进 meta 即可（null/undefined = 未归类）。
 * 注意：folderId 为 null 时不能进 formData——wx.uploadFile 会把 null 序列化成字符串 "null"，
 * 后端 @RequestParam Long 解析 "null" 直接 400。这里统一剔除，把坑堵在源头。
 * @returns {Promise<object>} 后端 Result.data 单行（id、originalName、sizeBytes、createTime 等）
 */
async function uploadFileTemplate(tempFilePath, meta) {
  const m = Object.assign({}, meta || {});
  if (m.folderId == null) delete m.folderId;
  return springAuth.uploadFileTemplate(tempFilePath, m);
}

/**
 * 写操作统一判包。springRequest 只在网络层失败时 reject，HTTP 200 + body {success:false}
 * 会正常 resolve，且后端出错时状态码仍是 200，只能靠 body 里的 success/code 判定。
 * @returns {{ ok: boolean, message?: string }}
 */
function judgeWrite(res, failMsg, okMsg) {
  const { statusCode, data } = res || {};
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false };
    }
  }
  const code = Number(body && body.code);
  if (statusCode === 401 || statusCode === 403 || code === 401 || code === 403) {
    return { ok: false, message: '无权限' };
  }
  if (!body || typeof body !== 'object') return { ok: false, message: '响应无效' };
  const ok = body.success === true || body.success === 'true' || code === 200;
  if (!ok) return { ok: false, message: body.message || failMsg };
  return { ok: true, message: body.message || okMsg };
}

/** 删除文件模板。不抛异常，返回 { ok, message } */
async function deleteFileTemplate(id) {
  const enc = encodeURIComponent(String(id == null ? '' : id).trim());
  let res;
  try {
    res = await springAuth.springRequest({
      url: `/api/admin/file-templates/${enc}`,
      method: 'DELETE',
      data: {},
    });
  } catch (e) {
    return { ok: false, message: '网络异常，删除失败' };
  }
  return judgeWrite(res, '删除失败', '删除成功');
}

/** 移动文件到文件夹。folderId 传 null 或 0 = 移回未归类 */
async function moveFileTemplate(id, folderId) {
  const enc = encodeURIComponent(String(id == null ? '' : id).trim());
  let res;
  try {
    res = await springAuth.springRequest({
      url: `/api/admin/file-templates/${enc}/folder`,
      method: 'POST',
      data: { folderId: folderId == null ? null : folderId },
    });
  } catch (e) {
    return { ok: false, message: '网络异常，移动失败' };
  }
  return judgeWrite(res, '移动失败', '移动成功');
}

module.exports = {
  fetchFileTemplates,
  downloadTemplateToTempFile,
  uploadFileTemplate,
  deleteFileTemplate,
  moveFileTemplate,
};
