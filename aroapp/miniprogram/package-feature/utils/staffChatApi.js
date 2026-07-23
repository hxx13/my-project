/**
 * 教职工站内信 REST：与 Web frontend/src/api/domains/chat.api.ts、Spring ChatController 同源。
 */
const springAuth = require('../../utils/springAuth.js');

function parseResult(res) {
  const { statusCode, data } = res;
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: '未登录或无权限' };
  }
  if (!body || typeof body !== 'object') return { ok: false, message: '响应无效' };
  const okSuccess = body.success === true || body.success === 'true';
  const okHttp = Number(body.code) === 200;
  if (!okSuccess && !okHttp) return { ok: false, message: (body && body.message) || '请求失败' };
  return { ok: true, body };
}

async function springJson(method, url, data) {
  const res = await springAuth.springRequest({
    url,
    method: method || 'GET',
    data: data != null ? data : {},
  });
  return parseResult(res);
}

function enc(s) {
  return encodeURIComponent(String(s || '').trim());
}

async function fetchConversations() {
  const p = await springJson('GET', '/api/chat/conversations', {});
  if (!p.ok) throw new Error(p.message);
  const d = p.body.data || {};
  const arr = Array.isArray(d.data) ? d.data : [];
  return arr.map((row) => ({
    ...row,
    pinned: Boolean(row.pinned),
  }));
}

async function openConversation(peerUserId) {
  const p = await springJson('POST', `/api/chat/conversations/open/${enc(peerUserId)}`, {});
  if (!p.ok) throw new Error(p.message);
  const id = (p.body.data && p.body.data.conversationId) || '';
  if (!id) throw new Error('未返回会话 id');
  return String(id);
}

async function markConversationRead(conversationId) {
  const p = await springJson('POST', `/api/chat/conversations/${enc(conversationId)}/read`, {});
  if (!p.ok) throw new Error(p.message);
}

async function setConversationPinned(conversationId, pinned) {
  const p = await springJson('PUT', `/api/chat/conversations/${enc(conversationId)}/pinned`, { pinned: !!pinned });
  if (!p.ok) throw new Error(p.message);
}

async function hideConversationFromMyList(conversationId) {
  const p = await springJson('DELETE', `/api/chat/conversations/${enc(conversationId)}/from-my-list`, {});
  if (!p.ok) throw new Error(p.message);
}

async function fetchMessages(conversationId, afterMessageId, limit) {
  const data = { limit: limit != null ? Number(limit) : 80 };
  if (afterMessageId != null && String(afterMessageId).trim() !== '') {
    data.afterMessageId = String(afterMessageId).trim();
  }
  const p = await springJson('GET', `/api/chat/conversations/${enc(conversationId)}/messages`, data);
  if (!p.ok) throw new Error(p.message);
  const d = p.body.data || {};
  return Array.isArray(d.data) ? d.data : [];
}

async function postChatMessage(conversationId, payload) {
  const body = {};
  if (payload && payload.body != null && String(payload.body).trim() !== '') {
    body.body = String(payload.body).trim();
  }
  if (payload && payload.attachmentId != null && String(payload.attachmentId).trim() !== '') {
    body.attachmentId = String(payload.attachmentId).trim();
  }
  const p = await springJson('POST', `/api/chat/conversations/${enc(conversationId)}/messages`, body);
  if (!p.ok) throw new Error(p.message);
  return p.body.data || {};
}

async function uploadChatAttachment(conversationId, tempFilePath, meta) {
  return springAuth.uploadChatAttachment(conversationId, tempFilePath, meta);
}

/** 将附件写入本地临时文件并返回路径，供 wx.openDocument */
async function downloadChatAttachmentToTempFile(attachmentId) {
  const res = await springAuth.springRequest({
    url: `/api/chat/attachments/${enc(attachmentId)}/download`,
    method: 'GET',
    data: {},
    responseType: 'arraybuffer',
  });
  if (res.statusCode !== 200 || !res.data || !res.data.isBase64) {
    throw new Error('下载失败');
  }
  const b64 = res.data.bodyBase64 || '';
  const cd = String(res.data.contentDisposition || '');
  let ext = 'bin';
  const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
  if (m && m[1]) {
    const name = decodeURIComponent(m[1].replace(/["']/g, '').trim());
    const dot = name.lastIndexOf('.');
    if (dot > 0) ext = name.slice(dot + 1).slice(0, 12) || 'bin';
  }
  const path = `${wx.env.USER_DATA_PATH}/chat_att_${Date.now()}.${ext}`;
  wx.getFileSystemManager().writeFileSync(path, b64, 'base64');
  return path;
}

async function fetchStaffContacts(params) {
  const data = {
    page: (params && params.page) || 1,
    size: (params && params.size) || 30,
  };
  if (params && params.keyword) data.keyword = params.keyword;
  const p = await springJson('GET', '/api/chat/staff-contacts', data);
  if (!p.ok) throw new Error(p.message);
  return p.body.data || { total: 0, data: [], page: 1, size: 30 };
}

async function fetchContactGroups() {
  const p = await springJson('GET', '/api/chat/contact-groups', {});
  if (!p.ok) throw new Error(p.message);
  const inner = (p.body.data && p.body.data.data) || [];
  return Array.isArray(inner) ? inner : [];
}

async function addContactBookmark(peerUserId) {
  const p = await springJson('POST', `/api/chat/contact-bookmarks/${enc(peerUserId)}`, {});
  if (!p.ok) throw new Error(p.message);
}

async function removeContactBookmark(peerUserId) {
  const p = await springJson('DELETE', `/api/chat/contact-bookmarks/${enc(peerUserId)}`, {});
  if (!p.ok) throw new Error(p.message);
}

async function setContactAssignment(peerUserId, groupId) {
  const p = await springJson('PUT', '/api/chat/contact-assignments', {
    peerUserId: String(peerUserId || ''),
    groupId: groupId != null ? String(groupId) : '',
  });
  if (!p.ok) throw new Error(p.message);
}

module.exports = {
  fetchConversations,
  openConversation,
  markConversationRead,
  setConversationPinned,
  hideConversationFromMyList,
  fetchMessages,
  postChatMessage,
  uploadChatAttachment,
  downloadChatAttachmentToTempFile,
  fetchStaffContacts,
  fetchContactGroups,
  addContactBookmark,
  removeContactBookmark,
  setContactAssignment,
};
