import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone, Download, QrCode } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** WxPusher 公众号关注链接 */
const WXPUSHER_FOLLOW_URL = "https://wxpusher.zjiecode.com/app/#/follow?type=1&id=133073";
/** WxPusher App 下载页面 */
const WXPUSHER_DOWNLOAD_URL = "https://wxpusher.zjiecode.com/download/app-download.html";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface WxPusherBindModalProps {
  open: boolean;
  onClose: () => void;
  /** 人员 userId，用于 API 调用 */
  personnelId: string;
  /** 人员显示名（可选，用于 admin 代填场景提示） */
  personName?: string;
  /** 保存成功后的回调 */
  onSaved?: (uid: string) => void;
  /** 保存 API 的 auth token（如果调用方没有 authStorage 依赖） */
  authToken?: string;
  /** API base path，默认 /api/admin/personnel */
  apiBase?: string;
}

/* ------------------------------------------------------------------ */
/*  Shared QR block (used both inline + in the modal)                  */
/* ------------------------------------------------------------------ */

function QrPair({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-4", className)}>
      {/* 订阅二维码 */}
      <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
        <div className="rounded-xl border border-[var(--app-color-border-default)] bg-white p-2 shadow-sm">
          <QRCodeSVG
            value={WXPUSHER_FOLLOW_URL}
            size={120}
            level="M"
            fgColor="#1a1a1a"
            bgColor="#ffffff"
          />
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--app-color-text-secondary)]">
          <QrCode className="h-3 w-3 text-[var(--app-color-accent)]" />
          扫码关注公众号
        </span>
        <span className="text-[10px] text-[var(--app-color-text-tertiary)] text-center leading-tight">
          关注后进入「我的 → 我的UID」复制
        </span>
      </div>

      {/* 下载二维码 */}
      <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
        <div className="rounded-xl border border-[var(--app-color-border-default)] bg-white p-2 shadow-sm">
          <QRCodeSVG
            value={WXPUSHER_DOWNLOAD_URL}
            size={120}
            level="M"
            fgColor="#1a1a1a"
            bgColor="#ffffff"
          />
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--app-color-text-secondary)]">
          <Download className="h-3 w-3 text-[var(--app-color-accent)]" />
          扫码下载 App
        </span>
        <span className="text-[10px] text-[var(--app-color-text-tertiary)] text-center leading-tight">
          安装后登录即可接收厂商推送
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function WxPusherBindModal({
  open,
  onClose,
  personnelId,
  personName,
  onSaved,
  authToken,
  apiBase = "/api/admin/personnel",
}: WxPusherBindModalProps) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSave = async () => {
    const uid = draft.trim();
    if (!uid || !personnelId || saving) return;

    setSaving(true);
    try {
      const res = await fetch(
        `${apiBase}/${encodeURIComponent(personnelId)}/wx-pusher-uid`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ wxPusherUid: uid }),
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as any).message || `HTTP ${res.status}`);
      }

      toast.success("WxPusher 推送已绑定");
      onSaved?.(uid);
      setDraft("");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-[var(--app-elevation-modal)] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <Smartphone className="h-5 w-5 text-[var(--app-color-accent)] shrink-0" />
          <h3 className="text-base font-bold text-[var(--app-color-text-primary)]">
            绑定 WxPusher 推送
          </h3>
        </div>

        {personName && (
          <p className="text-xs text-[var(--app-color-text-tertiary)] mb-2">
            为 <strong className="text-[var(--app-color-text-primary)]">{personName}</strong>{" "}
            设置 WxPusher 用户 UID
          </p>
        )}

        {/* Steps */}
        <div className="mt-3 space-y-3">
          {/* Step 1 hint */}
          <div className="flex items-start gap-2">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--app-color-accent)] text-[11px] font-bold text-white mt-0.5">
              1
            </span>
            <div>
              <p className="text-xs font-semibold text-[var(--app-color-text-primary)]">
                关注公众号获取 UID
              </p>
              <p className="text-[11px] text-[var(--app-color-text-tertiary)] leading-relaxed">
                关注公众号 <b className="text-[var(--app-color-text-primary)]">WxPusher</b>
                （新消息服务）→ 我的 → 我的UID → 复制
              </p>
            </div>
          </div>

          {/* Step 2 hint */}
          <div className="flex items-start gap-2">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--app-color-accent)] text-[11px] font-bold text-white mt-0.5">
              2
            </span>
            <div>
              <p className="text-xs font-semibold text-[var(--app-color-text-primary)]">
                下载 App 接收推送
              </p>
              <p className="text-[11px] text-[var(--app-color-text-tertiary)] leading-relaxed">
                安装 WxPusher App 并登录同一账号，消息通过厂商推送通道送达
              </p>
            </div>
          </div>

          {/* QR codes side by side */}
          <QrPair />

          {/* UID Input */}
          <div>
            <label className="text-xs font-semibold text-[var(--app-color-text-primary)]">
              WxPusher UID
            </label>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={128}
              className="mt-1.5 w-full rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2.5 text-sm text-[var(--app-color-text-primary)] outline-none transition placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-accent)] focus:ring-2 focus:ring-[var(--app-color-accent)]/20"
              placeholder="粘贴 WxPusher UID（如 UID_xxxx）"
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim() && !saving) {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-4 py-2 text-sm font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] transition-colors"
            onClick={() => {
              setDraft("");
              onClose();
            }}
          >
            取消
          </button>
          <button
            type="button"
            disabled={!draft.trim() || saving}
            className="rounded-xl bg-[var(--app-color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            onClick={() => handleSave()}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default WxPusherBindModal;
