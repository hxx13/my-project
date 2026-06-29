/** 手机版学生中心 — 壳组件：数据加载、Tab 切换、底部导航、WebSocket、实时提醒 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Loader2, WifiOff, X } from "lucide-react";
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
import { useMobileSocket, mergeMobileUserNotify } from "./useMobileSocket";
import { isFeedbackKind } from "./mobileAlertSplit";
import MobileHomeTab from "./MobileHomeTab";
import MobileRoomsTab from "./MobileRoomsTab";
import MobileMaterialTab from "./MobileMaterialTab";
import MobileRecordsTab from "./MobileRecordsTab";
import MobileViolationsTab from "./MobileViolationsTab";
import MobileMineTab from "./MobileMineTab";
import MobileCageShelfTab, { type MobileCageShelfTabHandle } from "./MobileCageShelfTab";
import MobileGroupTab from "./MobileGroupTab";
import MobileNoticesPanel from "./MobileNoticesPanel";
import { mobileNoticeItemKey } from "./MobileNoticesPanel";
import MobileFeedbackPanel from "./MobileFeedbackPanel";
import MobileTopNavBar from "./MobileTopNavBar";
import MobileBottomTabBar from "./MobileBottomTabBar";
import {
  MOBILE_NAV_BAR_H,
  MOBILE_SUBPAGE_TABS,
  MOBILE_TAB_TITLES,
  MOBILE_TOP_NAV_CSS,
  MOBILE_TAB_BAR_TOTAL_CSS,
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
  const [showFeedback, setShowFeedback] = useState(false);
  const [announcementFocusKey, setAnnouncementFocusKey] = useState<string | null>(null);
  const jwtMode = !token;
  const { connected: wsConnected, lastAlert, lastUserNotify, clearUserNotify } = useMobileSocket(token, jwtMode);
  const [dismissedAlert, setDismissedAlert] = useState<string | null>(null);
  const [userNotifyBanner, setUserNotifyBanner] = useState<{ title: string; summary: string } | null>(null);
  const [presenceRefresh, setPresenceRefresh] = useState(0);
  const cageShelfRef = useRef<MobileCageShelfTabHandle>(null);
  const [cageShelfNavTitle, setCageShelfNavTitle] = useState<string | undefined>();

  const loadAlerts = useCallback(async () => {
    if (!token) {
      // JWT mode
      try {
        const resp = await loadJwtAlerts();
        const ann = resp.announcements ?? resp.items ?? [];
        const fb = resp.feedbacks ?? [];
        setAnnouncements(ann);
        setFeedbacks(fb);
      } catch { /* silent */ }
      return;
    }
    // Token mode (original logic, unchanged)
    try {
      const resp = await fetchMobileAlerts(token);
      const ann = resp.announcements ?? resp.items ?? [];
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
      className="fixed inset-0 flex flex-col overflow-hidden"
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
        className="flex-1 min-h-0 overflow-hidden relative z-10"
        style={{
          paddingTop: isHome ? undefined : MOBILE_TOP_NAV_CSS,
          paddingBottom: showTabBar ? MOBILE_TAB_BAR_TOTAL_CSS : undefined,
        }}
      >
        {activeTab === "home" && (
          <MobileHomeTab
            data={data}
            branding={branding}
            expiresAt={data.expiresAt}
            wsConnected={wsConnected}
            token={token}
            jwtMode={jwtMode}
            presenceRefresh={presenceRefresh}
            announcements={announcements}
            feedbackCount={feedbacks.filter(f => !f.isRead).length}
            html5PrivilegeBypass={
              data.html5PrivilegeBypass === true || html5PrivilegeBypass
            }
            onNav={setActiveTab}
            onOpenAnnouncements={openAnnouncements}
            onOpenFeedback={openFeedback}
          />
        )}
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
            onScreenChange={(_screen, shelfTitle) => setCageShelfNavTitle(shelfTitle)}
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
        onNoticeSuppressed={handleNoticeSuppressed}
      />
      <MobileFeedbackPanel
        open={showFeedback}
        onClose={() => setShowFeedback(false)}
        items={feedbacks}
        wsConnected={wsConnected}
      />
      {showTabBar && !showAnnouncements && !showFeedback && (
        <MobileBottomTabBar
          active={activeTab}
          onChange={(k: MobileTabBarKey) => setActiveTab(k)}
        />
      )}
    </div>
  );
}
