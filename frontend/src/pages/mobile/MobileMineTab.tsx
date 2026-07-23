/** 手机版 — 我的 Tab */
import {
  Phone,
  Mail,
  MapPin,
  Star,
  ShieldCheck,
  ShieldAlert,
  DoorOpen,
  FileText,
  BarChart3,
  Bell,
  ChevronRight,
  Clock,
  LogOut,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { type MobileCenterData } from "@/api/domains/mobileStudent.api";
import { authStorage } from "@/features/auth/authStorage";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";
import RingAvatar from "./MobileRingAvatar";

/* ================================================================== */
function levelFromExp(exp: number) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, exp) / 50)));
}

/* ================================================================== */
interface MobileMineTabProps {
  data: NonNullable<MobileCenterData>;
  expiresAt?: string;
  jwtMode?: boolean;
  onOpenAnnouncements?: () => void;
}

export default function MobileMineTab({
  data,
  expiresAt,
  jwtMode,
  onOpenAnnouncements,
}: MobileMineTabProps) {
  const navigate = useNavigate();
  const { profile } = data.dashboard;
  const lv = levelFromExp(profile.totalExp ?? 0);

  const handleLogout = () => {
    authStorage.clear();
    navigate("/m/login", { replace: true });
  };

  return (
    <div className="h-full overflow-y-auto pb-4">
      {/* Profile Card */}
      <div
        className="relative mx-4 mt-4 rounded-3xl px-5 pt-6 pb-5 overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(4px)",
          border: "1px solid rgba(30,55,90,0.06)",
          boxShadow: "0 6px 24px rgba(15,23,42,0.05)",
        }}
      >
        <div
          className="absolute -top-6 -right-6 w-32 h-32 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(99,102,241,0.05), transparent 70%)",
          }}
        />
        <div className="relative flex flex-col items-center text-center">
          <RingAvatar
            src={
              profile.head
                ? resolvePersonnelAvatarUrl(profile.head)
                : undefined
            }
            name={profile.name}
            size={54}
          />
          <h1
            className="mt-3 text-xl font-extrabold"
            style={{ color: "#0f172a" }}
          >
            {profile.name || "--"}
          </h1>
          {profile.departmentName && (
            <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
              {profile.departmentName}
            </p>
          )}

          {/* Badges */}
          <div className="flex flex-wrap justify-center gap-1.5 mt-2.5">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium"
              style={{
                background:
                  profile.authStatus === "已授权" ? "#dcfce7" : "#fef3c7",
                color:
                  profile.authStatus === "已授权" ? "#16a34a" : "#d97706",
              }}
            >
              {profile.authStatus === "已授权" ? (
                <ShieldCheck className="size-2.5" />
              ) : (
                <ShieldAlert className="size-2.5" />
              )}
              {profile.authStatus}
            </span>
            <span
              className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-medium"
              style={{ background: "#ede9fe", color: "#7c3aed" }}
            >
              {profile.roleLabel || "学生"}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium"
              style={{ background: "#fefce8", color: "#a16207" }}
            >
              <Star className="size-2.5" style={{ color: "#eab308" }} />
              Lv.{lv}
            </span>
          </div>

          {/* Contact info */}
          <div
            className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-3 pt-3 w-full"
            style={{ borderTop: "1px solid rgba(30,55,90,0.05)" }}
          >
            {profile.mobilePhone && (
              <span
                className="inline-flex items-center gap-1 text-[11px]"
                style={{ color: "#64748b" }}
              >
                <Phone className="size-3" />
                {profile.mobilePhone}
              </span>
            )}
            {profile.email && (
              <span
                className="inline-flex items-center gap-1 text-[11px]"
                style={{ color: "#64748b" }}
              >
                <Mail className="size-3" />
                <span className="truncate max-w-[120px]">
                  {profile.email}
                </span>
              </span>
            )}
            {profile.projectGroupName && (
              <span
                className="inline-flex items-center gap-1 text-[11px]"
                style={{ color: "#64748b" }}
              >
                <MapPin className="size-3" />
                <span className="truncate max-w-[120px]">
                  {profile.projectGroupName}
                </span>
              </span>
            )}
          </div>

          {profile.allowedRoomsDisplayZh && (
            <div
              className="mt-2.5 pt-2.5 w-full text-center"
              style={{ borderTop: "1px solid rgba(30,55,90,0.05)" }}
            >
              <span className="text-[10px]" style={{ color: "#94a3b8" }}>
                <ShieldCheck
                  className="size-2.5 inline mr-1"
                  style={{ color: "#16a34a" }}
                />
                {profile.allowedRoomsDisplayZh}
              </span>
            </div>
          )}
        </div>

        {!jwtMode && expiresAt && (
          <div
            className="mt-3 pt-3 text-center"
            style={{ borderTop: "1px solid rgba(30,55,90,0.05)" }}
          >
            <span
              className="inline-flex items-center gap-1 text-[10px] rounded-full px-2.5 py-1"
              style={{ background: "rgba(172,23,54,0.06)", color: "#ac1736" }}
            >
              <Clock className="size-2.5" />
              有效期至 {expiresAt.slice(0, 10)}
            </span>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div
        className="mx-4 mt-4 rounded-2xl overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.55)",
          boxShadow: "0 4px 14px rgba(15,23,42,0.03)",
        }}
      >
        {[
          { label: "我的房间", color: "#6366f1", icon: DoorOpen, action: undefined },
          { label: "出入记录", color: "#10b981", icon: FileText, action: undefined },
          { label: "数据统计", color: "#f59e0b", icon: BarChart3, action: undefined },
          { label: "通知公告", color: "#ef4444", icon: Bell, action: onOpenAnnouncements },
        ].map((item, idx) => (
          <button
            key={item.label}
            type="button"
            onClick={() => item.action?.()}
            className="flex items-center gap-3 px-4 py-3.5 w-full text-left active:bg-gray-50/50 transition-colors"
            style={
              idx ? { borderTop: "1px solid rgba(30,55,90,0.04)" } : undefined
            }
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${item.color}12` }}
            >
              <item.icon
                className="size-4"
                style={{ color: item.color }}
                strokeWidth={1.5}
              />
            </div>
            <span
              className="flex-1 text-[13px] font-medium"
              style={{ color: "#323233" }}
            >
              {item.label}
            </span>
            <ChevronRight className="size-4" style={{ color: "#c8c9cc" }} />
          </button>
        ))}
      </div>

      {/* Logout — JWT mode only */}
      {jwtMode && (
        <div className="mx-4 mt-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3.5 w-full text-left rounded-2xl active:bg-gray-50/50 transition-colors"
            style={{
              background: "rgba(255,255,255,0.55)",
              boxShadow: "0 4px 14px rgba(15,23,42,0.03)",
            }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(239,68,68,0.12)" }}
            >
              <LogOut className="size-4" style={{ color: "#ef4444" }} strokeWidth={1.5} />
            </div>
            <span className="flex-1 text-[13px] font-medium" style={{ color: "#ef4444" }}>
              退出登录
            </span>
            <ChevronRight className="size-4" style={{ color: "#c8c9cc" }} />
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="text-center py-8 mt-4">
        <p className="text-[10px]" style={{ color: "rgba(100,116,139,0.4)" }}>
          上海交通大学医学院·实验动物科学部
        </p>
      </div>
    </div>
  );
}
