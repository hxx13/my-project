/**
 * 教职工消息中心：通知与待办 | 通讯录 | 会话（默认进入「通知与待办」）。
 * 角标：主栏用 pending-badges；会话行用通讯录 unreadFromPeer 合并。
 */
const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const staffChatApi = require('../../utils/staffChatApi.js');
const {
  peekPendingBadges,
  refreshPendingBadges,
} = require('../../../utils/badgeSnapshotStore.js');
const { formatBadgeText, staffMessagesSidebarBadgeText } = require('../../../utils/pendingBadgeCounts.js');

/** 「通知与待办」主 Tab 角标：仅 notify + staffUnifiedWorkInboxPending，不含 chatUnread */
function workInboxTabBadgeText(c) {
  if (!c) return '';
  const sum = Number(c.notify || 0) + Number(c.staffUnifiedWorkInboxPending || 0);
  return sum > 0 ? formatBadgeText(sum) : '';
}

function mergeUnreadIntoConversations(conversations, contactRows) {
  const map = {};
  (contactRows || []).forEach((r) => {
    const id = r && r.id != null ? String(r.id).trim() : '';
    if (!id) return;
    const u = Number(r.unreadFromPeer || 0);
    if (u > 0) map[id] = u;
  });
  return (conversations || []).map((c) => {
    const peerId = c && c.peerUserId != null ? String(c.peerUserId).trim() : '';
    const n = peerId ? Number(map[peerId] || 0) : 0;
    return {
      ...c,
      unreadBadgeText: n > 0 ? formatBadgeText(n) : '',
    };
  });
}

function sortConversationsPinnedThenTime(list) {
  return [...(list || [])].sort((a, b) => {
    const pa = a.pinned ? 1 : 0;
    const pb = b.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const ta = String(a.lastMessageAt || '');
    const tb = String(b.lastMessageAt || '');
    return tb.localeCompare(ta);
  });
}

Page({
  data: {
    hubTab: 'work',
    workInitialTab: '',
    /** van-swipe-cell right-width 为 px：三枚操作各 66px */
    convSwipeRightWidth: 198,
    conversations: [],
    convLoading: false,
    contacts: [],
    contactLoading: false,
    contactKeyword: '',
    badgeChatText: '',
    badgeContactsText: '',
    badgeWorkText: '',
  },

  onPullDownRefresh() {
    if (this.data.hubTab === 'work') {
      const comp = this.selectComponent('#workInbox');
      if (comp && comp.onPullDownRefresh) comp.onPullDownRefresh();
    } else {
      wx.stopPullDownRefresh();
    }
  },

  onReachBottom() {
    if (this.data.hubTab === 'work') {
      const comp = this.selectComponent('#workInbox');
      if (comp && comp.onReachBottom) comp.onReachBottom();
    }
  },

  onLoad(query) {
    const hubTab = query && query.hubTab ? String(query.hubTab).trim() : '';
    const workTab = query && query.workTab ? String(query.workTab).trim() : '';
    const next = { workInitialTab: workTab };
    if (hubTab === 'work' || hubTab === 'contacts' || hubTab === 'chats') {
      next.hubTab = hubTab;
    } else {
      next.hubTab = 'work';
    }
    this.setData(next);
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/staffChatHub/index', role, 'STAFF')) return;
    void this.syncHubBadges();
    void this.refreshActiveHub();
    if (this.data.hubTab === 'work') {
      wx.nextTick(() => {
        const comp = this.selectComponent('#workInbox');
        if (comp && comp.runWorkInboxShow) void comp.runWorkInboxShow();
      });
    }
  },

  async syncHubBadges() {
    try {
      await refreshPendingBadges();
    } catch (e) {
      /* ignore */
    }
    const c = peekPendingBadges();
    const chatN = c ? Number(c.chatUnread || 0) : 0;
    const chatT =
      c && c.chatUnreadText != null && String(c.chatUnreadText).trim() !== ''
        ? String(c.chatUnreadText).trim()
        : formatBadgeText(chatN);
    const workT = workInboxTabBadgeText(c || {});
    let contactsBadge = '';
    const rows = this.data.contacts || [];
    let sum = 0;
    rows.forEach((r) => {
      sum += Number(r.unreadFromPeer || 0);
    });
    if (sum > 0) contactsBadge = formatBadgeText(sum);
    this.setData({
      badgeChatText: chatN > 0 ? chatT : '',
      badgeWorkText: workT || '',
      badgeContactsText: contactsBadge,
    });
    const navBadge = staffMessagesSidebarBadgeText(c || {});
    wx.setNavigationBarTitle({ title: navBadge ? `消息（${navBadge}）` : '消息' });
  },

  refreshActiveHub() {
    if (this.data.hubTab === 'chats') return this.loadConversations();
    if (this.data.hubTab === 'contacts') return this.reloadContacts();
    return Promise.resolve();
  },

  onHubTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.hubTab) return;
    this.setData({ hubTab: tab }, () => {
      void this.refreshActiveHub();
      void this.syncHubBadges();
      if (tab === 'work') {
        wx.nextTick(() => {
          const comp = this.selectComponent('#workInbox');
          if (comp && comp.runWorkInboxShow) void comp.runWorkInboxShow();
        });
      }
    });
  },

  async loadConversations() {
    this.setData({ convLoading: true });
    try {
      const list = await staffChatApi.fetchConversations();
      const pinnedFirst = sortConversationsPinnedThenTime(list);
      let contactRows = [];
      try {
        const res = await staffChatApi.fetchStaffContacts({ page: 1, size: 200 });
        contactRows = Array.isArray(res.data) ? res.data : [];
      } catch (e2) {
        contactRows = [];
      }
      const conversations = mergeUnreadIntoConversations(pinnedFirst, contactRows);
      this.setData({ conversations });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.setData({ conversations: [] });
    } finally {
      this.setData({ convLoading: false });
    }
  },

  openChatRoom(e) {
    const id = e.currentTarget.dataset.id;
    const peer = e.currentTarget.dataset.peer || '';
    if (!id) return;
    const encPeer = encodeURIComponent(peer || '聊天');
    wx.navigateTo({
      url: `/package-feature/pages/staffChatRoom/index?conversationId=${encodeURIComponent(id)}&peerTitle=${encPeer}`,
    });
  },

  closeConvSwipeById(conversationId) {
    const id = String(conversationId || '').trim();
    if (!id) return;
    try {
      const comp = this.selectComponent(`#conv-swipe-${id}`);
      if (comp && typeof comp.close === 'function') comp.close();
    } catch (e) {
      /* ignore */
    }
  },

  async onConvSwipeAction(e) {
    const id = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
    const action = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.action) || '';
    this.closeConvSwipeById(id);
    if (!id || !action) return;
    if (action === 'pin') {
      void this.togglePin(id);
      return;
    }
    if (action === 'read') {
      try {
        await staffChatApi.markConversationRead(id);
        /** 保存后仅合并当前行与通讯录未读，禁止整表 load — post-save-no-full-refresh.mdc */
        const row = (this.data.conversations || []).find((c) => c.id === id);
        const peerId = row && row.peerUserId != null ? String(row.peerUserId).trim() : '';
        const conversations = sortConversationsPinnedThenTime(
          (this.data.conversations || []).map((c) =>
            c.id === id ? { ...c, unreadBadgeText: '' } : c,
          ),
        );
        const contacts = (this.data.contacts || []).map((c) =>
          peerId && String(c.id) === peerId ? { ...c, unreadFromPeer: 0 } : c,
        );
        this.setData({ conversations, contacts });
        try {
          await refreshPendingBadges({ force: true });
        } catch (e2) {
          /* ignore */
        }
        void this.syncHubBadges();
        const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
        if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();
      } catch (err) {
        wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
      }
      return;
    }
    if (action === 'delete') {
      this.confirmHide(id);
    }
  },

  async togglePin(conversationId) {
    const row = (this.data.conversations || []).find((c) => c.id === conversationId);
    const next = !(row && row.pinned);
    try {
      await staffChatApi.setConversationPinned(conversationId, next);
      /** 保存后仅合并当前行并重排置顶序，禁止整表 load — post-save-no-full-refresh.mdc */
      const conversations = sortConversationsPinnedThenTime(
        (this.data.conversations || []).map((c) =>
          c.id === conversationId ? { ...c, pinned: next } : c,
        ),
      );
      this.setData({ conversations });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    }
  },

  confirmHide(conversationId) {
    wx.showModal({
      title: '从列表移除',
      content: '可从通讯录再次打开会话恢复列表。',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await staffChatApi.hideConversationFromMyList(conversationId);
          /** 保存后仅移除该行，禁止整表 load — post-save-no-full-refresh.mdc */
          const conversations = (this.data.conversations || []).filter((c) => c.id !== conversationId);
          this.setData({ conversations });
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '移除失败', icon: 'none' });
        }
      },
    });
  },

  onContactKeyword(e) {
    this.setData({ contactKeyword: (e.detail && e.detail.value) || '' });
  },

  reloadContacts() {
    return this.loadContacts();
  },

  async loadContacts() {
    this.setData({ contactLoading: true });
    try {
      const kw = String(this.data.contactKeyword || '').trim();
      const res = await staffChatApi.fetchStaffContacts({ keyword: kw || undefined, page: 1, size: 40 });
      const rows = Array.isArray(res.data) ? res.data : [];
      this.setData({ contacts: rows });
      void this.syncHubBadges();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.setData({ contacts: [] });
    } finally {
      this.setData({ contactLoading: false });
    }
  },

  async openChatFromContact(e) {
    const peerUserId = e.currentTarget.dataset.peerId;
    const name = e.currentTarget.dataset.name || '';
    if (!peerUserId) return;
    wx.showLoading({ title: '打开中…' });
    try {
      const cid = await staffChatApi.openConversation(peerUserId);
      wx.hideLoading();
      const enc = encodeURIComponent(name || '聊天');
      wx.navigateTo({
        url: `/package-feature/pages/staffChatRoom/index?conversationId=${encodeURIComponent(cid)}&peerTitle=${enc}`,
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '打开失败', icon: 'none' });
    }
  },
});
