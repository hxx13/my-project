import { useEffect, useRef, useState } from "react";
import { router } from "@/router";
import { useSocket } from "@/hooks/useSocket";
import { authStorage } from "@/features/auth/authStorage";
import { APP_BUILD_ID } from "@/config/socketUrl";

/**
 * 让当前网页标签页**可被远程控制**。
 *
 * <p>「怎么精准指定哪一台网页」的答案就在这两个键上：
 * <ul>
 *   <li>{@code sessionStorage.remote_screen_id} —— **每个标签页一个编号**。
 *       同一台电脑开两个页面就是两台，互不覆盖；刷新不变，后端重启也不变（页面没关就一直在）。</li>
 *   <li>{@code localStorage.remote_screen_label} —— 人起的名字（如「电视墙旁那台」），
 *       在小程序里改一次之后会回写到本地，以后重连都沿用。</li>
 * </ul>
 *
 * <p>用会话存储而不是本地存储，是为了**不让两个标签页互相顶掉**：本地存储会让后开的页面
 * 抢走同一个编号，结果列表里只剩一台，控制时也分不清是谁。
 */
const ID_KEY = "remote_screen_id";
const LABEL_KEY = "remote_screen_label";

let cachedScreenId = "";

/** 当前这个标签页的编号（列表里用来标「本页」） */
export function getCurrentScreenId(): string {
  if (!cachedScreenId) cachedScreenId = getScreenId();
  return cachedScreenId;
}

function getScreenId(): string {
  try {
    let v = sessionStorage.getItem(ID_KEY);
    if (!v) {
      v =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `scr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(ID_KEY, v);
    }
    return v;
  } catch {
    return `scr-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function getLabel(): string {
  try {
    return localStorage.getItem(LABEL_KEY) ?? "";
  } catch {
    return "";
  }
}

function currentRoute(): string {
  const l = router.state.location;
  return l.pathname + (l.search ?? "");
}

/** 只接受站内绝对路径 */
function safeRoute(route: unknown): string | null {
  if (typeof route !== "string") return null;
  const r = route.trim();
  if (!r.startsWith("/") || r.startsWith("//") || r.includes("://")) return null;
  return r;
}

export default function RemoteScreenAgent() {
  const socket = useSocket();
  const screenId = useRef(getCurrentScreenId());
  const reported = useRef(false);
  /** 配对码：服务端分配，显示在后台页面角落供手机上输入 */
  const [code, setCode] = useState("");
  const [path, setPath] = useState(() => router.state.location.pathname);

  useEffect(() => {
    if (!socket) return;

    const hello = () => {
      reported.current = true;
      const payload = {
        screenId: screenId.current,
        label: getLabel(),
        route: currentRoute(),
        title: document.title,
      };
      console.info("[远程屏幕] 上报", payload);
      socket.emit("SCREEN_HELLO", payload);
    };
    const reportState = () => {
      if (!reported.current || !socket.connected) return;
      socket.emit("SCREEN_STATE", {
        screenId: screenId.current,
        route: currentRoute(),
        title: document.title,
      });
    };
    const onNavigate = (payload: { route?: string }) => {
      const r = safeRoute(payload?.route);
      if (r) router.navigate(r);
    };
    /** 小程序里改了名：回写到本地，重连时沿用 */
    const onLabel = (payload: { label?: string }) => {
      if (!payload?.label) return;
      try {
        localStorage.setItem(LABEL_KEY, payload.label);
      } catch {
        /* ignore */
      }
      reportState();
    };
    /** 服务端分配的配对码 */
    const onCode = (payload: { code?: string }) => {
      if (payload?.code) {
        setCode(payload.code);
        // 诊断用：浏览器控制台执行 window.__remoteScreen 就能确认这段逻辑是否在跑
        (window as unknown as Record<string, unknown>).__remoteScreen = {
          screenId: screenId.current,
          code: payload.code,
          route: currentRoute(),
        };
      }
    };

    if (socket.connected) hello();
    socket.on("connect", hello);
    console.info("[远程屏幕] agent 就绪", screenId.current, "connected=", socket.connected);

    /**
     * 兜底：共享 socket 是在**模块加载那一刻**建的，那时如果登录态还没就绪，
     * 握手查询串里会是空 token，之后一直 401、`connect` 事件永远不来（配对码就收不到）。
     * 挂载时把当前 token 补进重连参数并主动连一次；已连上则什么都不做。
     */
    if (!socket.connected) {
      const token = authStorage.getToken();
      if (token) {
        (socket as unknown as { io: { opts: { query: Record<string, string> } } }).io.opts.query = {
          token,
          v: APP_BUILD_ID,
        };
        socket.connect();
      }
    }
    socket.on("SCREEN_NAVIGATE", onNavigate);
    socket.on("SCREEN_LABEL", onLabel);
    socket.on("SCREEN_CODE", onCode);
    const unsubscribe = router.subscribe(() => {
      setPath(router.state.location.pathname);
      reportState();
    });

    return () => {
      reported.current = false;
      socket.off("connect", hello);
      socket.off("SCREEN_NAVIGATE", onNavigate);
      socket.off("SCREEN_LABEL", onLabel);
      socket.off("SCREEN_CODE", onCode);
      unsubscribe();
    };
  }, [socket]);

  // 配对码只在**视频上墙页**显示（那是配对的入口页），放右下角。
  // 别处不显示，免得每个后台页面角落都挂一个。
  const showCode = code && path.startsWith("/console/admin/video-wall");
  if (!showCode) {
    return null;
  }
  return (
    <div
      className="fixed bottom-3 right-3 z-[9500] rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white/90 shadow-lg"
      title="在小程序「远程屏幕」或参观模式的「控制网页」里输入这个码即可控制本页面"
    >
      配对码 <b className="ml-1 font-mono text-sm tracking-[0.2em] text-white">{code}</b>
    </div>
  );
}
