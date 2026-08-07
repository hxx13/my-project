/** 手机版 — 我的 Tab */
import { useState, useEffect } from "react";
import {
  Phone,
  Mail,
  MessageCircle,
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
  Settings,
  Smartphone,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { type MobileCenterData } from "@/api/domains/mobileStudent.api";
import { authStorage } from "@/features/auth/authStorage";
import { sendVerificationCode, bindEmailWithCode } from "@/api/domains/auth.api";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";
import { toast } from "react-hot-toast";
import RingAvatar from "./MobileRingAvatar";
import { WxPusherBindModal } from "@/components/shared/WxPusherBindModal";

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
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeSending, setEmailCodeSending] = useState(false);
  const [emailCodeCooldown, setEmailCodeCooldown] = useState(0);
  const [emailSaving, setEmailSaving] = useState(false);
  const [currentEmail, setCurrentEmail] = useState("");
  const [sendKeyOpen, setSendKeyOpen] = useState(false);
  const [sendKeyDraft, setSendKeyDraft] = useState("");
  const [sendKeySaving, setSendKeySaving] = useState(false);
  const [currentSendKey, setCurrentSendKey] = useState(false);
  const [wxPusherOpen, setWxPusherOpen] = useState(false);
  const [currentWxPusher, setCurrentWxPusher] = useState(false);
  const personnelId = data.userId || "";

  // 读取本地管理的 contact_email
  useEffect(() => {
    if (!personnelId) return;
    const token = authStorage.getToken();
    fetch(`/api/admin/personnel/${encodeURIComponent(personnelId)}/contact-email`, {
      headers: { Authorization: "Bearer " + token },
    })
      .then((r) => r.json().catch(() => ({})))
      .then((body) => setCurrentEmail(body?.data?.email || ""))
      .catch(() => setCurrentEmail(""));
  }, [personnelId]);

  // 读取 sendKey + URL 自动捕获
  useEffect(() => {
    if (!personnelId) return;
    const token = authStorage.getToken();
    const headers = { Authorization: "Bearer " + token };
    fetch(`/api/admin/personnel/${encodeURIComponent(personnelId)}/send-key`, { headers })
      .then((r) => r.json().catch(() => ({})))
      .then((body) => setCurrentSendKey(!!body?.data?.sendKey))
      .catch(() => {});
    fetch(`/api/admin/personnel/${encodeURIComponent(personnelId)}/wx-pusher-uid`, { headers })
      .then((r) => r.json().catch(() => ({})))
      .then((body) => setCurrentWxPusher(!!body?.data?.hasWxPusherUid))
      .catch(() => {});
    // URL 自动捕获
    const params = new URLSearchParams(window.location.search);
    const sk = params.get("sendkey");
    if (sk && params.get("bindUserId") === personnelId) {
      setSendKeyDraft(sk);
      setSendKeyOpen(true);
      const cleaned = new URLSearchParams(window.location.search);
      cleaned.delete("sendkey"); cleaned.delete("bindUserId");
      const qs = cleaned.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    }
  }, [personnelId]);

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
            <button
              type="button"
              onClick={() => {
                if (!personnelId) { toast.error("无法获取人员ID"); return; }
                setEmailDraft(currentEmail);
                setEmailOpen(true);
              }}
              className="inline-flex items-center gap-1 text-[11px] active:opacity-70"
              style={{ color: currentEmail ? "#6366f1" : "#64748b" }}
            >
              <Mail className="size-3" />
              <span className="truncate max-w-[120px]">
                {currentEmail || "绑定邮箱"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!personnelId) { toast.error("无法获取人员ID"); return; }
                if (currentSendKey) {
                  if (!window.confirm("已绑定微信通知，是否取消绑定？")) return;
                  const token = authStorage.getToken();
                  fetch(`/api/admin/personnel/${encodeURIComponent(personnelId)}/send-key`, {
                    method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                    body: JSON.stringify({ sendKey: "" }),
                  }).then((r) => {
                    if (r.ok) { setCurrentSendKey(false); toast.success("已取消微信通知绑定"); }
                    else toast.error("取消失败");
                  }).catch(() => toast.error("取消失败"));
                  return;
                }
                setSendKeyDraft("");
                setSendKeyOpen(true);
              }}
              className="inline-flex items-center gap-1 text-[11px] active:opacity-70"
              style={{ color: currentSendKey ? "#059669" : "#64748b" }}
            >
              <MessageCircle className="size-3" />
              <span className="truncate max-w-[120px]">
                {currentSendKey ? "微信已绑定" : "微信通知"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!personnelId) { toast.error("无法获取人员ID"); return; }
                if (currentWxPusher) {
                  if (!window.confirm("已绑定 WxPusher 推送，是否取消绑定？")) return;
                  const token = authStorage.getToken();
                  fetch(`/api/admin/personnel/${encodeURIComponent(personnelId)}/wx-pusher-uid`, {
                    method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                    body: JSON.stringify({ wxPusherUid: "" }),
                  }).then((r) => {
                    if (r.ok) { setCurrentWxPusher(false); toast.success("已取消 WxPusher 推送绑定"); }
                    else toast.error("取消失败");
                  }).catch(() => toast.error("取消失败"));
                  return;
                }
                setWxPusherOpen(true);
              }}
              className="inline-flex items-center gap-1 text-[11px] active:opacity-70"
              style={{ color: currentWxPusher ? "#059669" : "#64748b" }}
            >
              <Smartphone className="size-3" />
              <span className="truncate max-w-[120px]">
                {currentWxPusher ? "WxPusher已绑定" : "WxPusher推送"}
              </span>
            </button>
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
          { label: "设置", color: "#8b5cf6", icon: Settings, path: "/m/settings" },
        ].map((item, idx) => (
          <button
            key={item.label}
            type="button"
            onClick={() => item.path ? navigate(item.path) : item.action?.()}
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

      {/* Footer — 点击跳转门户首页 */}
      <div className="text-center py-8 mt-4">
        <a
          href="/#/"
          className="text-[10px] hover:underline"
          style={{ color: "rgba(100,116,139,0.4)" }}
        >
          上海交通大学医学院·实验动物科学部
        </a>
      </div>

      {/* Email edit dialog */}
      {emailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-5 shadow-xl dark:shadow-gray-900/50">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">绑定邮箱</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">设置用于接收通知的联系邮箱</p>
            <input
              type="email"
              value={emailDraft}
              onChange={(e) => { setEmailDraft(e.target.value); setEmailCode(""); }}
              maxLength={128}
              className="mt-3 w-full rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800"
              placeholder="请输入邮箱地址"
            />
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800"
                placeholder="6位验证码"
              />
              <button
                type="button"
                disabled={!emailDraft.trim() || emailCodeSending || emailCodeCooldown > 0}
                className="shrink-0 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 px-3 py-2.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 disabled:opacity-40"
                onClick={async () => {
                  if (!emailDraft.trim()) return;
                  setEmailCodeSending(true);
                  try {
                    const r = await sendVerificationCode(emailDraft.trim(), "BIND_EMAIL");
                    toast.success(r.message || "验证码已发送");
                    setEmailCodeCooldown(r.cooldownSeconds || 60);
                  } catch (e: any) {
                    toast.error(e?.message || "发送失败");
                  } finally {
                    setEmailCodeSending(false);
                  }
                }}
              >
                {emailCodeCooldown > 0 ? `${emailCodeCooldown}s` : emailCodeSending ? "发送中" : "获取验证码"}
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm text-gray-600 dark:text-gray-300"
                onClick={() => { setEmailOpen(false); setEmailCode(""); setEmailCodeCooldown(0); }}
              >取消</button>
              <button
                type="button"
                disabled={!emailDraft.trim() || emailCode.length !== 6 || emailSaving}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                onClick={async () => {
                  setEmailSaving(true);
                  try {
                    await bindEmailWithCode(emailDraft.trim(), emailCode.trim());
                    toast.success("邮箱已绑定");
                    setCurrentEmail(emailDraft.trim());
                    setEmailOpen(false);
                    setEmailCode("");
                    setEmailCodeCooldown(0);
                  } catch (e: any) {
                    toast.error(e?.message || "保存失败");
                  } finally {
                    setEmailSaving(false);
                  }
                }}
              >{emailSaving ? "绑定中…" : "确认绑定"}</button>
            </div>
          </div>
        </div>
      )}

      {/* SendKey binding dialog */}
      {sendKeyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-5 shadow-xl dark:shadow-gray-900/50">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">绑定微信通知</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">通过 Server酱 SendKey 接收微信推送通知</p>
            <a
              href={`https://sct.ftqq.com/appkey/create/forward?name=ARO&url=${encodeURIComponent(`${window.location.origin}/#/m/home?sendkey={key}&bindUserId=${encodeURIComponent(personnelId)}`)}`}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:text-indigo-800 dark:hover:text-indigo-300"
            >
              还没有 SendKey？点此前往 Server酱 创建 →
            </a>
            <input
              type="text"
              value={sendKeyDraft}
              onChange={(e) => setSendKeyDraft(e.target.value)}
              maxLength={256}
              className="mt-3 w-full rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800"
              placeholder="粘贴 SendKey"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm text-gray-600 dark:text-gray-300"
                onClick={() => setSendKeyOpen(false)}>取消</button>
              <button type="button" disabled={!sendKeyDraft.trim() || sendKeySaving}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                onClick={async () => {
                  setSendKeySaving(true);
                  try {
                    const token = authStorage.getToken();
                    const res = await fetch(`/api/admin/personnel/${encodeURIComponent(personnelId)}/send-key`, {
                      method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                      body: JSON.stringify({ sendKey: sendKeyDraft.trim() }),
                    });
                    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "保存失败");
                    toast.success("微信通知已绑定");
                    setCurrentSendKey(true);
                    setSendKeyOpen(false);
                  } catch (e: any) { toast.error(e?.message || "保存失败"); }
                  finally { setSendKeySaving(false); }
                }}
              >{sendKeySaving ? "保存中…" : "保存"}</button>
            </div>
          </div>
        </div>
      )}

      {/* WxPusher binding dialog */}
      <WxPusherBindModal
        open={wxPusherOpen}
        onClose={() => setWxPusherOpen(false)}
        personnelId={personnelId}
        authToken={authStorage.getToken()}
        onSaved={() => setCurrentWxPusher(true)}
      />
    </div>
  );
}
