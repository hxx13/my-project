import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { Bell, MessageCircle, Pin, Smile, Trash2, Users } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
  fetchContactGroups,
  downloadChatAttachment,
  fetchConversations,
  fetchMessages,
  fetchStaffContacts,
  hideConversationFromMyList,
  markConversationRead,
  openConversation,
  postChatMessage,
  setConversationPinned,
  uploadChatAttachment,
  type ChatMessage,
  type ContactGroup,
  type ConversationSummary,
  type StaffContact,
} from "@/api/domains/chat.api";
import { markNotificationRead } from "@/api/domains/notification.api";
import { fetchPurchaseOrderDetail } from "@/api/domains/purchase.api";
import { fetchRepairOrderDetail } from "@/api/domains/repair.api";
import {
  createOrReuseSupplyClaimPdfLink,
  fetchSupplyClaimDetail,
  fulfillSupplyClaim,
  listSupplyClaimPdfLinks,
  type SupplyClaimPdfLinkItem,
} from "@/api/domains/supplies.api";
import { fetchPublicPagePermissions, type PublicPagePermissionNode } from "@/api/domains/pagePermission.api";
import { fetchPendingBadges, type PendingBadges } from "@/api/domains/me.api";
import type { NotificationRecord } from "@/api/domains/notification.api";
import {
  ADMIN_PENDING_BADGES_REFRESH_EVENT,
  ADMIN_STAFF_CHAT_PUSH_DETAIL_EVENT,
  ADMIN_STAFF_CONTACTS_REFRESH_EVENT,
  type StaffChatSsePayload,
} from "@/features/admin/adminPendingBadgesEvents";
import {
  StaffNotificationWorkInbox,
  type StaffNotificationWorkInboxHandle,
  type StaffInboxUnifiedItem,
} from "@/features/staff-inbox/StaffNotificationWorkInbox";
import { WorkOrderInlineDetail, type WorkOrderInlineModel } from "@/features/staff-inbox/WorkOrderInlineDetail";
import { authStorage } from "@/features/auth/authStorage";
import { canAccessWebPage } from "@/features/auth/pagePermissionAccess";
import { hasMinRole } from "@/features/auth/roleAccess";
import { cn } from "@/lib/utils";
import {
  formatBeijingDateTimeFull,
  formatBeijingDateTimeMedium,
  formatBeijingTimeHM,
  parseToDate,
  sameCalendarDayBeijing,
} from "@/utils/beijingTime";

const FRIENDS_PATH = "/admin/staff-messages";

type MainRail = "messages" | "friends";
type CenterTab = "chats" | "notify";

type RightPanel =
  | { kind: "notice"; row: NotificationRecord }
  | { kind: "work"; item: StaffInboxUnifiedItem };

function formatBadgeCount(n: number): string {
  if (n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}

function badgeBubble(n: number, className?: string) {
  if (n <= 0) return null;
  return (
    <span
      className={cn(
        "absolute -right-1 -top-1 inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white",
        className
      )}
    >
      {formatBadgeCount(n)}
    </span>
  );
}

/** 常用表情（Unicode，无需额外字体包） */
const CHAT_QUICK_EMOJIS = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😅",
  "🤣",
  "😂",
  "🙂",
  "😉",
  "😊",
  "🥰",
  "😍",
  "🤔",
  "👍",
  "👎",
  "👌",
  "🙏",
  "👏",
  "🔥",
  "✅",
  "❌",
  "⭐",
  "💡",
  "📎",
  "🎉",
  "❤️",
];

function formatDayDivider(d: Date): string {
  const now = new Date();
  if (sameCalendarDayBeijing(d, now)) return "今天";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameCalendarDayBeijing(d, y)) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

function formatMessageClock(iso: string): string {
  return formatBeijingTimeHM(iso);
}

function sortKeyFromIso(v: string | undefined | null) {
  const d = parseToDate(v ?? "");
  return d ? d.getTime() : 0;
}

function contactDisplayName(c: StaffContact): string {
  const dn = (c.displayName || "").trim();
  if (dn) return dn;
  const nick = (c.displayNickname || "").trim();
  return nick || c.username;
}

type GroupFilter = "ALL" | "UNGROUPED" | string;

type ConvRow = ConversationSummary;

function peerFromConversation(conv: ConvRow, unread: number): StaffContact {
  return {
    id: conv.peerUserId,
    username: conv.peerUsername,
    displayNickname: conv.peerDisplayNickname,
    displayName: "",
    contactGroupId: "",
    unreadFromPeer: unread,
  };
}

export default function StaffMessagesPage() {
  const role = authStorage.getRole() || "STUDENT";
  const canStaff = hasMinRole(role, "STAFF");
  const isAdmin = hasMinRole(role, "ADMIN");
  const [searchParams, setSearchParams] = useSearchParams();
  const [permNodes, setPermNodes] = useState<PublicPagePermissionNode[]>([]);

  const [mainRail, setMainRail] = useState<MainRail>(() => (searchParams.get("view") === "friends" ? "friends" : "messages"));
  const [centerTab, setCenterTab] = useState<CenterTab>(() => {
    const w = searchParams.get("workTab");
    if (w === "notice" || w === "pending" || w === "done" || w === "notify") return "notify";
    return "chats";
  });
  const [rightPanel, setRightPanel] = useState<RightPanel | null>(null);
  const [inlineWork, setInlineWork] = useState<WorkOrderInlineModel | null>(null);
  const [inlineWorkLoading, setInlineWorkLoading] = useState(false);
  const [inlineWorkError, setInlineWorkError] = useState<string | null>(null);
  const [claimGrantMap, setClaimGrantMap] = useState<Record<number, boolean>>({});
  const [claimLinks, setClaimLinks] = useState<SupplyClaimPdfLinkItem[]>([]);
  const [claimLinksLoading, setClaimLinksLoading] = useState(false);
  const [fulfillingInline, setFulfillingInline] = useState(false);
  const [pendingBadges, setPendingBadges] = useState<PendingBadges | null>(null);
  const [inboxCounts, setInboxCounts] = useState({ noticeUnread: 0, pendingCount: 0, doneCount: 0 });
  const noticeInboxRef = useRef<StaffNotificationWorkInboxHandle>(null);

  const [keyword, setKeyword] = useState("");
  /** 供 loadContacts 稳定引用，避免 keyword 每字变动触发「整表」effect 高频请求 */
  const keywordRef = useRef(keyword);
  /** canUseFriendsPage 变为 true 后的首次 keyword effect 跳过 debounce，避免与首屏 load 重复打接口 */
  const contactsKeywordSyncSkipRef = useRef(true);
  /** staff_chat 触发的联系人/会话列表刷新节流，避免打开会话或连发事件时打爆接口 */
  const staffChatListRefreshAtRef = useRef(0);
  const [contacts, setContacts] = useState<StaffContact[]>([]);
  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  /** 会话列表右键菜单 */
  const [convCtxMenu, setConvCtxMenu] = useState<{ x: number; y: number; conv: ConvRow } | null>(null);
  const convCtxMenuRef = useRef<HTMLDivElement | null>(null);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("ALL");
  const [peer, setPeer] = useState<StaffContact | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const lastMessageIdRef = useRef<string | null>(null);
  const [text, setText] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const peerRef = useRef<StaffContact | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const emojiWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    peerRef.current = peer;
  }, [peer]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    keywordRef.current = keyword;
  }, [keyword]);

  useEffect(() => {
    lastMessageIdRef.current = null;
  }, [conversationId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await fetchPublicPagePermissions("WEB");
        if (alive) setPermNodes(list || []);
      } catch {
        if (alive) setPermNodes([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!emojiOpen) return;
      const el = emojiWrapRef.current;
      if (el && !el.contains(e.target as Node)) setEmojiOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [emojiOpen]);

  const pullPendingBadges = useCallback(async () => {
    try {
      const b = await fetchPendingBadges();
      setPendingBadges(b);
    } catch {
      setPendingBadges(null);
    }
  }, []);

  useEffect(() => {
    void pullPendingBadges();
    const onRefresh = () => void pullPendingBadges();
    window.addEventListener(ADMIN_PENDING_BADGES_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_PENDING_BADGES_REFRESH_EVENT, onRefresh);
  }, [pullPendingBadges]);

  const canUseFriendsPage = useMemo(
    () => hasMinRole(role, "STAFF") && canAccessWebPage(permNodes, FRIENDS_PATH, role, "STAFF"),
    [permNodes, role]
  );

  const unreadByPeerId = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contacts) {
      m.set(c.id, Math.max(0, Math.floor(Number(c.unreadFromPeer) || 0)));
    }
    return m;
  }, [contacts]);

  const sortedConversations = useMemo(() => {
    const list = [...conversations];
    list.sort((a, b) => {
      const pa = a.pinned ? 1 : 0;
      const pb = b.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const ua = unreadByPeerId.get(a.peerUserId) ?? 0;
      const ub = unreadByPeerId.get(b.peerUserId) ?? 0;
      const ha = ua > 0 ? 1 : 0;
      const hb = ub > 0 ? 1 : 0;
      if (ha !== hb) return hb - ha;
      return sortKeyFromIso(b.lastMessageAt) - sortKeyFromIso(a.lastMessageAt);
    });
    return list;
  }, [conversations, unreadByPeerId]);

  /** 会话未读总和（与小程序 DM 角标同级，向内为每条会话上的数字） */
  const sessionUnreadTotal = useMemo(() => {
    let s = 0;
    for (const c of sortedConversations) {
      s += unreadByPeerId.get(c.peerUserId) ?? 0;
    }
    return s;
  }, [sortedConversations, unreadByPeerId]);

  /** 通知 Tab：notify + 待处理；待处理条数优先 pending-badges.staffUnifiedWorkInboxPending（与侧栏同源） */
  const notifyTabBadgeTotal = useMemo(() => {
    const apiN = pendingBadges?.notify ?? 0;
    const pendingWork =
      canStaff && typeof pendingBadges?.staffUnifiedWorkInboxPending === "number"
        ? pendingBadges.staffUnifiedWorkInboxPending
        : canStaff
          ? inboxCounts.pendingCount
          : 0;
    return apiN + pendingWork;
  }, [pendingBadges?.notify, pendingBadges?.staffUnifiedWorkInboxPending, inboxCounts.pendingCount, canStaff]);

  /** 纵向「消息」轨：会话未读 + 通知侧汇总，再向外为侧栏「消息」 */
  const messageRailBadgeTotal = sessionUnreadTotal + notifyTabBadgeTotal;

  const loadGroups = useCallback(async () => {
    try {
      const g = await fetchContactGroups();
      setGroups(g);
    } catch {
      setGroups([]);
    }
  }, []);

  const loadContacts = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoadingContacts(true);
    try {
      const kw = keywordRef.current.trim() || undefined;
      const res = await fetchStaffContacts({ keyword: kw, page: 1, size: 200 });
      const normalized = res.data.map((row) => ({
        ...row,
        unreadFromPeer: Math.max(0, Math.floor(Number(row.unreadFromPeer) || 0)),
      }));
      setContacts(normalized);
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "加载联系人失败");
    } finally {
      if (!silent) setLoadingContacts(false);
    }
  }, []);

  const loadConversations = useCallback(async (opts?: { silent?: boolean }) => {
    if (!canUseFriendsPage) return;
    const silent = Boolean(opts?.silent);
    if (!silent) setLoadingConversations(true);
    try {
      const rows = await fetchConversations();
      setConversations(rows || []);
    } catch {
      setConversations([]);
    } finally {
      if (!silent) setLoadingConversations(false);
    }
  }, [canUseFriendsPage]);

  const loadConversationsRef = useRef(loadConversations);
  loadConversationsRef.current = loadConversations;

  /** 打开会话/发消息后仅合并会话行 lastMessageAt，禁止整表 load（post-save-no-full-refresh.mdc） */
  const mergeConversationLastMessageAt = useCallback((cid: string, msgs: ChatMessage[]) => {
    const last = msgs.length ? msgs[msgs.length - 1] : null;
    const at = last?.createTime;
    if (!at) return;
    setConversations((prev) => {
      if (!prev.some((r) => r.id === cid)) {
        queueMicrotask(() => void loadConversationsRef.current({ silent: true }));
        return prev;
      }
      return prev.map((r) => (r.id === cid ? { ...r, lastMessageAt: at } : r));
    });
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (!canUseFriendsPage) {
      contactsKeywordSyncSkipRef.current = true;
      return;
    }
    contactsKeywordSyncSkipRef.current = true;
    void loadContacts({ silent: false });
  }, [canUseFriendsPage, loadContacts]);

  useEffect(() => {
    if (!canUseFriendsPage) return;
    if (contactsKeywordSyncSkipRef.current) {
      contactsKeywordSyncSkipRef.current = false;
      return;
    }
    const id = window.setTimeout(() => void loadContacts({ silent: true }), 400);
    return () => window.clearTimeout(id);
  }, [keyword, canUseFriendsPage, loadContacts]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const onStaffMenu = () => {
      void loadGroups();
      void loadContacts();
      void loadConversations();
    };
    window.addEventListener(ADMIN_STAFF_CONTACTS_REFRESH_EVENT, onStaffMenu);
    return () => window.removeEventListener(ADMIN_STAFF_CONTACTS_REFRESH_EVENT, onStaffMenu);
  }, [loadContacts, loadConversations, loadGroups]);

  /** 低频兜底：SSE 未达或断线时仍 eventual 一致（主路径见下方 staff_chat SSE） */
  useEffect(() => {
    if (!canUseFriendsPage) return;
    const t = window.setInterval(() => {
      void loadContacts({ silent: true });
      void loadConversations({ silent: true });
      window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
    }, 120_000);
    return () => window.clearInterval(t);
  }, [canUseFriendsPage, loadContacts, loadConversations]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (mainRail === "friends") p.set("view", "friends");
    if (mainRail === "messages" && centerTab === "notify") p.set("workTab", "notify");
    const next = p.toString();
    const cur = searchParams.toString();
    if (next !== cur) setSearchParams(p, { replace: true });
  }, [mainRail, centerTab, searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    const resetInline = () => {
      setInlineWork(null);
      setInlineWorkError(null);
      setClaimGrantMap({});
      setClaimLinks([]);
      setClaimLinksLoading(false);
      setFulfillingInline(false);
    };

    if (!rightPanel) {
      resetInline();
      setInlineWorkLoading(false);
      return;
    }

    const loadClaim = async (orderId: string) => {
      setInlineWorkLoading(true);
      setInlineWorkError(null);
      setInlineWork(null);
      setClaimLinks([]);
      try {
        const d = await fetchSupplyClaimDetail(orderId);
        if (cancelled) return;
        const gm: Record<number, boolean> = {};
        (d.lines || []).forEach((l) => {
          gm[l.id] = true;
        });
        setClaimGrantMap(gm);
        setInlineWork({ kind: "claim", order: d });
        setClaimLinksLoading(true);
        const links = await listSupplyClaimPdfLinks(orderId);
        if (cancelled) return;
        setClaimLinks(links.links || []);
      } catch (e) {
        if (!cancelled) setInlineWorkError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) {
          setInlineWorkLoading(false);
          setClaimLinksLoading(false);
        }
      }
    };

    if (rightPanel.kind === "notice") {
      if (rightPanel.row.bizType === "SUPPLIES_CLAIM" && rightPanel.row.bizId) {
        void loadClaim(rightPanel.row.bizId);
      } else {
        resetInline();
        setInlineWorkLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }

    const { item } = rightPanel;
    setInlineWorkLoading(true);
    setInlineWorkError(null);
    setInlineWork(null);
    setClaimLinks([]);
    void (async () => {
      try {
        if (item.workKind === "claim") {
          await loadClaim(item.id);
          return;
        }
        if (item.workKind === "repair") {
          const d = await fetchRepairOrderDetail(item.id);
          if (!cancelled) setInlineWork({ kind: "repair", order: d });
        } else {
          const d = await fetchPurchaseOrderDetail(item.id);
          if (!cancelled) setInlineWork({ kind: "purchase", order: d });
        }
      } catch (e) {
        if (!cancelled) setInlineWorkError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setInlineWorkLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rightPanel]);

  const generateClaimLinkInline = useCallback(async () => {
    if (inlineWork?.kind !== "claim") return;
    setClaimLinksLoading(true);
    try {
      const created = await createOrReuseSupplyClaimPdfLink(inlineWork.order.id);
      const links = await listSupplyClaimPdfLinks(inlineWork.order.id);
      setClaimLinks(links.links || []);
      const copyText = created.downloadUrl || created.downloadPath;
      if (copyText) await navigator.clipboard.writeText(copyText);
      toast.success(created.reused ? "已复用链接（已复制）" : "已生成链接（已复制）");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "获取链接失败");
    } finally {
      setClaimLinksLoading(false);
    }
  }, [inlineWork]);

  const fulfillClaimInline = useCallback(async () => {
    if (!isAdmin || inlineWork?.kind !== "claim") return;
    const claimDetail = inlineWork.order;
    if (claimDetail.status !== "PENDING") return;
    const lines = (claimDetail.lines || []).map((l) => ({
      lineId: l.id,
      grant: claimGrantMap[l.id] === true,
      fulfillQty: l.qty,
    }));
    if (!lines.some((x) => x.grant)) {
      toast.error("请至少勾选一行");
      return;
    }
    setFulfillingInline(true);
    try {
      await fulfillSupplyClaim(claimDetail.id, lines);
      toast.success("已确认出库");
      await noticeInboxRef.current?.reloadWorkLists();
      window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
      const d = await fetchSupplyClaimDetail(claimDetail.id);
      setInlineWork({ kind: "claim", order: d });
      const links = await listSupplyClaimPdfLinks(claimDetail.id);
      setClaimLinks(links.links || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "出库失败");
    } finally {
      setFulfillingInline(false);
    }
  }, [isAdmin, inlineWork, claimGrantMap]);

  const filteredContacts = useMemo(() => {
    if (groupFilter === "ALL") return contacts;
    if (groupFilter === "UNGROUPED") return contacts.filter((c) => !(c.contactGroupId || "").trim());
    return contacts.filter((c) => (c.contactGroupId || "").trim() === groupFilter);
  }, [contacts, groupFilter]);

  const insertEmoji = useCallback((ch: string) => {
    const el = textRef.current;
    if (!el) {
      setText((t) => t + ch);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    setText((prev) => prev.slice(0, start) + ch + prev.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + ch.length;
      el.setSelectionRange(pos, pos);
    });
  }, []);

  const selectPeer = async (c: StaffContact) => {
    if (!canUseFriendsPage) return;
    setRightPanel(null);
    setPeer(c);
    setMessages([]);
    try {
      const cid = await openConversation(c.id);
      setConversationId(cid);
      const initial = await fetchMessages(cid, undefined, 80);
      setMessages(initial);
      try {
        await markConversationRead(cid);
      } catch {
        /* 未建 chat_conversation_read 表时忽略 */
      }
      window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
      setContacts((prev) => prev.map((row) => (row.id === c.id ? { ...row, unreadFromPeer: 0 } : row)));
      setPeer((p) => (p && p.id === c.id ? { ...p, unreadFromPeer: 0 } : p));
      mergeConversationLastMessageAt(cid, initial);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "打开会话失败");
    }
  };

  const mergePoll = useCallback(
    async (cid: string) => {
      try {
        const full = await fetchMessages(cid, undefined, 80);
        setMessages(full);
        mergeConversationLastMessageAt(cid, full);
        if (!canUseFriendsPage || conversationIdRef.current !== cid) return;
        try {
          await markConversationRead(cid);
        } catch {
          /* ignore */
        }
        window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
        const p = peerRef.current;
        if (p) {
          setContacts((prev) => prev.map((row) => (row.id === p.id ? { ...row, unreadFromPeer: 0 } : row)));
        }
      } catch {
        /* 轮询失败静默 */
      }
    },
    [canUseFriendsPage, mergeConversationLastMessageAt]
  );

  const onConvTogglePin = useCallback(
    async (conv: ConvRow) => {
      if (!canUseFriendsPage) return;
      try {
        await setConversationPinned(conv.id, !conv.pinned);
        toast.success(conv.pinned ? "已取消置顶" : "已置顶");
        setConvCtxMenu(null);
        // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
        setConversations((prev) => prev.map((r) => (r.id === conv.id ? { ...r, pinned: !conv.pinned } : r)));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失败");
      }
    },
    [canUseFriendsPage]
  );

  const onConvRemoveFromList = useCallback(
    async (conv: ConvRow) => {
      if (!canUseFriendsPage) return;
      if (!window.confirm("从会话列表移除此对话？不会删除聊天记录；可在通讯录再次打开会话。")) return;
      try {
        await hideConversationFromMyList(conv.id);
        toast.success("已从会话列表移除");
        setConvCtxMenu(null);
        if (conversationId === conv.id) {
          setPeer(null);
          setConversationId(null);
          setMessages([]);
          setRightPanel(null);
        }
        // 保存后仅合并列表（去掉本行），禁止整表 load（post-save-no-full-refresh.mdc）
        setConversations((prev) => prev.filter((r) => r.id !== conv.id));
        window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "移除失败");
      }
    },
    [canUseFriendsPage, conversationId]
  );

  useLayoutEffect(() => {
    if (!convCtxMenu || !convCtxMenuRef.current) return;
    const el = convCtxMenuRef.current;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    let left = convCtxMenu.x;
    let top = convCtxMenu.y;
    if (left + rect.width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - pad - rect.width);
    if (top + rect.height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - pad - rect.height);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [convCtxMenu]);

  useEffect(() => {
    if (!convCtxMenu) return;
    const onDocDown = (e: MouseEvent) => {
      if (convCtxMenuRef.current?.contains(e.target as Node)) return;
      setConvCtxMenu(null);
    };
    const tid = window.setTimeout(() => document.addEventListener("mousedown", onDocDown), 0);
    return () => {
      window.clearTimeout(tid);
      document.removeEventListener("mousedown", onDocDown);
    };
  }, [convCtxMenu]);

  useEffect(() => {
    if (!conversationId) return;
    const t = window.setInterval(() => void mergePoll(conversationId), 45_000);
    return () => window.clearInterval(t);
  }, [conversationId, mergePoll]);

  /**
   * staff_chat：由 AdminLayout 单条 SSE 解析后派发 ADMIN_STAFF_CHAT_PUSH_DETAIL_EVENT（避免与侧栏双连接、减少服务端 IOException 噪音）。
   */
  useEffect(() => {
    if (!canUseFriendsPage) return;
    const STAFF_CHAT_LIST_MIN_MS = 1600;
    const onStaffChatDetail = (e: Event) => {
      const ce = e as CustomEvent<StaffChatSsePayload>;
      const payload = ce.detail;
      if (!payload || typeof payload !== "object") return;
      const cid = payload.conversationId;
      if (!cid || typeof cid !== "string") return;
      const now = Date.now();
      if (now - staffChatListRefreshAtRef.current >= STAFF_CHAT_LIST_MIN_MS) {
        staffChatListRefreshAtRef.current = now;
        void loadContacts({ silent: true });
        void loadConversations({ silent: true });
      }
      window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
      if (conversationIdRef.current !== cid) return;
      void mergePoll(cid);
    };
    window.addEventListener(ADMIN_STAFF_CHAT_PUSH_DETAIL_EVENT, onStaffChatDetail as EventListener);
    return () => window.removeEventListener(ADMIN_STAFF_CHAT_PUSH_DETAIL_EVENT, onStaffChatDetail as EventListener);
  }, [canUseFriendsPage, loadContacts, loadConversations, mergePoll]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    const id = last?.id ?? null;
    if (id && id !== lastMessageIdRef.current) {
      lastMessageIdRef.current = id;
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const sendText = async () => {
    if (!canUseFriendsPage || !conversationId || !text.trim()) return;
    try {
      await postChatMessage(conversationId, { body: text.trim() });
      setText("");
      const next = await fetchMessages(conversationId, undefined, 80);
      setMessages(next);
      try {
        await markConversationRead(conversationId);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
      const pid = peerRef.current?.id;
      if (pid) {
        setContacts((prev) => prev.map((row) => (row.id === pid ? { ...row, unreadFromPeer: 0 } : row)));
      }
      mergeConversationLastMessageAt(conversationId, next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "发送失败");
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!canUseFriendsPage || !f || !conversationId) return;
    try {
      const up = await uploadChatAttachment(conversationId, f);
      await postChatMessage(conversationId, { attachmentId: up.attachmentId });
      const next = await fetchMessages(conversationId, undefined, 80);
      setMessages(next);
      toast.success("已发送文件");
      try {
        await markConversationRead(conversationId);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
      const pid = peerRef.current?.id;
      if (pid) {
        setContacts((prev) => prev.map((row) => (row.id === pid ? { ...row, unreadFromPeer: 0 } : row)));
      }
      mergeConversationLastMessageAt(conversationId, next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    }
  };

  const saveDownload = async (m: ChatMessage) => {
    if (!canUseFriendsPage || !m.attachmentId) return;
    try {
      const blob = await downloadChatAttachment(m.attachmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = m.attachmentName || "download";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "下载失败");
    }
  };

  const centerTabBtn = (tab: CenterTab, label: string, icon: ReactNode) => (
    <button
      type="button"
      key={tab}
      onClick={() => {
        setCenterTab(tab);
        if (tab === "notify") {
          setPeer(null);
          setConversationId(null);
          setMessages([]);
        } else {
          setRightPanel(null);
        }
      }}
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium sm:text-sm",
        centerTab === tab ? "border-violet-500 bg-violet-50 text-violet-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      )}
    >
      <span className="relative inline-flex shrink-0">
        {icon}
        {tab === "chats" ? badgeBubble(sessionUnreadTotal, "ring-violet-100") : null}
        {tab === "notify" ? badgeBubble(notifyTabBadgeTotal, "ring-violet-100") : null}
      </span>
      <span>{label}</span>
    </button>
  );

  const railBtn = (rail: MainRail, icon: ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setMainRail(rail)}
      title={label}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-medium transition-colors",
        mainRail === rail ? "bg-violet-100 text-violet-900" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      )}
    >
      <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200/80">
        {icon}
        {rail === "messages" ? badgeBubble(messageRailBadgeTotal) : null}
      </span>
      {label}
    </button>
  );

  const bizTypeZh = (bizType?: string) => {
    if (bizType === "REPAIR") return "报修";
    if (bizType === "PURCHASE") return "采购";
    if (bizType === "SUPPLIES_CLAIM") return "物资领用";
    return bizType || "-";
  };

  const eventTypeZh = (eventType?: string) => {
    if (eventType === "CREATED") return "已创建";
    if (eventType === "STARTED") return "已接单";
    if (eventType === "COMPLETED") return "已完成";
    if (eventType === "WITHDRAWN") return "已撤回";
    if (eventType === "DELETED") return "已删除";
    if (eventType === "RESTORED") return "已恢复";
    return eventType || "-";
  };

  return (
    <div className="-m-6 flex h-[calc(100dvh-4.25rem)] min-h-0 flex-col bg-slate-100/80 p-3 sm:p-4 md:h-[calc(100dvh-4.5rem)] md:p-5">
      <div className="shrink-0 pb-2">
        <h1 className="text-lg font-semibold text-slate-900">{mainRail === "messages" ? "消息" : "通讯录"}</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          {mainRail === "messages"
            ? "左侧为会话与系统通知；未读会话置顶。右侧为聊天窗口。"
            : "分组与搜索与工单展示名同源；点选后在右侧打开聊天。"}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-2 sm:gap-3">
        {/* 左侧窄栏：微信式「消息 / 通讯录」 */}
        <nav
          className="flex w-[3.35rem] shrink-0 flex-col items-stretch gap-1 rounded-xl border border-slate-200 bg-white py-2 shadow-sm"
          aria-label="消息主导航"
        >
          {railBtn("messages", <MessageCircle className="h-4 w-4 text-violet-600" aria-hidden />, "消息")}
          {railBtn("friends", <Users className="h-4 w-4 text-slate-600" aria-hidden />, "通讯录")}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:gap-4">
          {mainRail === "messages" ? (
            <aside className="flex h-[min(38vh,20rem)] min-h-0 w-full shrink-0 flex-col overflow-hidden sm:h-[min(40vh,22rem)] lg:h-auto lg:w-80 lg:max-w-[22rem] lg:shrink-0">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="shrink-0 space-y-2 border-b border-slate-100 p-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {centerTabBtn("chats", "会话", <MessageCircle className="h-3.5 w-3.5 text-violet-600" aria-hidden />)}
                    {centerTabBtn("notify", "通知", <Bell className="h-3.5 w-3.5 text-amber-600" aria-hidden />)}
                  </div>
                  <p className="text-[10px] leading-snug text-slate-400">
                    角标由外到内：侧栏消息 → 本列「消息」图标 → 会话/通知 Tab → 单条会话数字 / 通知栏分区数字。会话行右键菜单：置顶 / 从会话列表移除。
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-1">
                  {centerTab === "chats" && (
                    <div className="space-y-0.5">
                      {loadingConversations && <div className="p-3 text-center text-xs text-slate-400">加载会话…</div>}
                      {!loadingConversations &&
                        sortedConversations.map((conv) => {
                          const unread = unreadByPeerId.get(conv.peerUserId) ?? 0;
                          const synthetic = peerFromConversation(conv, unread);
                          const active = peer?.id === conv.peerUserId;
                          return (
                            <button
                              key={conv.id}
                              type="button"
                              onClick={() => void selectPeer(synthetic)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                if (!canUseFriendsPage) return;
                                setConvCtxMenu({ x: e.clientX, y: e.clientY, conv });
                              }}
                              className={cn(
                                "mb-0.5 w-full rounded-lg border border-transparent px-2 py-2 text-left text-sm",
                                active ? "border-violet-200 bg-violet-50" : "hover:bg-slate-50"
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex min-w-0 items-center gap-2">
                                    {conv.pinned ? (
                                      <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="已置顶" />
                                    ) : null}
                                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                                      {(conv.peerDisplayNickname || "").trim() || conv.peerUsername}
                                    </span>
                                    {unread > 0 ? (
                                      <span className="inline-flex h-[1.375rem] min-w-[1.375rem] shrink-0 items-center justify-center rounded-full bg-rose-600 px-1.5 text-center text-[10px] font-bold leading-none text-white tabular-nums shadow-sm ring-1 ring-rose-800/25">
                                        {unread > 99 ? "99+" : unread}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="truncate text-[11px] text-slate-500">@{conv.peerUsername}</div>
                                  <div className="truncate text-[10px] text-slate-400 tabular-nums">
                                    {conv.lastMessageAt ? formatBeijingDateTimeMedium(conv.lastMessageAt) : "—"}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      {!loadingConversations && sortedConversations.length === 0 && (
                        <div className="p-4 text-center text-xs text-slate-400">暂无会话；可在通讯录发起聊天</div>
                      )}
                    </div>
                  )}
                  {/* 通知收件箱在「会话」Tab 仍挂载（仅 hidden），便于 SSE 推送时刷新列表与 onCountsChange，无需先点进通知；见 AdminLayout ADMIN_NOTIFICATION_SSE_PUSH_EVENT */}
                  <div
                    className={cn("min-h-0", centerTab === "notify" ? "flex flex-1 flex-col" : "hidden")}
                    aria-hidden={centerTab !== "notify"}
                  >
                    <StaffNotificationWorkInbox
                      ref={noticeInboxRef}
                      stackedNotifyColumn
                      showWorkTabBar={false}
                      onSelectNotificationRow={(row) => {
                        setRightPanel({ kind: "notice", row });
                      }}
                      onSelectWorkItemRow={(item) => {
                        setRightPanel({ kind: "work", item });
                      }}
                      onCountsChange={setInboxCounts}
                    />
                  </div>
                </div>
              </div>
            </aside>
          ) : (
            <aside className="flex h-[min(38vh,20rem)] min-h-0 w-full shrink-0 flex-col overflow-hidden sm:h-[min(40vh,22rem)] lg:h-auto lg:w-80 lg:max-w-[22rem] lg:shrink-0">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="shrink-0 space-y-2 border-b border-slate-100 p-2.5">
                  <label className="sr-only" htmlFor="staff-msg-group-filter">
                    分组筛选
                  </label>
                  <select
                    id="staff-msg-group-filter"
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value as GroupFilter)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                  >
                    <option value="ALL">全部联系人</option>
                    <option value="UNGROUPED">未分组</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void loadContacts()}
                    placeholder="搜索展示名或登录名"
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void loadContacts()}
                    className="w-full rounded-lg bg-slate-100 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200"
                  >
                    {loadingContacts ? "加载中…" : "刷新列表"}
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-1">
                  {filteredContacts.map((c) => (
                    <div
                      key={c.id}
                      className={`mb-0.5 rounded-lg border border-transparent px-0.5 py-px ${peer?.id === c.id ? "border-violet-200 bg-violet-50" : ""}`}
                    >
                      <button
                        type="button"
                        data-admin-chrome-friend-row="1"
                        data-friend={encodeURIComponent(
                          JSON.stringify({
                            id: c.id,
                            username: c.username,
                            displayNickname: c.displayNickname ?? "",
                            displayName: (c.displayName || "").trim(),
                            contactGroupId: c.contactGroupId ?? "",
                          })
                        )}
                        onClick={() => void selectPeer(c)}
                        className={cn(
                          "w-full rounded-lg px-2 py-2 text-left text-sm",
                          peer?.id === c.id ? "" : "hover:bg-slate-50"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{contactDisplayName(c)}</span>
                              {Number(c.unreadFromPeer) > 0 ? (
                                <span className="inline-flex h-[1.375rem] min-w-[1.375rem] shrink-0 items-center justify-center rounded-full bg-rose-600 px-1.5 text-center text-[10px] font-bold leading-none text-white tabular-nums shadow-sm ring-1 ring-rose-800/25">
                                  {Number(c.unreadFromPeer) > 99 ? "99+" : c.unreadFromPeer}
                                </span>
                              ) : null}
                            </div>
                            <div className="truncate text-[11px] text-slate-500">@{c.username}</div>
                            {(c.displayNickname || "").trim() ? (
                              <div className="truncate text-[10px] text-slate-400">展示昵称：{(c.displayNickname || "").trim()}</div>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </div>
                  ))}
                  {!filteredContacts.length && (
                    <div className="p-4 text-center text-xs text-slate-400">{loadingContacts ? "加载中…" : "无匹配联系人"}</div>
                  )}
                </div>
              </div>
            </aside>
          )}

          {/* 右：会话聊天 / 通知与工单详情（与小程序一致：左侧点选 → 右侧看全文） */}
          <div className="flex min-h-[min(48vh,26rem)] min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
              <div className="shrink-0 border-b border-slate-100 px-4 py-3">
                {rightPanel?.kind === "notice" ? (
                  <div>
                    <div className="text-base font-semibold text-slate-900">通知详情</div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">{rightPanel.row.title}</div>
                  </div>
                ) : rightPanel?.kind === "work" ? (
                  <div>
                    <div className="text-base font-semibold text-slate-900">工单详情</div>
                    <div className="mt-0.5 text-xs text-violet-700">{rightPanel.item.kindLabel}</div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">{rightPanel.item.title}</div>
                  </div>
                ) : peer ? (
                  <div>
                    <div className="text-base font-semibold text-slate-900">{contactDisplayName(peer)}</div>
                    <div className="mt-0.5 text-xs text-slate-500">@{peer.username}</div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400">
                    {centerTab === "notify" ? "在左侧通知栏点选一条，此处显示全文" : "请选择会话或通讯录中的联系人"}
                  </div>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/60 px-3 py-3 sm:px-5">
                {rightPanel?.kind === "notice" ? (
                  <div className="space-y-3 text-sm text-slate-800">
                    <div className="text-xs text-slate-500">{formatBeijingDateTimeFull(rightPanel.row.createTime)}</div>
                    <div className="whitespace-pre-wrap break-words text-base font-medium text-slate-900">{rightPanel.row.title}</div>
                    <div className="whitespace-pre-wrap break-words leading-relaxed">{rightPanel.row.content}</div>
                    <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                      业务 {bizTypeZh(rightPanel.row.bizType)} · 事件 {eventTypeZh(rightPanel.row.eventType)} · 单号{" "}
                      {rightPanel.row.bizId || "—"}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {rightPanel.row.isRead === 0 ? (
                        <button
                          type="button"
                          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500"
                          onClick={async () => {
                            try {
                              await markNotificationRead(rightPanel.row.id);
                              toast.success("已标记已读");
                              window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
                              setRightPanel((p) =>
                                p?.kind === "notice" && p.row.id === rightPanel.row.id ? { kind: "notice", row: { ...p.row, isRead: 1 } } : p
                              );
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "操作失败");
                            }
                          }}
                        >
                          标记已读
                        </button>
                      ) : null}
                    </div>
                    {rightPanel.row.bizType === "SUPPLIES_CLAIM" && rightPanel.row.bizId ? (
                      <div className="space-y-2 border-t border-slate-200 pt-3">
                        <div className="text-xs font-semibold text-slate-700">领用单明细（自动展开）</div>
                        {inlineWorkLoading ? <div className="text-xs text-slate-500">加载中…</div> : null}
                        {inlineWorkError ? <div className="text-xs text-red-600">{inlineWorkError}</div> : null}
                        {inlineWork?.kind === "claim" ? (
                          <WorkOrderInlineDetail
                            model={inlineWork}
                            isAdmin={isAdmin}
                            claimGrantMap={claimGrantMap}
                            setClaimGrantMap={setClaimGrantMap}
                            claimLinks={claimLinks}
                            claimLinksLoading={claimLinksLoading}
                            fulfilling={fulfillingInline}
                            onGenerateClaimLink={generateClaimLinkInline}
                            onFulfillClaim={fulfillClaimInline}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : rightPanel?.kind === "work" ? (
                  <div className="space-y-3 text-sm">
                    <div className="text-xs font-medium text-slate-500">{rightPanel.item.sub}</div>
                    {inlineWorkLoading ? <div className="text-xs text-slate-500">加载工单详情…</div> : null}
                    {inlineWorkError ? <div className="text-xs text-red-600">{inlineWorkError}</div> : null}
                    {inlineWork ? (
                      <WorkOrderInlineDetail
                        model={inlineWork}
                        isAdmin={isAdmin}
                        claimGrantMap={claimGrantMap}
                        setClaimGrantMap={setClaimGrantMap}
                        claimLinks={claimLinks}
                        claimLinksLoading={claimLinksLoading}
                        fulfilling={fulfillingInline}
                        onGenerateClaimLink={generateClaimLinkInline}
                        onFulfillClaim={fulfillClaimInline}
                      />
                    ) : null}
                  </div>
                ) : (
                messages.map((m, idx) => {
                  const fromPeer = peer && m.senderId === peer.id;
                  const d = parseToDate(m.createTime) ?? new Date(0);
                  const prev = idx > 0 ? parseToDate(messages[idx - 1].createTime) : null;
                  const showDay = !prev || !sameCalendarDayBeijing(d, prev);
                  const clock = formatMessageClock(m.createTime);
                  return (
                    <div key={m.id}>
                      {showDay ? (
                        <div className="my-3 flex justify-center">
                          <span className="rounded-full bg-slate-200/90 px-3 py-0.5 text-[11px] font-medium text-slate-600">
                            {formatDayDivider(d)}
                          </span>
                        </div>
                      ) : null}
                      <div className={cn("mb-2 flex", fromPeer ? "justify-start" : "justify-end")}>
                        <div
                          className={cn(
                            "max-w-[min(36rem,calc(100%-2.5rem))] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[min(40rem,85%)]",
                            fromPeer ? "rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200/80" : "rounded-br-md bg-violet-600 text-white"
                          )}
                        >
                          {m.body ? <div className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</div> : null}
                          {m.attachmentId && canUseFriendsPage ? (
                            <button
                              type="button"
                              className={cn(
                                "mt-1.5 text-xs underline underline-offset-2",
                                fromPeer ? "text-violet-700" : "text-violet-100"
                              )}
                              onClick={() => void saveDownload(m)}
                            >
                              下载 {m.attachmentName || "附件"}
                            </button>
                          ) : null}
                          <div
                            className={cn(
                              "mt-1.5 flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[10px] tabular-nums",
                              fromPeer ? "text-slate-400" : "text-violet-100/90"
                            )}
                          >
                            <span>{clock}</span>
                            {!fromPeer ? (
                              <span className="font-medium">{m.readByPeer ? "已读" : "已送达"}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
                )}
                <div ref={listEndRef} />
              </div>
              <div className="relative shrink-0 border-t border-slate-100 bg-white p-2 sm:p-3">
                <div ref={emojiWrapRef} className="relative mb-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!conversationId || !canUseFriendsPage || !!rightPanel}
                    onClick={() => setEmojiOpen((o) => !o)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    aria-label="表情"
                  >
                    <Smile className="h-5 w-5" />
                  </button>
                  {emojiOpen ? (
                    <div className="absolute bottom-full left-0 z-20 mb-1 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                      <div className="max-h-40 overflow-y-auto overscroll-contain">
                        <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
                          {CHAT_QUICK_EMOJIS.map((em) => (
                            <button
                              key={em}
                              type="button"
                              className="flex h-9 w-9 items-center justify-center rounded-md text-lg hover:bg-slate-100"
                              onClick={() => {
                                insertEmoji(em);
                                setEmojiOpen(false);
                              }}
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <textarea
                    ref={textRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendText();
                      }
                    }}
                    disabled={!conversationId || !canUseFriendsPage || !!rightPanel}
                    placeholder={
                      rightPanel
                        ? "查看通知/工单时请在左侧关闭详情或切换回会话"
                        : conversationId
                          ? "输入消息，Enter 发送，Shift+Enter 换行"
                          : "请先选择会话或联系人"
                    }
                    rows={3}
                    className="min-h-[4.5rem] min-w-0 flex-1 resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 disabled:bg-slate-50"
                  />
                  <div className="flex shrink-0 gap-2 sm:flex-col">
                    <input ref={fileRef} type="file" className="hidden" onChange={(e) => void onPickFile(e)} />
                    <button
                      type="button"
                      disabled={!conversationId || !canUseFriendsPage}
                      onClick={() => fileRef.current?.click()}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      文件
                    </button>
                    <button
                      type="button"
                      disabled={!conversationId || !canUseFriendsPage || !!rightPanel}
                      onClick={() => void sendText()}
                      className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-500 disabled:opacity-40"
                    >
                      发送
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {convCtxMenu
        ? createPortal(
            <div
              ref={convCtxMenuRef}
              role="menu"
              className="fixed z-[220] min-w-[11rem] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl"
              style={{ left: convCtxMenu.x, top: convCtxMenu.y }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
                onClick={() => void onConvTogglePin(convCtxMenu.conv)}
              >
                <Pin className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                {convCtxMenu.conv.pinned ? "取消置顶" : "置顶会话"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-700 hover:bg-rose-50"
                onClick={() => void onConvRemoveFromList(convCtxMenu.conv)}
              >
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                从会话列表移除
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
