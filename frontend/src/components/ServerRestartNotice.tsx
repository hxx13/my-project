import { useCallback, useEffect, useRef, useState } from "react";
import { ServerRestartLoader } from "@/components/ServerRestartLoader";
import { useServerDownStore } from "@/store/useServerDownStore";
import { fetchClientVersion } from "@/api/domains/clientVersion.api";
import { Z_INDEX } from "@/constants/zIndex";

/** 第一次探测前先等一下：单次网络抖动通常不到一秒，等过了就不弹了 */
const FIRST_PROBE_DELAY_MS = 1500;
const PROBE_INTERVAL_MS = 2000;
/** 两次自动刷新之间的最短间隔 —— 防止探测端点被限流时来回刷新打转 */
const AUTORELOAD_COOLDOWN_MS = 60_000;
const RELOAD_MARK_KEY = "__server_restart_reload_at";

function canAutoReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_MARK_KEY) ?? 0);
    return Date.now() - last > AUTORELOAD_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_MARK_KEY, String(Date.now()));
  } catch {
    // 隐私模式下 sessionStorage 可能不可写：忽略，退化成「无冷却」，不影响主流程
  }
}

const CONFETTI_COLORS = ["#F59E0B", "#EF4444", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899"];

/**
 * 点「点击催促」时从按钮上撒一把彩带。
 *
 * <p>纯 DOM + Web Animations，不引三方库：40 个碎片各自飞一个抛物线，`onfinish` 自己删掉自己。
 * 挂在 body 上而不是卡片里 —— 卡片可能带 `overflow`，碎片飞出去会被裁掉。
 */
function burstConfetti(host: HTMLElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = host.getBoundingClientRect();

  for (let i = 0; i < 40; i++) {
    const size = 6 + Math.random() * 6;
    const piece = document.createElement("div");
    Object.assign(piece.style, {
      position: "fixed",
      left: `${rect.left + rect.width / 2}px`,
      top: `${rect.top + rect.height / 2}px`,
      width: `${size}px`,
      height: `${size * 1.6}px`,
      borderRadius: "1px",
      background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      pointerEvents: "none",
      zIndex: String(Z_INDEX.serverRestartNotice + 1),
    });
    document.body.appendChild(piece);

    // 上半圈随机朝向，向上飞出后回落到卡片下方
    const angle = -Math.random() * Math.PI;
    const distance = 80 + Math.random() * 150;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const spin = Math.random() * 720 - 360;

    piece
      .animate(
        [
          { transform: "translate(-50%, -50%) rotate(0deg)", opacity: 1 },
          {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${spin}deg)`,
            opacity: 1,
            offset: 0.45,
          },
          {
            transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 280}px)) rotate(${spin * 1.6}deg)`,
            opacity: 0,
          },
        ],
        { duration: 1000 + Math.random() * 500, easing: "cubic-bezier(0.15,0.6,0.35,1)" },
      )
      .addEventListener("finish", () => piece.remove());
  }
}

/**
 * 后端连不上时的**全局**提示，一个居中的弹窗。
 *
 * <p>替代原来各处冒出来的红色 toast —— 那些文案是 `Network Error` / `HTTP 502`，
 * 现场没人看得懂，只会以为是自己按错了。口径统一在 [useServerDownStore]，
 * axios / fetch SSE / socket 断开三条路都往那里报，这里只负责「长什么样」和「什么时候刷新」。
 *
 * <p>不弹的条件很关键：**先探一次再说**。请求刚失败就点亮弹窗的话，一次网络抖动
 * 也会把整屏糊住，用户正在填的表单还得重来。探测失败才点亮；点亮之后探测成功就自动刷新。
 *
 * <p>放在 App 根部，任何路由下都在。
 */
export function ServerRestartNotice() {
  const down = useServerDownStore((s) => s.down);
  const markUp = useServerDownStore((s) => s.markUp);

  /** 探测确认过连不上才点亮；在此之前“down”可能只是一次抖动 */
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const reloadingRef = useRef(false);
  const prodButtonRef = useRef<HTMLButtonElement>(null);

  const doReload = useCallback(() => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    window.location.reload();
  }, []);

  useEffect(() => {
    if (!down) {
      visibleRef.current = false;
      setVisible(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const probe = async () => {
      if (cancelled) return;
      try {
        // 只有真拿回后端的 JSON 才算活；网关代答、限流、连不上都会抛
        await fetchClientVersion("restart-probe", "probe", "web");
      } catch {
        if (cancelled) return;
        if (!visibleRef.current) {
          visibleRef.current = true;
          setVisible(true);
        }
        timer = setTimeout(probe, PROBE_INTERVAL_MS);
        return;
      }

      if (cancelled) return;
      if (!visibleRef.current) {
        // 压根没弹出来过：静默收工，不刷新页面，用户手上的活儿不受影响
        markUp();
        return;
      }
      if (canAutoReload()) {
        markReloaded();
        doReload();
      }
    };

    timer = setTimeout(probe, FIRST_PROBE_DELAY_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [down, markUp, doReload]);

  /** 催一下：先撒彩带，等它飞完再刷新，别刚撒出去页面就没了 */
  const handleProd = () => {
    if (prodButtonRef.current) burstConfetti(prodButtonRef.current);
    markReloaded();
    window.setTimeout(doReload, 900);
  };

  if (!down || !visible) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="server-restart-title"
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: Z_INDEX.serverRestartNotice }}
    >
      <div className="absolute inset-0 bg-black/55" />

      <div
        className="relative w-[420px] max-w-full rounded-2xl px-7 pt-6 pb-7 text-center"
        style={{
          background: "var(--app-color-surface-container)",
          boxShadow: [
            "0 0 0 1px var(--app-color-border-default)",
            "0 24px 64px rgba(0,0,0,0.32)",
          ].join(", "),
        }}
      >
        <div style={{ height: 202 }}>
          <div style={{ transform: "scale(0.72)", transformOrigin: "top center" }}>
            <ServerRestartLoader />
          </div>
        </div>

        <h2
          id="server-restart-title"
          className="mt-4 text-[17px] font-semibold"
          style={{ color: "var(--app-color-text-primary)" }}
        >
          服务器正在重启
        </h2>

        <p
          className="mt-2 text-[13px] leading-relaxed"
          style={{ color: "var(--app-color-text-secondary)" }}
        >
          咖啡机已经开动了，等它煮好这一杯。
          <br />
          连上之后页面会自动刷新，也可以点下面的按钮催一下。
        </p>

        <button
          ref={prodButtonRef}
          onClick={handleProd}
          className="mt-5 inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-[13px] font-semibold cursor-pointer transition-opacity duration-150 hover:opacity-90 active:scale-[0.98]"
          style={{ background: "var(--app-color-accent)", color: "#FFFFFF" }}
        >
          点击催促
        </button>
      </div>
    </div>
  );
}
