/** 手机版 — Hero Banner 轮播横幅 + 可折叠登录二维码 + 模式标识 */
import { useEffect, useState, useCallback } from "react";
import { Clock, Copy, ExternalLink, Check, ChevronDown } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  pickLoginHeroUrls,
  type LoginBranding,
} from "@/api/domains/publicSite.api";

interface HeroBannerProps {
  branding: LoginBranding | null;
  expiresAt?: string;
  wsConnected?: boolean;
  /** true = 通用模式（JWT 登录），false = 直链模式（token 直达） */
  jwtMode?: boolean;
  currentEmail?: string;
  currentSendKey?: boolean;
}

function buildLoginUrl() {
  return `${window.location.origin}/#/m/login`;
}

export default function HeroBanner({
  branding,
  expiresAt,
  wsConnected = false,
  jwtMode = true,
  currentEmail = "",
  currentSendKey = false,
}: HeroBannerProps) {
  const urls = pickLoginHeroUrls(branding, "light");
  const enabled = branding?.heroCarouselEnabled !== false && urls.length > 0;
  const [idx, setIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loginUrl = buildLoginUrl();

  useEffect(() => {
    if (!enabled || urls.length <= 1) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % urls.length),
      (branding?.intervalSec ?? 8) * 1000,
    );
    return () => clearInterval(t);
  }, [enabled, urls.length, branding?.intervalSec]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(loginUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = loginUrl;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [loginUrl]);

  const handleJump = useCallback(() => {
    window.location.hash = "#/m/login";
  }, []);

  const modeLabel = jwtMode ? "通用模式" : "直链模式";
  const modeBg = jwtMode
    ? "rgba(99,102,241,0.85)"
    : "rgba(234,179,8,0.88)";

  const pillStyle = {
    background: "rgba(0,0,0,0.32)",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.2)",
  };

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        height: 260,
        background:
          "linear-gradient(135deg, rgba(172,23,54,0.06), rgba(99,102,241,0.05), rgba(45,212,191,0.04))",
      }}
    >
      {/* 轮播背景 */}
      {enabled ? (
        <div className="absolute inset-0">
          {urls.map((url: string, i: number) => (
            <img
              key={i}
              src={url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
              style={{ opacity: i === idx ? 1 : 0 }}
            />
          ))}
          {urls.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
              {urls.map((_: string, i: number) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: i === idx ? 16 : 6,
                    height: 6,
                    background:
                      i === idx
                        ? "#fff"
                        : "rgba(255,255,255,0.45)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(160deg, rgba(172,23,54,0.08), rgba(99,102,241,0.05) 60%, rgba(45,212,191,0.04))",
          }}
        />
      )}

      {/* 右上：过期时间 */}
      {expiresAt && (
        <div
          className="absolute right-4 z-20 flex items-center gap-1 rounded-full px-2.5 py-1"
          style={pillStyle}
        >
          <Clock className="size-3" style={{ color: "rgba(255,255,255,0.9)" }} />
          <span className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>
            至 {expiresAt.slice(5, 10).replace("-", "/")}
          </span>
        </div>
      )}

      {/* 左上：模式 + 实时（始终显示）；直链模式额外可展开二维码 */}
      <div
        className="absolute left-4 z-20 flex flex-col gap-2"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        {/* 第一行：模式标签 + 实时状态（始终可见） */}
        <div className="flex items-center gap-2">
          {jwtMode ? (
            /* 通用模式：仅标签，不可点击 */
            <div
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold text-white"
              style={{
                background: modeBg,
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.25)",
              }}
            >
              {modeLabel}
            </div>
          ) : (
            /* 直链模式：可点击展开/收起 */
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white active:scale-95 transition-transform"
              style={{
                background: modeBg,
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.25)",
              }}
            >
              {modeLabel}
              <ChevronDown
                className="size-3 transition-transform duration-200"
                style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
                strokeWidth={2.5}
              />
            </button>
          )}

          {/* WebSocket 实时状态 — 始终显示 */}
          <div
            className="flex items-center gap-1 rounded-full px-2 py-1"
            style={pillStyle}
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: wsConnected ? "#4ade80" : "#f87171" }}
            />
            <span className="text-[9px] font-medium text-white/80">实时</span>
          </div>

          {/* 邮箱绑定状态 */}
          <div
            className="rounded-full px-2 py-1 text-[10px] font-semibold text-white"
            style={{
              background: currentEmail ? "rgba(16,185,129,0.65)" : "rgba(249,115,22,0.65)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            {currentEmail ? "邮箱" : "未绑"}
          </div>

          {/* 微信通知绑定状态 */}
          <div
            className="rounded-full px-2 py-1 text-[10px] font-semibold text-white"
            style={{
              background: currentSendKey ? "rgba(16,185,129,0.65)" : "rgba(249,115,22,0.65)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            {currentSendKey ? "通知" : "未通"}
          </div>
        </div>

        {/* 第二行：二维码 + 链接 + 操作（仅直链模式且展开时显示） */}
        {!jwtMode && (
          <div
            className="flex items-start gap-2.5 overflow-hidden transition-all duration-300 ease-out"
            style={{
              maxHeight: expanded ? 120 : 0,
              opacity: expanded ? 1 : 0,
              marginTop: expanded ? 0 : -4,
            }}
          >
            {/* QR 码 */}
            <div
              className="shrink-0 rounded-xl p-1.5 bg-white shadow-lg"
              style={{ width: 76, height: 76 }}
            >
              <QRCodeSVG
                value={loginUrl}
                size={64}
                level="M"
                fgColor="#1e293b"
                bgColor="#ffffff"
              />
            </div>

            {/* 链接 + 复制/跳转 */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="text-[9px] font-medium text-white/60 leading-none">
                通用模式入口
              </span>
              <div
                className="flex items-center gap-1 rounded-full px-2.5 py-1"
                style={pillStyle}
              >
                <span className="text-[10px] font-mono text-white/85 truncate max-w-[120px] select-all">
                  {loginUrl}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleCopy(); }}
                  className="shrink-0 p-0.5 rounded hover:bg-white/15 transition-colors"
                  title="复制链接"
                >
                  {copied ? (
                    <Check className="size-3 text-green-400" strokeWidth={2.5} />
                  ) : (
                    <Copy className="size-3 text-white/70" strokeWidth={1.8} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleJump(); }}
                  className="shrink-0 p-0.5 rounded hover:bg-white/15 transition-colors"
                  title="一键跳转"
                >
                  <ExternalLink className="size-3 text-white/70" strokeWidth={1.8} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
