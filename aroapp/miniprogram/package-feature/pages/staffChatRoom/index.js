const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const staffChatApi = require('../../utils/staffChatApi.js');
const twinScan = require('../../../utils/twinScanAnalyze.js');
const { refreshPendingBadges } = require('../../../utils/badgeSnapshotStore.js');

function formatShortTime(iso) {
  if (!iso) return '';
  const s = String(iso).replace('T', ' ');
  return s.length > 16 ? s.slice(5, 16) : s;
}

function mapMessageRows(rows, myUserId) {
  const uid = String(myUserId || '');
  return (rows || []).map((m) => ({
    ...m,
    self: uid && String(m.senderId || '') === uid,
    timeShort: formatShortTime(m.createTime),
  }));
}

const CHAT_EMOJI_LIST = [
  '😀',
  '😁',
  '😂',
  '🤣',
  '😊',
  '😍',
  '🥰',
  '😘',
  '👍',
  '👏',
  '🙏',
  '💪',
  '🔥',
  '✨',
  '🎉',
  '❤️',
  '😅',
  '😭',
  '🤔',
  '😴',
  '👀',
  '✅',
  '❌',
  '📎',
];

Page({
  data: {
    conversationId: '',
    peerTitle: '聊天',
    messages: [],
    draft: '',
    draftHasText: false,
    emojiOpen: false,
    emojiList: CHAT_EMOJI_LIST,
    loading: false,
    scrollIntoView: '',
  },
  _pollTimer: null,
  _myUserId: '',

  onLoad(query) {
    const cid = query && query.conversationId ? decodeURIComponent(String(query.conversationId)) : '';
    const title = query && query.peerTitle ? decodeURIComponent(String(query.peerTitle)) : '聊天';
    this._myUserId = twinScan.readSpringUserId() || '';
    if (!cid) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    this.setData({ conversationId: cid, peerTitle: title || '聊天' });
    wx.setNavigationBarTitle({ title: title || '聊天' });
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/staffChatRoom/index', role, 'STAFF')) return;
    this._myUserId = twinScan.readSpringUserId() || '';
    void this.reloadMessages();
    this.startPoll();
  },

  onHide() {
    this.stopPoll();
  },

  onUnload() {
    this.stopPoll();
  },

  startPoll() {
    this.stopPoll();
    this._pollTimer = setInterval(() => {
      void this.mergePoll();
    }, 35000);
  },

  stopPoll() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  async reloadMessages() {
    const cid = this.data.conversationId;
    if (!cid) return;
    this.setData({ loading: true });
    try {
      const rows = await staffChatApi.fetchMessages(cid, undefined, 80);
      const messages = mapMessageRows(rows, this._myUserId);
      this.setData({ messages, loading: false }, () => this.scrollToBottom());
      await staffChatApi.markConversationRead(cid);
      void refreshPendingBadges({ force: true }).then(() => {
        const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
        if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },

  /** 轮询合并新消息：仅追加 after 之后，禁止为同步一条整表重拉 — post-save-no-full-refresh.mdc */
  async mergePoll() {
    const cid = this.data.conversationId;
    const list = this.data.messages || [];
    if (!cid || list.length === 0) return;
    const last = list[list.length - 1];
    const after = last && last.id ? String(last.id) : undefined;
    if (!after) return;
    try {
      const rows = await staffChatApi.fetchMessages(cid, after, 80);
      if (!rows || rows.length === 0) return;
      const mapped = mapMessageRows(rows, this._myUserId);
      const messages = list.concat(mapped);
      this.setData({ messages }, () => this.scrollToBottom());
      await staffChatApi.markConversationRead(cid);
      void refreshPendingBadges({ force: true }).then(() => {
        const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
        if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();
      });
    } catch (err) {
      /* 弱网忽略 */
    }
  },

  scrollToBottom() {
    this.setData({ scrollIntoView: 'bottom-anchor' });
  },

  onDraftInput(e) {
    const draft = (e.detail && e.detail.value) || '';
    this.setData({ draft, draftHasText: !!String(draft).trim() });
  },

  onToggleEmoji() {
    this.setData({ emojiOpen: !this.data.emojiOpen });
  },

  onEmojiTap(e) {
    const ch = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.ch) || '';
    if (!ch) return;
    const draft = `${this.data.draft || ''}${ch}`;
    this.setData({ draft, draftHasText: !!String(draft).trim() });
  },

  async onSend() {
    const cid = this.data.conversationId;
    const text = String(this.data.draft || '').trim();
    if (!cid || !text) {
      if (!text) wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '发送中…' });
    try {
      await staffChatApi.postChatMessage(cid, { body: text });
      this.setData({ draft: '', draftHasText: false, emojiOpen: false });
      const rows = await staffChatApi.fetchMessages(cid, undefined, 80);
      const messages = mapMessageRows(rows, this._myUserId);
      this.setData({ messages });
      await staffChatApi.markConversationRead(cid);
      void refreshPendingBadges({ force: true }).then(() => {
        const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
        if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();
      });
      wx.hideLoading();
      this.scrollToBottom();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: (e && e.message) || '发送失败', icon: 'none' });
    }
  },

  onChooseAttachment() {
    const cid = this.data.conversationId;
    if (!cid) return;
    wx.chooseMessageFile({
      count: 1,
      type: 'all',
      success: async (res) => {
        const f = res.tempFiles && res.tempFiles[0];
        if (!f || !f.path) return;
        wx.showLoading({ title: '上传中…' });
        try {
          const up = await staffChatApi.uploadChatAttachment(cid, f.path, {
            fileName: f.name || `file_${Date.now()}`,
            mimeType: f.type || 'application/octet-stream',
          });
          const attId = (up && up.attachmentId) || '';
          if (!attId) throw new Error('未返回附件 id');
          await staffChatApi.postChatMessage(cid, { attachmentId: attId });
          const rows = await staffChatApi.fetchMessages(cid, undefined, 80);
          const messages = mapMessageRows(rows, this._myUserId);
          this.setData({ messages });
          await staffChatApi.markConversationRead(cid);
          void refreshPendingBadges({ force: true }).then(() => {
            const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
            if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();
          });
          wx.hideLoading();
          this.scrollToBottom();
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' });
        }
      },
    });
  },

  async onOpenAttachment(e) {
    const aid = e.currentTarget.dataset.aid;
    if (!aid) return;
    wx.showLoading({ title: '打开中…' });
    try {
      const path = await staffChatApi.downloadChatAttachmentToTempFile(aid);
      wx.hideLoading();
      wx.openDocument({
        filePath: path,
        showMenu: true,
        fail(err) {
          wx.showToast({ title: (err && err.errMsg) || '无法打开', icon: 'none' });
        },
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '下载失败', icon: 'none' });
    }
  },
});
