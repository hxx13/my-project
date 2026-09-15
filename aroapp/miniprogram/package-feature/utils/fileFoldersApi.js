/**
 * 文件模板库-文件夹：与后端 AdminFileFolderController 同源。
 * 全部返回 { ok, message, ... }，不抛业务异常（网络异常也兜成 ok:false）。
 */
const springAuth = require('../../utils/springAuth.js');

/**
 * 解析响应并判包。springRequest 只在网络层失败时 reject，HTTP 200 + body {success:false}
 * 会正常 resolve，且后端出错时状态码仍是 200，只能靠 body 的 success/code 判定。
 */
function judge(res, fallback) {
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
  if (!ok) return { ok: false, message: body.message || fallback };
  return { ok: true, body };
}

/** 文件夹整棵树，节点含 id/parentId/name/icon/children/directCount/totalCount */
async function fetchFileFolderTree() {
  let res;
  try {
    res = await springAuth.springRequest({
      url: '/api/admin/file-folders/tree',
      method: 'GET',
      data: {},
    });
  } catch (e) {
    return { ok: false, message: '网络异常，加载失败' };
  }
  const j = judge(res, '加载失败');
  if (!j.ok) return j;
  const rows = Array.isArray(j.body.data) ? j.body.data : [];
  return { ok: true, message: '', rows };
}

/** 新建文件夹。parentId 省略/null = 建在根；返回 { ok, message, data } */
async function createFileFolder(params) {
  const p = params || {};
  let res;
  try {
    res = await springAuth.springRequest({
      url: '/api/admin/file-folders',
      method: 'POST',
      data: { parentId: p.parentId, name: p.name, icon: p.icon },
    });
  } catch (e) {
    return { ok: false, message: '网络异常，新建失败' };
  }
  const j = judge(res, '新建失败');
  if (!j.ok) return j;
  return { ok: true, message: j.body.message || '新建成功', data: j.body.data };
}

/** 改名/改父/改图标：patch 形如 { name } / { parentId } / { icon }，null 字段=不改 */
async function updateFileFolder(id, patch) {
  const enc = encodeURIComponent(String(id == null ? '' : id).trim());
  let res;
  try {
    res = await springAuth.springRequest({
      url: `/api/admin/file-folders/${enc}`,
      method: 'PATCH',
      data: patch || {},
    });
  } catch (e) {
    return { ok: false, message: '网络异常，保存失败' };
  }
  const j = judge(res, '保存失败');
  if (!j.ok) return j;
  return { ok: true, message: j.body.message || '保存成功', data: j.body.data };
}

/** 删除文件夹。非空时后端返回可读错误消息，原样透出 */
async function deleteFileFolder(id) {
  const enc = encodeURIComponent(String(id == null ? '' : id).trim());
  let res;
  try {
    res = await springAuth.springRequest({
      url: `/api/admin/file-folders/${enc}`,
      method: 'DELETE',
      data: {},
    });
  } catch (e) {
    return { ok: false, message: '网络异常，删除失败' };
  }
  const j = judge(res, '删除失败');
  if (!j.ok) return j;
  return { ok: true, message: j.body.message || '删除成功' };
}

module.exports = {
  fetchFileFolderTree,
  createFileFolder,
  updateFileFolder,
  deleteFileFolder,
};
