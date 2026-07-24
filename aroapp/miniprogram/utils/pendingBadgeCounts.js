/**
 * 待处理数量：GET /api/me/pending-badges。
 * 报修/采购/物资：按待处理工单条数；消息快捷入口用 homeMessagesQuickBadgeText（私聊+系统通知，不含工单重复计数）。
 */
const springAuth = require('./springAuth.js');

function parseResponse(res) {
  const { statusCode, data } = res;
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false };
    }
  }
  if (statusCode === 401 || statusCode === 403) return { ok: false };
  if (!body || typeof body !== 'object') return { ok: false };
  const okSuccess = body.success === true || body.success === 'true';
  const okCode = Number(body.code) === 200 && body.data != null && typeof body.data === 'object';
  if (!okSuccess && !okCode) return { ok: false };
  return { ok: true, body };
}

/** 显示用：超过 99 显示 99+ */
function formatBadgeText(n) {
  const x = Number(n) || 0;
  if (x <= 0) return '';
  return x > 99 ? '99+' : String(x);
}

/**
 * 菜单/快捷入口角标：与「物资」一致——能处理且全库有待办时优先展示处理侧数量，否则展示本人申请侧。
 * 避免 PLATFORM_OWNER 等仅有 processRepair>0、repair=0 时在「报修申请」上不显示角标。
 */
function menuBadgePreferProcessThenApplicant(c, processKey, processTextKey, applicantKey, applicantTextKey) {
  if (!c) return '';
  const proc = Number(c[processKey] || 0);
  const mine = Number(c[applicantKey] || 0);
  if (proc > 0) return c[processTextKey] || formatBadgeText(proc);
  if (mine > 0) return c[applicantTextKey] || formatBadgeText(mine);
  return '';
}

/** 与后端缺省一致；失败时不应覆写 badgeSnapshotStore 上次成功快照 */
const EMPTY_BADGE_COUNTS = {
  repair: 0,
  purchase: 0,
  supplies: 0,
  notify: 0,
  processRepair: 0,
  processPurchase: 0,
  processSupplies: 0,
  processMaterial: 0,
  processScanDelay: 0,
  material: 0,
  /** 站内信未读，与 GET /api/chat 已读游标同源 */
  chatUnread: 0,
  /** 与消息页「待处理」合并列表条数同源 */
  staffUnifiedWorkInboxPending: 0,
  /** 侧栏/首页「消息」单一汇总（后端 PendingBadgesService） */
  staffMessagesSidebarTotal: 0,
  repairText: '',
  purchaseText: '',
  suppliesText: '',
  notifyText: '',
  processRepairText: '',
  processPurchaseText: '',
  processSuppliesText: '',
  processMaterialText: '',
  processScanDelayText: '',
  materialText: '',
  chatUnreadText: '',
  staffMessagesSidebarTotalText: '',
};

/** 合并并发 GET pending-badges，避免 TabBar / 首页 / 我的同时打出三份请求 */
let inflightPromise = null;

function resetPendingBadgeInflight() {
  inflightPromise = null;
}

function mapBodyToCounts(body) {
  const d = body.data || {};
  const bc = d.badgeCounters && typeof d.badgeCounters === 'object' ? d.badgeCounters : {};
  /** 扩展 key 覆盖同名扁平字段，便于新域只下发 badgeCounters */
  const pick = (flatKey, ...aliases) => {
    for (let i = 0; i < aliases.length; i += 1) {
      const k = aliases[i];
      if (k != null && bc[k] != null && Number(bc[k]) >= 0) return Number(bc[k]);
    }
    return Number(d[flatKey] || 0);
  };
  const repair = pick('repair', 'repair', 'REPAIR_APPLICANT');
  const purchase = pick('purchase', 'purchase', 'PURCHASE_APPLICANT');
  const supplies = pick('supplies', 'supplies', 'SUPPLIES_CLAIM_APPLICANT');
  const notify = pick('notify', 'notify', 'NOTIFY_UNREAD');
  const processRepair = pick('processRepair', 'processRepair', 'REPAIR_PROCESS');
  const processPurchase = pick('processPurchase', 'processPurchase', 'PURCHASE_PROCESS');
  const processSupplies = pick('processSupplies', 'processSupplies', 'SUPPLIES_CLAIM_PROCESS');
  const processMaterial = pick('processMaterial', 'processMaterial', 'MATERIAL_REQUEST_PROCESS', 'processMaterialRequest');
  const processScanDelay = pick('processScanDelay', 'processScanDelay', 'SCAN_DELAY_PROCESS');
  const material = pick('material', 'material', 'MATERIAL_REQUEST_APPLICANT', 'materialRequest');
  const chatUnread = pick('chatUnread', 'chatUnread', 'CHAT_DM_UNREAD');
  const staffUnifiedWorkInboxPending = pick(
    'staffUnifiedWorkInboxPending',
    'staffUnifiedWorkInboxPending',
    'STAFF_UNIFIED_WORK_INBOX_PENDING',
  );
  const staffMessagesSidebarTotal = pick(
    'staffMessagesSidebarTotal',
    'staffMessagesSidebarTotal',
    'STAFF_MESSAGES_SIDEBAR_TOTAL',
  );
  const chatUnreadText =
    d.chatUnreadText != null && String(d.chatUnreadText) !== '' ? String(d.chatUnreadText) : formatBadgeText(chatUnread);
  let staffMessagesSidebarTotalText =
    d.staffMessagesSidebarTotalText != null && String(d.staffMessagesSidebarTotalText).trim() !== ''
      ? String(d.staffMessagesSidebarTotalText).trim()
      : '';
  if (!staffMessagesSidebarTotalText && staffMessagesSidebarTotal > 0) {
    staffMessagesSidebarTotalText = formatBadgeText(staffMessagesSidebarTotal);
  }
  if (!staffMessagesSidebarTotalText) {
    const fallbackN = chatUnread + notify + staffUnifiedWorkInboxPending;
    if (fallbackN > 0) staffMessagesSidebarTotalText = formatBadgeText(fallbackN);
    else
      staffMessagesSidebarTotalText =
        d.notifyText != null && String(d.notifyText) !== '' ? String(d.notifyText) : formatBadgeText(notify);
  }
  return {
    repair,
    purchase,
    supplies,
    notify,
    processRepair,
    processPurchase,
    processSupplies,
    processMaterial,
    processScanDelay,
    material,
    chatUnread,
    staffUnifiedWorkInboxPending,
    staffMessagesSidebarTotal,
    repairText: d.repairText != null && String(d.repairText) !== '' ? String(d.repairText) : formatBadgeText(repair),
    purchaseText:
      d.purchaseText != null && String(d.purchaseText) !== '' ? String(d.purchaseText) : formatBadgeText(purchase),
    suppliesText:
      d.suppliesText != null && String(d.suppliesText) !== '' ? String(d.suppliesText) : formatBadgeText(supplies),
    notifyText: d.notifyText != null && String(d.notifyText) !== '' ? String(d.notifyText) : formatBadgeText(notify),
    processRepairText:
      d.processRepairText != null && String(d.processRepairText) !== ''
        ? String(d.processRepairText)
        : formatBadgeText(processRepair),
    processPurchaseText:
      d.processPurchaseText != null && String(d.processPurchaseText) !== ''
        ? String(d.processPurchaseText)
        : formatBadgeText(processPurchase),
    processSuppliesText:
      d.processSuppliesText != null && String(d.processSuppliesText) !== ''
        ? String(d.processSuppliesText)
        : formatBadgeText(processSupplies),
    processMaterialText:
      d.processMaterialText != null && String(d.processMaterialText) !== ''
        ? String(d.processMaterialText)
        : formatBadgeText(processMaterial),
    processScanDelayText:
      d.processScanDelayText != null && String(d.processScanDelayText) !== ''
        ? String(d.processScanDelayText)
        : formatBadgeText(processScanDelay),
    materialText:
      d.materialText != null && String(d.materialText) !== '' ? String(d.materialText) : formatBadgeText(material),
    chatUnreadText,
    staffMessagesSidebarTotalText,
  };
}

/**
 * 首页/我的「消息」格角标：与 Web 侧栏 staffMessagesSidebarTotalText 同源；旧后端无新字段时降级。
 * @param {typeof EMPTY_BADGE_COUNTS} c
 */
function staffMessagesSidebarBadgeText(c) {
  if (!c) return '';
  const t = c.staffMessagesSidebarTotalText != null ? String(c.staffMessagesSidebarTotalText).trim() : '';
  if (t) return t;
  return c.notifyText || '';
}

/**
 * 首页快捷「消息」角标：私聊 + 系统通知，不含工单待办（工单已在报修/采购/物资入口展示，避免重复计数）。
 * @param {typeof EMPTY_BADGE_COUNTS} c
 */
function homeMessagesQuickBadgeText(c) {
  if (!c) return '';
  const chat = Number(c.chatUnread || 0);
  const notify = Number(c.notify || 0);
  const sum = chat + notify;
  if (sum <= 0) return '';
  if (chat > 0 && c.chatUnreadText) {
    const n = notify > 0 ? notify : 0;
    if (n <= 0) return String(c.chatUnreadText).trim();
  }
  return formatBadgeText(sum);
}

/**
 * @param {{ force?: boolean }} [opts] force=true 时不与其它调用合并（已读后刷新等）
 * @returns {Promise<{ ok: true } & typeof EMPTY_BADGE_COUNTS | { ok: false }>}
 */
async function fetchPendingBadgeCounts(opts) {
  const force = !!(opts && opts.force);
  const token = wx.getStorageSync(springAuth.KEYS.TOKEN);
  if (!token) return { ok: true, ...EMPTY_BADGE_COUNTS };

  if (!force && inflightPromise) return inflightPromise;

  const run = async () => {
    try {
      const res = await springAuth.springRequest({
        url: '/api/me/pending-badges',
        method: 'GET',
        data: {},
      });
      const p = parseResponse(res);
      if (!p.ok) return { ok: false };
      return { ok: true, ...mapBodyToCounts(p.body) };
    } catch (e) {
      console.warn('[pendingBadgeCounts]', e);
      return { ok: false };
    }
  };

  const p = run();
  if (!force) {
    inflightPromise = p.finally(() => {
      inflightPromise = null;
    });
    return inflightPromise;
  }
  return p;
}

/** path → 待办角标字段（自定义 TabBar 等可使用） */
const PATH_BADGE_MAP = {
  '/pages/notifications/index': 'notify',
  '/pages/repairRequest/index': 'repair',
  '/pages/purchaseRequest/index': 'purchase',
  '/pages/supplies/index': 'supplies',
  '/pages/repairProcess/index': 'processRepair',
  '/pages/purchaseProcess/index': 'processPurchase',
  '/pages/suppliesProcess/index': 'processSupplies',
};

function badgeForPath(path, counts) {
  let p = String(path || '').trim();
  if (p.startsWith('/package-feature/pages/')) {
    p = `/pages/${p.slice('/package-feature/pages/'.length)}`;
  }
  const key = PATH_BADGE_MAP[p];
  if (!key || !counts) return { n: 0, text: '' };
  const n = Number(counts[key] || 0);
  const text = counts[`${key}Text`] || formatBadgeText(n);
  return { n, text };
}

/** 底部 Tab「首页 / 我的」汇总：报修+采购+物资+消息 + 处理侧三类（与侧栏一致） */
function aggregateTabBarPending(counts) {
  if (!counts) return 0;
  return (
    Number(counts.repair || 0) +
    Number(counts.purchase || 0) +
    Number(counts.supplies || 0) +
    Number(counts.notify || 0) +
    Number(counts.processRepair || 0) +
    Number(counts.processPurchase || 0) +
    Number(counts.processSupplies || 0)
  );
}

function studentReviewMenuBadgeText(c) {
  if (!c) return '';
  const material = Number(c.processMaterial || 0);
  const scanDelay = Number(c.processScanDelay || 0);
  const total = material + scanDelay;
  if (total <= 0) return '';
  return formatBadgeText(total);
}

/** 学生申领：本人物资工单未读/待办（与 material 角标同源） */
function studentMaterialMenuBadgeText(c) {
  if (!c) return '';
  const n = Number(c.material || 0);
  if (n <= 0) return '';
  return c.materialText || formatBadgeText(n);
}

module.exports = {
  fetchPendingBadgeCounts,
  resetPendingBadgeInflight,
  formatBadgeText,
  menuBadgePreferProcessThenApplicant,
  staffMessagesSidebarBadgeText,
  homeMessagesQuickBadgeText,
  studentReviewMenuBadgeText,
  studentMaterialMenuBadgeText,
  EMPTY_BADGE_COUNTS,
  PATH_BADGE_MAP,
  badgeForPath,
  aggregateTabBarPending,
};
