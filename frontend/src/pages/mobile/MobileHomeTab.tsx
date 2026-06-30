/** 手机版 — 首页 Tab */
import {
  DoorOpen,
  Package,
  Bell,
  LayoutGrid,
  ClipboardList,
  AlertTriangle,
  Users,
} from "lucide-react";
import type { MobileCenterData, MobileAlertItem } from "@/api/domains/mobileStudent.api";
import type { LoginBranding } from "@/api/domains/publicSite.api";
import HeroBanner from "./MobileHeroBanner";
import { MobileHomeNoticeList } from "./MobileHomeNoticeList";
import MobilePresenceStatusBar from "./MobilePresenceStatusBar";
import { useMobilePresenceStatus } from "./useMobilePresenceStatus";
import { MOBILE_HOME_NOTICE_SECTION_STYLE } from "./mobileNoticePresentation";
import {
  MOBILE_SCROLL_END_EXTRA_PAD,
  type MobileShellTabKey,
} from "./mobileShellLayout";

type TabKey = MobileShellTabKey;

interface MobileHomeTabProps {
  data: NonNullable<MobileCenterData>;
  branding: LoginBranding | null;
  expiresAt?: string;
  wsConnected?: boolean;
  token?: string;
  jwtMode?: boolean;
  /** 公告区（公告 + 豁免 + 违规） */
  announcements: MobileAlertItem[];
  /** 审核反馈条数（快捷入口角标） */
  feedbackCount?: number;
  html5PrivilegeBypass?: boolean;
  /** WebSocket / 手动刷新时递增，触发进出状态重拉 */
  presenceRefresh?: number;
  onNav: (tab: TabKey) => void;
  /** 首页下方「公告通知」、具体公告条目 */
  onOpenAnnouncements: (highlightKey?: string) => void;
  /** 第二行快捷入口「通知」→ 物资/延迟审核反馈 */
  onOpenFeedback: () => void;
}

export default function MobileHomeTab({
  data,
  branding,
  expiresAt,
  wsConnected = false,
  token,
  jwtMode,
  presenceRefresh = 0,
  announcements,
  feedbackCount = 0,
  html5PrivilegeBypass = false,
  onNav,
  onOpenAnnouncements,
  onOpenFeedback,
}: MobileHomeTabProps) {
  const { profile } = data.dashboard;
  const presence = useMobilePresenceStatus(token, presenceRefresh, jwtMode);

  return (
    <div className="h-full min-h-0 overflow-y-auto flex flex-col" style={{ background: "transparent" }}>
      {/* Hero 固定高度，禁止 flex 压缩 */}
      <div className="shrink-0 relative z-[1]">
        <HeroBanner branding={branding} expiresAt={!jwtMode ? expiresAt : undefined} wsConnected={wsConnected} jwtMode={jwtMode} />
      </div>

      <div className="relative z-10 -mt-6 mx-4 shrink-0">
        <div
          className="flex items-center justify-between gap-4 px-5 py-3 rounded-2xl"
          style={{
            background: "linear-gradient(135deg, rgba(172,23,54,0.9), rgba(120,18,38,0.94))",
            border: "1px solid rgba(255,255,255,0.2)",
            boxShadow: "0 4px 16px rgba(172,23,54,0.2)",
          }}
        >
          <span className="flex-1 min-w-0 text-[13px] text-white/95 truncate">
            你好，{profile.name || "同学"}
          </span>
          <button
            type="button"
            onClick={() => onNav("mine")}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold active:scale-95"
            style={{
              background: "linear-gradient(135deg, #fce8d8, #f0c896)",
              color: "rgb(120,18,38)",
              boxShadow: "0 2px 6px rgba(240,200,150,0.4)",
            }}
          >
            个人中心
          </button>
        </div>
      </div>

      <MobilePresenceStatusBar snapshot={presence} />

      <div className="px-3 mt-2.5 relative z-10 min-h-0" style={{ paddingBottom: MOBILE_SCROLL_END_EXTRA_PAD }}>
        <div
          className="rounded-2xl px-3 py-4"
          style={{
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(1px)",
            WebkitBackdropFilter: "blur(1px)",
            boxShadow: "0 8px 32px rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.04)",
            border: "1px solid rgba(255,255,255,0.25)",
          }}
        >
          <div className="flex justify-around gap-2 px-1">
            {[
              { id: "rooms", label: "房间", icon: DoorOpen, onClick: () => onNav("rooms") },
              { id: "material", label: "申领", icon: Package, onClick: () => onNav("material") },
              { id: "cage", label: "笼架", icon: LayoutGrid, onClick: () => onNav("cage") },
            ].map((item) => (
              <button
                key={item.id}
                onClick={item.onClick}
                className="flex flex-col items-center gap-1.5 px-1 py-1 active:scale-[0.97] transition-transform"
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(180deg, #f4f5ff, #eef0ff)",
                    boxShadow: "0 3px 9px rgba(172,23,54,0.12)",
                  }}
                >
                  <item.icon className="size-7" style={{ color: "#ac1736" }} strokeWidth={1.5} />
                </div>
                <span className="text-sm font-bold" style={{ color: "#323233" }}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>

          <div
            className="h-px my-3 mx-2"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(172,23,54,0.06), transparent)",
            }}
          />

          <div className="flex justify-around">
            {[
              { id: "records2", label: "出入记录", icon: ClipboardList, onClick: () => onNav("records") },
              { id: "notices", label: "通知", icon: Bell, onClick: () => onOpenFeedback(), badge: feedbackCount },
              { id: "group", label: "课题组", icon: Users, onClick: () => onNav("group") },
              { id: "violations", label: "违规记录", icon: AlertTriangle, onClick: () => onNav("violations") },
            ].map((item) => (
              <button
                key={item.id}
                onClick={item.onClick}
                className="flex flex-col items-center gap-1.5 px-2 py-0.5 active:scale-[0.94] transition-transform relative"
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center relative"
                  style={{
                    background: "linear-gradient(180deg, #f4f5ff, #eef0ff)",
                    boxShadow: "0 3px 10px rgba(172,23,54,0.1)",
                  }}
                >
                  <item.icon className="size-5" style={{ color: "#ac1736" }} strokeWidth={1.5} />
                  {item.badge != null && item.badge > 0 && (
                    <span
                      className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
                      style={{ background: "#ef4444" }}
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium" style={{ color: "#323233" }}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 公告区：独立 section，与小程序 news-card 同级，不叠在 Hero 上 */}
        <div style={MOBILE_HOME_NOTICE_SECTION_STYLE}>
          <button
            type="button"
            onClick={() => onOpenAnnouncements()}
            className="flex items-center justify-between mb-2.5 px-1 w-full"
          >
            <span
              className="text-[15px] font-bold rounded-full px-2.5 py-1"
              style={{
                color: "#1f2937",
                background: "rgba(255,255,255,0.85)",
                boxShadow: "0 2px 6px rgba(15,23,42,0.06)",
              }}
            >
              公告通知
            </span>
            {announcements.length > 0 && (
              <span className="text-[11px] font-medium" style={{ color: "#ac1736" }}>
                查看全部 →
              </span>
            )}
          </button>
          <MobileHomeNoticeList
            items={announcements}
            html5PrivilegeBypass={html5PrivilegeBypass}
            onSelect={(key) => onOpenAnnouncements(key)}
          />
        </div>
      </div>
    </div>
  );
}
