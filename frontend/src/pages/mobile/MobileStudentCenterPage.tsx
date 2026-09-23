/** 手机版学生中心 — 壳组件：数据加载、Tab 切换、底部导航、WebSocket、实时提醒 */
import "./mobile-student-shell.css";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, WifiOff, X, Scan, Home } from "lucide-react";
import {
  fetchMobileCenter,
  fetchMobileAlerts,
  markMobileAlertsReadAll,
  markMobileAnnouncementsViewed,
  isMobileTokenDead,
  type MobileCenterData,
  type MobileAlertItem,
} from "@/api/domains/mobileStudent.api";
import { markStudentMobileAlertsReadAll, markStudentMobileAnnouncementsViewed } from "@/api/domains/studentMobile.api";
import { fetchLoginBranding, type LoginBranding } from "@/api/domains/publicSite.api";
import * as studentMobileApi from "@/api/domains/studentMobile.api";
import { hasMobileHtml5Privilege } from "@/features/auth/roleAccess";
import { authStorage } from "@/features/auth/authStorage";
import { useMobileSocket, mergeMobileUserNotify } from "./useMobileSocket";
import { isFeedbackKind } from "./mobileAlertSplit";
import { sortMobileAnnouncementsForDisplay } from "./mobileExemptAlertHelpers";
import MobileHomeTab from "./MobileHomeTab";
import MobileRoomsTab from "./MobileRoomsTab";
import MobileMaterialTab from "./MobileMaterialTab";
import MobileAnimalOrderView from "./MobileAnimalOrderView";
import MobileRecordsTab from "./MobileRecordsTab";
import MobileViolationsTab from "./MobileViolationsTab";
import MobileMineTab from "./MobileMineTab";
import MobileTrainingTab from "./MobileTrainingTab";
import MobileExamTab, { type ExamBarState, type MobileExamTabHandle } from "./MobileExamTab";
import MobileCertificatesTab from "./MobileCertificatesTab";
import MobileHealthTab from "./MobileHealthTab";
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

import { appAlert } from "@/lib/appDialog";
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

/** 直链（扫码）失效专用页：直链不可恢复，引导改用正式版登录 */
function PageTokenDead({ code, message, onLogin }: { code: number; message: string; onLogin: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6" style={{ background: PAGE_BG }}>
      <WifiOff className="size-12" style={{ color: "#c8c9cc" }} />
      <h1 className="text-base font-semibold text-center" style={{ color: "#323233" }}>
        {code === 1010002 ? "直链模式已过期" : "直链模式已失效"}
      </h1>
      <p className="text-sm text-center max-w-xs leading-relaxed" style={{ color: "#969799" }}>
        {message}。扫码直链有效期有限，重新生成后旧链接会立即作废。
      </p>
      <p className="text-sm text-center max-w-xs leading-relaxed" style={{ color: "#969799" }}>
        请使用正式版模式登录后查看学生中心。
      </p>
      <button onClick={onLogin} className="px-6 py-2.5 rounded-full text-white text-sm font-medium active:scale-95"
        style={{ background: `linear-gradient(135deg, ${BRAND}, #8B1229)` }}>去登录</button>
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
function loadJwtAlerts(): Promise<import("@/api/domains/mobileStudent.api").MobileAlertsData> {
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
  const [tokenDead, setTokenDead] = useState<{ code: number; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<MobileShellTabKey>("home");
  /**
   * 子页返回锚点：从哪个「底栏主 Tab」进的子页，返回就回那儿。
   * 原先写死回首页 —— 从「我的」点进健康调查表/证书再返回会被甩到首页。
   * 子页之间互相跳转不改锚点（否则 training→certificates 返回会落到 training）。
   */
  const returnTabRef = useRef<MobileShellTabKey>("home");
  const goTab = useCallback(
    (next: MobileShellTabKey) => {
      if (MOBILE_SUBPAGE_TABS.includes(next) && !MOBILE_SUBPAGE_TABS.includes(activeTab)) {
        returnTabRef.current = activeTab;
      }
      setActiveTab(next);
    },
    [activeTab],
  );
  const [branding, setBranding] = useState<LoginBranding | null>(null);
  const [announcements, setAnnouncements] = useState<MobileAlertItem[]>([]);
  const [announcementsUnread, setAnnouncementsUnread] = useState(false);
  const [feedbacks, setFeedbacks] = useState<MobileAlertItem[]>([]);
  const [html5PrivilegeBypass, setHtml5PrivilegeBypass] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);

  const navigate = useNavigate();

  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [cageJumpTarget, setCageJumpTarget] = useState<{
    shelveId?: string; x: number; y: number; campusName?: string; roomName?: string;
  } | null>(null);
  const [scanLookupLoading, setScanLookupLoading] = useState(false);

  const [showFeedback, setShowFeedback] = useState(false);
  const [announcementFocusKey, setAnnouncementFocusKey] = useState<string | null>(null);
  const jwtMode = !token;
  const { connected: wsConnected, lastAlert, lastUserNotify, clearUserNotify } = useMobileSocket(token, jwtMode);
  const [dismissedAlert, setDismissedAlert] = useState<string | null>(null);
  const [userNotifyBanner, setUserNotifyBanner] = useState<{ title: string; summary: string } | null>(null);
  const [presenceRefresh, setPresenceRefresh] = useState(0);
  const cageShelfRef = useRef<MobileCageShelfTabHandle>(null);
  const [cageShelfNavTitle, setCageShelfNavTitle] = useState<string | undefined>();
  /** 答题：答题中把顶栏换成「试卷名 + 已答/提交」，返回键先退回试卷列表 */
  const examRef = useRef<MobileExamTabHandle>(null);
  const [examBar, setExamBar] = useState<ExamBarState | null>(null);
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
        setAnnouncementsUnread(resp.announcementsUnread === true);
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
      setAnnouncementsUnread(resp.announcementsUnread === true);
    } catch {
      /* 静默失败 */
    }
  }, [token]);

  const openAnnouncements = useCallback((focusKey?: string) => {
    setAnnouncementFocusKey(focusKey ?? null);
    setShowAnnouncements(true);
    // 打开公告区即标记已读：只清本地红点，不整表重拉 — post-save-no-full-refresh.mdc
    const markViewed = token
      ? markMobileAnnouncementsViewed(token)
      : markStudentMobileAnnouncementsViewed();
    markViewed.then(() => setAnnouncementsUnread(false)).catch(() => {});
  }, [token]);

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
    setTokenDead(null);
    try {
      const [d, b] = await Promise.all([
        fetchMobileCenter(token),
        fetchLoginBranding().catch(() => null),
      ]);
      setData(d);
      setBranding(b);
    } catch (e) {
      if (isMobileTokenDead(e)) {
        setTokenDead({ code: e.code, message: e.message });
      } else {
        setError(e instanceof Error ? e.message : "加载失败");
      }
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

  // 子页可在离开前注册守卫（动物订购的编辑态用它提示并自动回退）
  const editExitGuardRef = useRef<(() => Promise<boolean>) | null>(null);
  const registerEditExitGuard = useCallback((fn: (() => Promise<boolean>) | null) => {
    editExitGuardRef.current = fn;
  }, []);

  const handleTopNavBack = useCallback(() => {
    if (activeTab === "cage" && cageShelfRef.current?.pop()) {
      return;
    }
    if (activeTab === "exam" && examRef.current?.pop()) {
      return;
    }
    void (async () => {
      if (editExitGuardRef.current && !(await editExitGuardRef.current())) return;
      setActiveTab(returnTabRef.current);
    })();
  }, [activeTab]);

  if (loading) return <PageSkeleton />;
  if (tokenDead)
    return (
      <PageTokenDead
        code={tokenDead.code}
        message={tokenDead.message}
        onLogin={() => navigate("/m/login", { replace: true })}
      />
    );
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
      : activeTab === "exam" && examBar
        ? examBar.title
        : MOBILE_TAB_TITLES[activeTab] ?? "";
  /** 笼架 / 学生申领 一进来（列表）就收起底部 tabbar —— 手机上那一行很占画面高度 */
  const HIDE_TABBAR_TABS: MobileTabBarKey[] = ["cage", "material"];
  const showTabBar =
    !MOBILE_SUBPAGE_TABS.includes(activeTab) && !HIDE_TABBAR_TABS.includes(activeTab as MobileTabBarKey);

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
        ) : activeTab === "exam" && examBar ? (
          <div className="flex items-center gap-2 pr-1">
            <span className="text-[12px] tabular-nums" style={{ color: "#94a3b8" }}>
              已答 {examBar.answered}/{examBar.total}
            </span>
            <button
              type="button"
              disabled={examBar.submitting}
              onClick={() => examRef.current?.submit()}
              className="rounded-[length:var(--admin-radius-md,0.375rem)] border border-[var(--app-color-accent)] bg-[var(--app-color-accent)] px-2.5 py-1 text-[13px] font-medium text-white shadow disabled:opacity-50"
            >
              {examBar.submitting ? "提交中…" : "提交"}
            </button>
          </div>
        ) : null}
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
            announcementsUnread={announcementsUnread}
            feedbackCount={feedbacks.filter(f => !f.isRead).length}
            html5PrivilegeBypass={
              data.html5PrivilegeBypass === true || html5PrivilegeBypass
            }
            onNav={goTab}
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
            onNav={goTab}
            onOpenAnnouncements={() => openAnnouncements()}
          />
        )}
        {activeTab === "animalOrder" && <MobileAnimalOrderView jwtMode={jwtMode} onRegisterExitGuard={registerEditExitGuard} />}
        {/* 培训报名 / 答题：只做登录态（/m/home），扫码特殊通道不走这两个接口 */}
        {activeTab === "training" && jwtMode && <MobileTrainingTab />}
        {activeTab === "exam" && jwtMode && <MobileExamTab ref={examRef} onBarChange={setExamBar} />}
        {activeTab === "certificates" && jwtMode && <MobileCertificatesTab />}
        {activeTab === "health" && jwtMode && <MobileHealthTab />}
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
          onChange={(k: MobileTabBarKey) => goTab(k)}
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
            if (result.type === "CAGE_CELL" && result.cageCell) {
              const cb = result.cageCell;
              setCageJumpTarget({
                shelveId: cb.shelveId != null ? String(cb.shelveId) : undefined,
                x: Number(cb.positionX),
                y: Number(cb.positionY),
                campusName: cb.campusName,
                roomName: cb.roomName,
              });
              setActiveTab("cage");
            } else if (result.type === "LEGACY_CAGE_BOX") {
              await appAlert(result.message || "旧盒码已废弃，请扫笼位码");
            } else if (result.type === "CAGE_BOX" && result.cageBox) {
              const cb = result.cageBox;
              setCageJumpTarget({
                shelveId: cb.shelveId != null ? String(cb.shelveId) : undefined,
                x: Number(cb.positionX),
                y: Number(cb.positionY),
                campusName: cb.campusName,
                roomName: cb.roomName,
              });
              setActiveTab("cage");
            } else if (result.type === "ASSET" && result.asset) {
              const assetCode = (result.asset as any).assetCode || trimmed;
              const assetName = (result.asset as any).assetName || "";
              await appAlert(`已识别资产: ${assetCode}${assetName ? " - " + assetName : ""}\n\n手机版暂不支持资产详情查看，请登录电脑端。`);
            } else {
              await appAlert(result.message || "未识别到有效内容");
            }
          } catch (e: any) {
            await appAlert(e?.message || "查询失败");
          } finally {
            setScanLookupLoading(false);
          }
        }}
      />
    </div>
  );
}
