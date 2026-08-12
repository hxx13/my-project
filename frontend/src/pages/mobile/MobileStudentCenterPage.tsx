/** 手机版学生中心 — 壳组件：数据加载、Tab 切换、底部导航、WebSocket、实时提醒 */
import "./mobile-student-shell.css";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, WifiOff, X, Scan, Home } from "lucide-react";
import { WxPusherBindModal } from "@/components/shared/WxPusherBindModal";
import {
  fetchMobileCenter,
  fetchMobileAlerts,
  markMobileAlertsReadAll,
  type MobileCenterData,
  type MobileAlertItem,
} from "@/api/domains/mobileStudent.api";
import { markStudentMobileAlertsReadAll } from "@/api/domains/studentMobile.api";
import { fetchLoginBranding, type LoginBranding } from "@/api/domains/publicSite.api";
import * as studentMobileApi from "@/api/domains/studentMobile.api";
import { hasMobileHtml5Privilege } from "@/features/auth/roleAccess";
import { authStorage } from "@/features/auth/authStorage";
import { sendVerificationCode, bindEmailWithCode } from "@/api/domains/auth.api";
import { useMobileSocket, mergeMobileUserNotify } from "./useMobileSocket";
import { isFeedbackKind } from "./mobileAlertSplit";
import { sortMobileAnnouncementsForDisplay } from "./mobileExemptAlertHelpers";
import MobileHomeTab from "./MobileHomeTab";
import MobileRoomsTab from "./MobileRoomsTab";
import MobileMaterialTab from "./MobileMaterialTab";
import MobileRecordsTab from "./MobileRecordsTab";
import MobileViolationsTab from "./MobileViolationsTab";
import MobileMineTab from "./MobileMineTab";
import MobileCageShelfTab, { type MobileCageShelfTabHandle } from "./MobileCageShelfTab";
import { lookupCode } from "@/api/domains/cageShelf.api";
import MobileGroupTab from "./MobileGroupTab";
import MobileNoticesPanel from "./MobileNoticesPanel";
import { mobileNoticeItemKey } from "./MobileNoticesPanel";
import MobileFeedbackPanel from "./MobileFeedbackPanel";
import MobileTopNavBar from "./MobileTopNavBar";
import MobileBottomTabBar from "./MobileBottomTabBar";
import MobileScanDialog from "./MobileScanDialog";
import {
  MOBILE_NAV_BAR_H,
  MOBILE_SUBPAGE_TABS,
  MOBILE_TAB_TITLES,
  MOBILE_TOP_NAV_CSS,
  type MobileShellTabKey,
  type MobileTabBarKey,
} from "./mobileShellLayout";

/* ================================================================== */
const PAGE_BG = "#eef0f6";
const BRAND = "#ac1736";
const LOGO_URL = "/images/logohs.png";

/* ================================================================== */
function PageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: PAGE_BG }}>
      <Loader2 className="size-8 animate-spin" style={{ color: BRAND }} />
      <p className="text-sm" style={{ color: "#94a3b8" }}>加载中…</p>
    </div>
  );
}
function PageError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6" style={{ background: PAGE_BG }}>
      <WifiOff className="size-12" style={{ color: "#c8c9cc" }} />
      <p className="text-sm text-center max-w-xs" style={{ color: "#969799" }}>{message}</p>
      <button onClick={onRetry} className="px-6 py-2.5 rounded-full text-white text-sm font-medium active:scale-95"
        style={{ background: `linear-gradient(135deg, ${BRAND}, #8B1229)` }}>重新加载</button>
    </div>
  );
}

/** JWT 模式下加载首页数据（profile + home 并行） */
async function loadJwtHomeData(): Promise<{
  profile: import("@/api/domains/mobileStudent.api").MobileCenterProfile;
  home: import("@/api/domains/studentMobile.api").StudentMobileHomeData;
}> {
  const [profile, home] = await Promise.all([
    studentMobileApi.fetchStudentMobileProfile(),
    studentMobileApi.fetchStudentMobileHome(),
  ]);
  return { profile, home };
}

/** JWT 模式下加载公告 */
async function loadJwtAlerts(): Promise<import("@/api/domains/mobileStudent.api").MobileAlertsData> {
  return studentMobileApi.fetchStudentMobileAlerts();
}

function WatermarkLogo() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center">
      <img src={LOGO_URL} alt="" className="select-none" style={{ width: "70%", maxWidth: 400, opacity: 0.07 }} />
    </div>
  );
}

/* ================================================================== */
/* Main                                                                */
/* ================================================================== */
export default function MobileStudentCenterPage({ token: tokenProp }: { token?: string } = {}) {
  const { token: tokenFromParams } = useParams<{ token: string }>();
  const token = (tokenProp ?? tokenFromParams ?? "").trim() || undefined;
  const [data, setData] = useState<MobileCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MobileShellTabKey>("home");
  const [branding, setBranding] = useState<LoginBranding | null>(null);
  const [announcements, setAnnouncements] = useState<MobileAlertItem[]>([]);
  const [feedbacks, setFeedbacks] = useState<MobileAlertItem[]>([]);
  const [html5PrivilegeBypass, setHtml5PrivilegeBypass] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [currentEmail, setCurrentEmail] = useState("");
  const [currentSendKey, setCurrentSendKey] = useState(false);
  const [currentWxPusher, setCurrentWxPusher] = useState(false);

  // Fetch email & SendKey & WxPusher binding status for header chips
  const userIdForBind = authStorage.getUserInfo()?.id || data?.userId || "";
  const navigate = useNavigate();

  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showSendKeyDialog, setShowSendKeyDialog] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeSending, setEmailCodeSending] = useState(false);
  const [emailCodeCooldown, setEmailCodeCooldown] = useState(0);
  const [emailSaving, setEmailSaving] = useState(false);
  const [sendKeyDraft, setSendKeyDraft] = useState("");
  const [sendKeySaving, setSendKeySaving] = useState(false);
  const [showWxPusherDialog, setShowWxPusherDialog] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [cageJumpTarget, setCageJumpTarget] = useState<{
    shelveId?: string; x: number; y: number; campusName?: string; roomName?: string;
  } | null>(null);
  const [scanLookupLoading, setScanLookupLoading] = useState(false);

  const handleEmailChip = () => {
    if (!userIdForBind) return;
    if (currentEmail) {
      if (!window.confirm(`已绑定 ${currentEmail}，是否取消绑定？`)) return;
      const t = authStorage.getToken();
      fetch(`/api/admin/personnel/${encodeURIComponent(userIdForBind)}/contact-email`, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ email: "" }),
      }).then((r) => { if (r.ok) setCurrentEmail(""); });
    } else {
      setEmailDraft(""); setEmailCode(""); setEmailCodeCooldown(0);
      setShowEmailDialog(true);
    }
  };

  const handleSendKeyChip = () => {
    if (!userIdForBind) return;
    if (currentSendKey) {
      if (!window.confirm("已绑定微信通知，是否取消绑定？")) return;
      const t = authStorage.getToken();
      fetch(`/api/admin/personnel/${encodeURIComponent(userIdForBind)}/send-key`, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ sendKey: "" }),
      }).then((r) => { if (r.ok) setCurrentSendKey(false); });
    } else {
      setSendKeyDraft("");
      setShowSendKeyDialog(true);
    }
  };

  const handleWxPusherChip = () => {
    if (!userIdForBind) return;
    if (currentWxPusher) {
      if (!window.confirm("已绑定 WxPusher 推送，是否取消绑定？")) return;
      const t = authStorage.getToken();
      fetch(`/api/admin/personnel/${encodeURIComponent(userIdForBind)}/wx-pusher-uid`, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ wxPusherUid: "" }),
      }).then((r) => { if (r.ok) setCurrentWxPusher(false); });
    } else {
      setShowWxPusherDialog(true);
    }
  };
  useEffect(() => {
    if (!userIdForBind) return;
    const t = authStorage.getToken();
    if (!t) return;
    const h = { Authorization: "Bearer " + t };
    fetch(`/api/admin/personnel/${encodeURIComponent(userIdForBind)}/contact-email`, { headers: h })
      .then((r) => r.json().catch(() => ({})))
      .then((b) => setCurrentEmail(b?.data?.email || ""))
      .catch(() => {});
    fetch(`/api/admin/personnel/${encodeURIComponent(userIdForBind)}/send-key`, { headers: h })
      .then((r) => r.json().catch(() => ({})))
      .then((b) => setCurrentSendKey(!!b?.data?.sendKey))
      .catch(() => {});
    fetch(`/api/admin/personnel/${encodeURIComponent(userIdForBind)}/wx-pusher-uid`, { headers: h })
      .then((r) => r.json().catch(() => ({})))
      .then((b) => setCurrentWxPusher(!!b?.data?.hasWxPusherUid))
      .catch(() => {});
  }, [userIdForBind]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [announcementFocusKey, setAnnouncementFocusKey] = useState<string | null>(null);
  const jwtMode = !token;
  const { connected: wsConnected, lastAlert, lastUserNotify, clearUserNotify } = useMobileSocket(token, jwtMode);
  const [dismissedAlert, setDismissedAlert] = useState<string | null>(null);
  const [userNotifyBanner, setUserNotifyBanner] = useState<{ title: string; summary: string } | null>(null);
  const [presenceRefresh, setPresenceRefresh] = useState(0);
  const cageShelfRef = useRef<MobileCageShelfTabHandle>(null);
  const [cageShelfNavTitle, setCageShelfNavTitle] = useState<string | undefined>();
  const prevTabRef = useRef<MobileShellTabKey>("home");

  const loadAlerts = useCallback(async () => {
    if (!token) {
      // JWT mode
      try {
        const resp = await loadJwtAlerts();
        const ann = sortMobileAnnouncementsForDisplay(resp.announcements ?? resp.items ?? []);
        const fb = resp.feedbacks ?? [];
        setAnnouncements(ann);
        setFeedbacks(fb);
      } catch { /* silent */ }
      return;
    }
    // Token mode (original logic, unchanged)
    try {
      const resp = await fetchMobileAlerts(token);
      const ann = sortMobileAnnouncementsForDisplay(resp.announcements ?? resp.items ?? []);
      const fb = resp.feedbacks ?? [];
      setAnnouncements(ann);
      setFeedbacks(fb);
      setHtml5PrivilegeBypass(resp.html5PrivilegeBypass === true);
    } catch {
      /* 静默失败 */
    }
  }, [token]);

  const openAnnouncements = useCallback((focusKey?: string) => {
    setAnnouncementFocusKey(focusKey ?? null);
    setShowAnnouncements(true);
  }, []);

  const openFeedback = useCallback(() => {
    setShowFeedback(true);
    void loadAlerts();
    // 后台标记所有反馈通知为已读，同时更新本地状态让角标即时消失
    const markPromise = token
      ? markMobileAlertsReadAll(token)
      : markStudentMobileAlertsReadAll();
    markPromise
      .then(() => {
        setFeedbacks((prev) => prev.map((f) => ({ ...f, isRead: true })));
      })
      .catch(() => {});
  }, [loadAlerts, token]);

  /** 保存后仅合并当前条，禁止整表 load — post-save-no-full-refresh.mdc */
  const handleNoticeSuppressed = useCallback((itemKey: string) => {
    setAnnouncements((prev) =>
      prev.map((a) =>
        mobileNoticeItemKey(a) === itemKey ? { ...a, autoOpenSuppressed: true } : a,
      ),
    );
  }, []);

  const load = useCallback(async () => {
    // JWT mode: no token param, authenticated via AuthGuard
    if (!token) {
      if (!authStorage.hasToken()) {
        setLoading(false);
        setError("请先登录");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [homeData, b] = await Promise.all([
          loadJwtHomeData(),
          fetchLoginBranding().catch(() => null),
        ]);
        const jwtData: MobileCenterData = {
          dashboard: {
            profile: homeData.profile,
            stats: homeData.home.stats,
            pinnedRooms: homeData.home.pinnedRooms,
            recentRecords: homeData.home.recentRecords,
            recentNotices: homeData.home.recentNotices,
          },
          expiresAt: "",
          userId: authStorage.getUserInfo()?.id,
          html5PrivilegeBypass: hasMobileHtml5Privilege(authStorage.getRole()),
        };
        setData(jwtData);
        setHtml5PrivilegeBypass(jwtData.html5PrivilegeBypass === true);
        setBranding(b);
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Token mode (original logic, unchanged)
    setLoading(true);
    setError(null);
    try {
      const [d, b] = await Promise.all([
        fetchMobileCenter(token),
        fetchLoginBranding().catch(() => null),
      ]);
      setData(d);
      setBranding(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void load();
    void loadAlerts();
  }, [token, load, loadAlerts]);

  /** 切回首页：静默刷新进出状态与公告，不卸载 Home Tab — 对齐小程序 onShow */
  useEffect(() => {
    const prev = prevTabRef.current;
    prevTabRef.current = activeTab;
    if (activeTab !== "home" || prev === "home") return;
    setPresenceRefresh((n) => n + 1);
    void loadAlerts();
  }, [activeTab, loadAlerts]);

  useEffect(() => { if (lastAlert) setDismissedAlert(null); }, [lastAlert]);

  useEffect(() => {
    if (!lastUserNotify) return;
    if (lastUserNotify.kind === "refresh") {
      const reason = lastUserNotify.reason ?? "";
      if (reason.startsWith("presence:")) {
        setPresenceRefresh((n) => n + 1);
      } else {
        void loadAlerts();
      }
    } else if (isFeedbackKind(lastUserNotify.kind)) {
      setFeedbacks((prev) => mergeMobileUserNotify(prev, lastUserNotify));
      if (lastUserNotify.title) {
        setUserNotifyBanner({
          title: lastUserNotify.title,
          summary: lastUserNotify.summary ?? "",
        });
        setDismissedAlert(null);
      }
    }
    clearUserNotify();
  }, [lastUserNotify, loadAlerts, clearUserNotify]);

  useEffect(() => {
    if (activeTab !== "cage") {
      setCageShelfNavTitle(undefined);
    }
  }, [activeTab]);

  const handleTopNavBack = useCallback(() => {
    if (activeTab === "cage" && cageShelfRef.current?.pop()) {
      return;
    }
    setActiveTab("home");
  }, [activeTab]);

  if (loading) return <PageSkeleton />;
  if (error) return <PageError message={error} onRetry={load} />;
  if (!data) return <PageError message="暂无数据" onRetry={load} />;
  const bannerKey = userNotifyBanner
    ? `user:${userNotifyBanner.title}`
    : lastAlert?.at ?? null;
  const showLiveAlert =
    !showFeedback &&
    !showAnnouncements &&
    ((lastAlert && dismissedAlert !== lastAlert.at) ||
      (userNotifyBanner && dismissedAlert !== bannerKey));
  const liveAlertTitle = userNotifyBanner?.title ?? lastAlert?.title ?? "";
  const liveAlertSummary = userNotifyBanner?.summary ?? lastAlert?.summary ?? "";
  const isHome = activeTab === "home";
  const navTitle =
    activeTab === "cage" && cageShelfNavTitle
      ? cageShelfNavTitle
      : MOBILE_TAB_TITLES[activeTab] ?? "";
  const showTabBar = !MOBILE_SUBPAGE_TABS.includes(activeTab);

  return (
    <div
      className="mobile-student-shell fixed inset-0 flex flex-col overflow-hidden"
      style={{
        background: PAGE_BG,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
      }}
    >
      <style>{`@keyframes mobileAlertIn{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}.animate-bounce-in{animation:mobileAlertIn 0.35s ease-out both}`}</style>
      <MobileTopNavBar
        mode={isHome ? "transparent" : "solid"}
        title={navTitle}
        showBack={!isHome}
        onBack={handleTopNavBack}
        rightAction={isHome ? (
          <div className="flex items-center gap-2">
            <a
              href="/#/"
              className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
              style={{
                width: 36, height: 36,
                background: "rgba(0,0,0,0.28)",
                border: "1px solid rgba(255,255,255,0.38)",
                backdropFilter: "blur(8px)",
              }}
              aria-label="门户首页"
            >
              <Home className="size-5 text-white" strokeWidth={1.5} />
            </a>
            <button
              type="button"
              onClick={() => setShowScanDialog(true)}
              className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
              style={{
                width: 36, height: 36,
                background: "rgba(0,0,0,0.28)",
                border: "1px solid rgba(255,255,255,0.38)",
                backdropFilter: "blur(8px)",
              }}
              aria-label="扫码"
            >
              <Scan className="size-5 text-white" strokeWidth={1.5} />
            </button>
          </div>
        ) : null}
      />
      {/* Email bind dialog */}
      {showEmailDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowEmailDialog(false)}>
          <div className="bg-white rounded-2xl w-[85%] max-w-xs p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900">绑定邮箱</h3>
            <p className="mt-1 text-xs text-gray-500">设置用于接收通知的联系邮箱</p>
            <input type="email" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} placeholder="请输入邮箱地址"
              className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#ac1736]" />
            <div className="flex items-center gap-2 mt-2">
              <input type="text" inputMode="numeric" maxLength={6} value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="验证码" className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-center tracking-[0.3em] outline-none" />
              <button type="button" disabled={!emailDraft.trim() || emailCodeSending || emailCodeCooldown > 0}
                onClick={async () => {
                  if (!emailDraft.trim()) return;
                  setEmailCodeSending(true);
                  try {
                    const r = await sendVerificationCode(emailDraft.trim(), "BIND_EMAIL");
                    setEmailCodeCooldown(r.cooldownSeconds || 60);
                    const timer = setInterval(() => setEmailCodeCooldown((p: number) => { if (p <= 1) { clearInterval(timer); return 0; } return p - 1; }), 1000);
                  } catch { /* ignore */ }
                  finally { setEmailCodeSending(false); }
                }}
                className="shrink-0 rounded-lg border border-[#ac1736] px-3 py-2.5 text-xs font-medium text-[#ac1736] disabled:opacity-50">
                {emailCodeCooldown > 0 ? `${emailCodeCooldown}s` : emailCodeSending ? "发送中" : "发送验证码"}
              </button>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowEmailDialog(false)} className="flex-1 rounded-full py-2.5 text-sm font-medium border border-gray-200 text-gray-600 active:bg-gray-50">取消</button>
              <button type="button" disabled={!emailDraft.trim() || emailCode.length !== 6 || emailSaving}
                onClick={async () => {
                  setEmailSaving(true);
                  try {
                    await bindEmailWithCode(emailDraft.trim(), emailCode.trim());
                    setCurrentEmail(emailDraft.trim());
                    setShowEmailDialog(false);
                  } catch (e: any) { alert(e?.message || "绑定失败"); }
                  finally { setEmailSaving(false); }
                }}
                className="flex-1 rounded-full py-2.5 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #ac1736, #8B1229)" }}>
                {emailSaving ? "绑定中…" : "确认绑定"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SendKey bind dialog */}
      {showSendKeyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowSendKeyDialog(false)}>
          <div className="bg-white rounded-2xl w-[85%] max-w-xs p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900">绑定微信通知</h3>
            <p className="mt-1 text-xs text-gray-500">通过 Server酱 SendKey 接收微信推送通知</p>
            <a
              href={`https://sct.ftqq.com/appkey/create/forward?name=ARO&url=${encodeURIComponent(`${window.location.origin}/#/m/home?sendkey={key}&bindUserId=${encodeURIComponent(userIdForBind)}`)}`}
              target="_blank" rel="noopener noreferrer"
              className="mt-1 inline-block text-[11px] text-[#d97706] underline"
            >
              还没有 SendKey？点此前往 Server酱 创建 →
            </a>
            <input value={sendKeyDraft} onChange={(e) => setSendKeyDraft(e.target.value)} placeholder="粘贴 SendKey"
              className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#ac1736]" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowSendKeyDialog(false)} className="flex-1 rounded-full py-2.5 text-sm font-medium border border-gray-200 text-gray-600 active:bg-gray-50">取消</button>
              <button type="button" disabled={!sendKeyDraft.trim() || sendKeySaving}
                onClick={async () => {
                  setSendKeySaving(true);
                  try {
                    const t = authStorage.getToken();
                    const r = await fetch(`/api/admin/personnel/${encodeURIComponent(userIdForBind)}/send-key`, {
                      method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
                      body: JSON.stringify({ sendKey: sendKeyDraft.trim() }),
                    });
                    if (!r.ok) throw new Error("保存失败");
                    setCurrentSendKey(true); setShowSendKeyDialog(false);
                  } catch (e: any) { alert(e?.message || "保存失败"); }
                  finally { setSendKeySaving(false); }
                }}
                className="flex-1 rounded-full py-2.5 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #ac1736, #8B1229)" }}>
                {sendKeySaving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WxPusher bind dialog */}
      <WxPusherBindModal
        open={showWxPusherDialog}
        onClose={() => setShowWxPusherDialog(false)}
        personnelId={userIdForBind}
        authToken={authStorage.getToken()}
        onSaved={() => setCurrentWxPusher(true)}
      />

      <WatermarkLogo />
      {showLiveAlert && liveAlertTitle && (
        <div
          className="fixed left-3 right-3 z-[var(--z-dropdown)] animate-bounce-in"
          style={{
            top: isHome
              ? 12
              : `calc(env(safe-area-inset-top, 0px) + ${MOBILE_NAV_BAR_H}px + 8px)`,
          }}
        >
          <button
            type="button"
            onClick={() => {
              openFeedback();
              setUserNotifyBanner(null);
            }}
            className="flex items-start gap-3 rounded-2xl px-4 py-3 shadow-lg border w-full text-left"
            style={{ background: "rgba(255,255,255,0.96)", backdropFilter: "blur(12px)", borderColor: "rgba(239,68,68,0.3)" }}
          >
            <div className="shrink-0 mt-0.5 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold" style={{ color: "#1e293b" }}>{liveAlertTitle}</p>
              {liveAlertSummary && <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>{liveAlertSummary}</p>}
              <p className="text-[10px] mt-1" style={{ color: "#94a3b8" }}>点击查看我的通知</p>
            </div>
            <span
              role="presentation"
              onClick={(e) => {
                e.stopPropagation();
                setDismissedAlert(bannerKey ?? new Date().toISOString());
                setUserNotifyBanner(null);
              }}
              className="shrink-0 p-1 rounded-lg hover:bg-[var(--app-color-surface-hover)]"
            >
              <X className="size-4" style={{ color: "#94a3b8" }} />
            </span>
          </button>
        </div>
      )}
      <main
        className="flex-1 min-h-0 overflow-hidden"
        style={{
          paddingTop: isHome ? undefined : MOBILE_TOP_NAV_CSS,
        }}
      >
        <div
          className="h-full min-h-0"
          style={{ display: activeTab === "home" ? undefined : "none" }}
        >
          <MobileHomeTab
            data={data}
            branding={branding}
            expiresAt={data.expiresAt}
            wsConnected={wsConnected}
            token={token}
            jwtMode={jwtMode}
            presenceRefresh={presenceRefresh}
            homeActive={activeTab === "home"}
            announcements={announcements}
            feedbackCount={feedbacks.filter(f => !f.isRead).length}
            html5PrivilegeBypass={
              data.html5PrivilegeBypass === true || html5PrivilegeBypass
            }
            currentEmail={currentEmail}
            currentSendKey={currentSendKey}
            currentWxPusher={currentWxPusher}
            onEmailChip={userIdForBind ? handleEmailChip : undefined}
            onSendKeyChip={userIdForBind ? handleSendKeyChip : undefined}
            onWxPusherChip={userIdForBind ? handleWxPusherChip : undefined}
            onNav={setActiveTab}
            onOpenAnnouncements={openAnnouncements}
            onOpenFeedback={openFeedback}
          />
        </div>
        {activeTab === "rooms" && <MobileRoomsTab token={token!} jwtMode={jwtMode} />}
        {activeTab === "material" && <MobileMaterialTab token={token!} jwtMode={jwtMode} />}
        {activeTab === "records" && <MobileRecordsTab token={token!} jwtMode={jwtMode} />}
        {activeTab === "violations" && <MobileViolationsTab token={token!} jwtMode={jwtMode} />}
        {activeTab === "group" && (
          <MobileGroupTab
            token={token!}
            jwtMode={jwtMode}
            groupName={data.dashboard.profile.projectGroupName || ""}
          />
        )}
        {activeTab === "cage" && (
          <MobileCageShelfTab
            ref={cageShelfRef}
            token={token!}
            jwtMode={jwtMode}
            html5PrivilegeBypass={
              data.html5PrivilegeBypass === true || html5PrivilegeBypass
            }
            onScreenChange={(_screen, shelfTitle) => setCageShelfNavTitle(shelfTitle)}
            jumpTarget={cageJumpTarget}
            onJumpConsumed={() => setCageJumpTarget(null)}
          />
        )}
        {activeTab === "mine" && (
          <MobileMineTab
            data={data}
            expiresAt={data.expiresAt}
            jwtMode={jwtMode}
            onOpenAnnouncements={() => openAnnouncements()}
          />
        )}
      </main>
      <MobileNoticesPanel
        open={showAnnouncements}
        onClose={() => {
          setShowAnnouncements(false);
          setAnnouncementFocusKey(null);
        }}
        alerts={announcements}
        html5PrivilegeBypass={
          data.html5PrivilegeBypass === true || html5PrivilegeBypass
        }
        initialFocusKey={announcementFocusKey}
        token={token}
        jwtMode={jwtMode}
        onNoticeSuppressed={handleNoticeSuppressed}
      />
      <MobileFeedbackPanel
        open={showFeedback}
        onClose={() => setShowFeedback(false)}
        items={feedbacks}
        wsConnected={wsConnected}
        onMarkAllRead={async () => {
          if (token) {
            await markMobileAlertsReadAll(token);
          } else {
            await markStudentMobileAlertsReadAll();
          }
          setFeedbacks((prev) => prev.map((f) => ({ ...f, isRead: true })));
        }}
      />
      {showTabBar && !showAnnouncements && !showFeedback && (
        <MobileBottomTabBar
          active={activeTab}
          onChange={(k: MobileTabBarKey) => setActiveTab(k)}
        />
      )}

      <MobileScanDialog
        open={showScanDialog}
        onClose={() => setShowScanDialog(false)}
        onResult={async (text) => {
          setShowScanDialog(false);
          const trimmed = text.trim();
          setScanResult(trimmed);
          if (!trimmed) return;

          setScanLookupLoading(true);
          try {
            const result = await lookupCode(trimmed);
            if (result.type === "CAGE_BOX" && result.cageBox) {
              const cb = result.cageBox;
              console.log('[scan-lookup] CAGE_BOX found:', JSON.stringify(cb));
              setCageJumpTarget({
                shelveId: cb.shelveId != null ? String(cb.shelveId) : undefined,
                x: Number(cb.positionX),
                y: Number(cb.positionY),
                campusName: cb.campusName,
                roomName: cb.roomName,
              });
              console.log('[scan-lookup] setCageJumpTarget + setActiveTab("cage")');
              setActiveTab("cage");
            } else if (result.type === "ASSET" && result.asset) {
              const assetCode = (result.asset as any).assetCode || trimmed;
              const assetName = (result.asset as any).assetName || "";
              alert(`已识别资产: ${assetCode}${assetName ? " - " + assetName : ""}\n\n手机版暂不支持资产详情查看，请登录电脑端。`);
            } else {
              alert(result.message || "未识别到有效内容");
            }
          } catch (e: any) {
            alert(e?.message || "查询失败");
          } finally {
            setScanLookupLoading(false);
          }
        }}
      />
    </div>
  );
}
