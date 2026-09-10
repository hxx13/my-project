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

async function fetchFileTemplates() {
  const res = await springAuth.springRequest({
    url: '/api/admin/file-templates',
    method: 'GET',
    data: {},
  });
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
 * @returns {Promise<object>} 后端 Result.data 单行（id、originalName、sizeBytes、createTime 等）
 */
async function uploadFileTemplate(tempFilePath, meta) {
  return springAuth.uploadFileTemplate(tempFilePath, meta);
}

module.exports = {
  fetchFileTemplates,
  downloadTemplateToTempFile,
  uploadFileTemplate,
};
