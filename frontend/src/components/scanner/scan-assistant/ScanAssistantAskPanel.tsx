import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { CreditCard, Download, FileSpreadsheet, History, ImagePlus, Maximize2, Minimize2, Paperclip, SendHorizonal, Square, SquarePen, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { BubblePlacement } from "./computeBubblePlacement";
import { ScanAssistantChatCard } from "./ScanAssistantChatCard";
import { ScanAssistantPegtopLoader } from "./ScanAssistantPegtopLoader";
import { ChatMarkdownBody } from "@/components/markdown/ChatMarkdownBody";
import {
  archiveExportContent,
  deleteAssistantSession,
  fetchAssistantSessionMessages,
  fetchAssistantSessions,
  fetchExportBlob,
  fetchExportByUrl,
  fetchSessionExports,
  streamScanAssistantAsk,
  streamAiInteraction,
  streamScanAssistantGreet,
  type AssistantExportArtifact,
  type AssistantSession,
  type ScanAssistantUsage,
} from "@/api/domains/scanAssistant.api";
import { usePrefersReducedMotion, useTypewriterText } from "@/hooks/useTypewriterText";
import { cancelAiTimer, confirmAiTimer, fetchAiTimers } from "@/api/domains/aiTimer.api";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import {
  exportMaterialAuditSummary, exportMaterialAuditTrail,
  exportMaterialItemFlowSummary, exportMaterialItemFlow,
} from "@/api/domains/material.api";
import { loadConfig, saveConfig, toQuery } from "@/features/export-config/subtotalConfig";
import { downloadBlob } from "@/api/domains/cardPrint.api";
import { authStorage } from "@/features/auth/authStorage";
import { getLastAckBootId } from "@/config/socketUrl";
import {
  downloadAdminFileTemplateBlob,
  fetchAdminFileTemplates,
  type AdminFileTemplateRow,
} from "@/api/domains/fileTemplates.api";

/**
 * 球球对话缓存的 key 前缀。
 *
 * <p>**必须按账号分开**：localStorage 按源共享，教职工端、移动端 H5 是同一个源。
 * key 不绑账号时，同一台机器上换个账号登录，面板会把上一个人的对话从缓存里读出来显示 ——
 * 真机确认过：单一 key 里存着 44 条别人的问答，blob 里连用户标识都没有。
 */
const CACHE_KEY_PREFIX = "scan-assistant-ask-cache";

/**
 * 缓存放 **sessionStorage**：按标签隔离。
 *
 * <p>用 localStorage 时同一账号开两个页面就共用一份 —— 一个页面切了历史会话，另一个刷新后
 * 会续成前者的会话（真机观测到同账号同时段两条会话并行）。缺点是新标签页里对话不再延续显示；
 * 相比"切了会话却发现消息发去了别处"，这个代价更小。
 */
const askStore = typeof window === "undefined" ? null : window.sessionStorage;

/** 读缓存（sessionStorage 不可用时退化成"没有缓存"，不影响主流程） */
function readAskCache(key: string): string | null {
  try {
    return askStore ? askStore.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeAskCache(key: string, value: string): void {
  try {
    askStore?.setItem(key, value);
  } catch {
    /* 容量/隐私模式：写不进去就当没有缓存 */
  }
}

function dropAskCache(key: string): void {
  try {
    askStore?.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** 当前账号的缓存 key；没登录时退到一个不落地的占位（不会和任何真实账号撞上） */
function currentCacheKey(): string {
  return `${CACHE_KEY_PREFIX}:${authStorage.getUserId() ?? "anon"}`;
}

/**
 * 清掉**别的账号**留在这个浏览器里的球球缓存。
 *
 * <p>按账号分 key 之后已经读不错了，但上一个人那份还会留在 localStorage 里 ——
 * 同机器换人用时随手一个 devtools 就能翻到别人的对话。真正的历史在服务端（历史对话随时能翻），
 * 本地这份副本没有留的必要。顺带清掉旧的**不分账号**的那个 key。
 */
function purgeForeignAskCaches(): void {
  try {
    const keep = currentCacheKey();
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if ((key === CACHE_KEY_PREFIX || key.startsWith(`${CACHE_KEY_PREFIX}:`)) && key !== keep) {
        dropAskCache(key);
      }
    }
  } catch {
    /* ignore */
  }
}
/** 待发图片张数上限，防止缩略图条把卡片顶出屏幕 */
const MAX_ATTACHMENTS = 6;
/**
 * 表格 / 文本类附件的扩展名。拖拽或点选时**按扩展名自动分流** ——
 * 拖进来的时候用户不会先声明「这是表格」，识别得由我们做。
 */
const ATTACH_FILE_EXTS = [".xlsx", ".xls", ".md", ".markdown", ".txt", ".pdf", ".docx"];
/** 单份文件上限：base64 后还会涨三分之一，太大就别让它进请求（服务端也会拒）。 */
const MAX_ATTACH_FILE_BYTES = 8 * 1024 * 1024;
/**
 * 展开的两档宽度 = min(最大宽, 100vw - 视口内缩)。
 *
 * <p>**与 scanAssistantDock.css 的 `--expanded` / `--expanded-2` 同源，改要一起改** ——
 * 这里算的是展开/收起动画的起止点，只改一边动画就会飞偏。
 * 一级 = 原来那个大窗；二级 = 再放大一档（数据类回答、宽表格用得上）。
 */
const ZOOM_LEVELS = { 1: { maxWidth: 960, inset: 64 }, 2: { maxWidth: 1440, inset: 48 } } as const;
const popupWidthFor = (level: 1 | 2) =>
  Math.min(ZOOM_LEVELS[level].maxWidth, window.innerWidth - ZOOM_LEVELS[level].inset);

/** 一次提问的用量（跨轮累加）。latencyMs 是服务端实测耗时；前端计时另有 liveMs。 */
type AskMeta = {
  latencyMs: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  turns: number;
};
/** 助手抛回来让用户点选的候选（如「该人的可选房间」）。选项是对话的一部分，跟着回合一起存。 */
type AskChoice = { label: string; value: string };
/**
 * 一道待答的选择题。一次请求可能带回**好几道**（批量清单里张皓瀚缺房间、林安顺缺时长），
 * 载体按顺序依次问，答完最后一道再把所有答案合成一条消息发出去。
 *
 * `kind === "confirm"` 时是**写操作的确认**：答案不能当新消息发出去，必须带着 token
 * 回到服务端那条挂起记录上（见 submitInteraction）。
 */
/** 助手交下来的「导什么」：面板按它去调导出接口（kind=materialAudit 走申领审计那套）。 */
type AssistantDownload = {
  kind: string;
  label?: string;
  params?: Record<string, unknown>;
  /** 服务端那条导出的档案号：下载完把字节交回它归档，历史里再下就与当时一模一样 */
  exportId?: number;
};

/**
 * 挂在某一轮下面的导出卡片。
 *
 * `key` 同时当渲染 key 与「正在下载」的记账键 —— 产物落库失败时没有 exportId，
 * 但它仍然得有一张能点的卡片（走「用参数重跑」那条老路）。
 */
type TurnExport = {
  key: string;
  kind: string;
  label?: string;
  params?: Record<string, unknown>;
  exportId?: number;
  /**
   * 截图专用：截出来的图的 blob 地址（`kind === "screenshot"` 时才有）。
   * 历史里靠产物字节重建，实时那次靠当场截。
   */
  imageUrl?: string;
  /** 截图状态：正在截/取字节、好了、或失败。失败时卡片要给个「重截」的口子。 */
  imageState?: "loading" | "ready" | "failed";
  /** 截图要跳的那一页（只有实时那条有；历史看 byte 就够了）。 */
  path?: string;
};

/** 产物参数里记的那一页（截图专用：历史里那张卡还能「重截一张」）。 */
function shotPathOf(params?: Record<string, unknown>): string | undefined {
  const p = params?.path;
  return typeof p === "string" && p ? p : undefined;
}

/** 等页面画稳。 */
async function waitForPagePainted(): Promise<void> {
  try {
    await document.fonts?.ready;
  } catch {
    /* 老内核没有 fonts.ready，忽略 */
  }
  // ponytail: 固定等待 + 两帧。等不到异步数据就会截到骨架；要更准得让页面自己暴露「忙不忙」
  // （比如 loading 计数或调接口前后的信号），那要改一处公共壳层，先不做。
  await new Promise((r) => setTimeout(r, 1200));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/**
 * 把当前应用外壳截成一张图。
 *
 * 截 `#root` 而**不是** `body` —— 球球面板是 `createPortal` 到 body 下的兄弟节点，
 * 截 #root 它就天然不在画面里，不需要另做「截图时先把自己藏起来」那套开关。
 *
 * <p>用 html-to-image（SVG foreignObject）而不是 html2canvas：后者自己在 JS 里解析 CSS，
 * 认不得 `oklch()` / `color-mix()` 这类现代颜色函数，遇到就直接抛
 * 「Attempting to parse an unsupported color function "oklch"」（本仓库主题正好在用，实测踩到）。
 * 交给浏览器自己渲染就没这个问题 —— 浏览器认得什么样，截出来就是什么样，正是「看样式」要的。
 */
async function captureAppRoot(): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  const node = document.getElementById("root");
  if (!node) {
    throw new Error("找不到应用根节点");
  }
  const blob = await toBlob(node, {
    backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    /*
     * 跨域图片必须跳过：html-to-image 要把每张图**内联成 data URL** 才能放进 SVG，
     * 而跨域图没带 CORS 头时这一步直接失败 —— 症状是抛出**一个 Event 而不是 Error**
     * （`[object Event]`，isTrusted），完全看不出原因。本仓库页脚那张学校站点的 logo 就是。
     * 跳过它等于画面上少一张图，比整张截图失败强。
     *
     * ponytail: 跳过 = 该处留白。要保留就得让那些资源带 CORS 头或走同源代理，先不做。
     */
    filter: (n) => {
      if (n.tagName !== "IMG") {
        return true;
      }
      const src = (n as HTMLImageElement).src;
      if (!src) {
        return true;
      }
      try {
        return new URL(src, location.origin).origin === location.origin;
      } catch {
        return false;
      }
    },
  });
  if (!blob) {
    throw new Error("出图失败");
  }
  return blob;
}

type AskQuestion = {
  question: string;
  options: AskChoice[];
  token?: string;
  kind?: string;
  /** 多选题（配置类问题）：勾完按「确认」一次性提交，而不是点一个就完事 */
  multiSelect?: boolean;
};
type AskTurn = {
  role: "user" | "assistant";
  text: string;
  typed: boolean;
  meta?: AskMeta;
  choiceQueue?: AskQuestion[];
  /**
   * 这一轮**带出去的**附件。发完就把待发托盘清空了，若不记在这里，历史里只剩一句「（见附件）」——
   * 用户回头看根本想不起发的是什么。图片带 `url`（blob 预览）就能显示缩略图；刷新后 blob 失效，
   * 退化成图标 + 名字（名字在缓存里，`url` 不进缓存 —— 那是个一次性地址）。
   */
  attachments?: { name: string; kind: "image" | "file"; url?: string }[];
  /**
   * 这一轮**产出的导出文件**。
   *
   * 挂在轮上而不是单独一栏：卡片要回到它当年出现的位置，用户往上翻才认得出「这份是哪次导的」。
   * 渲染时塞进气泡那一列，跟用户侧的附件同一个排法 —— 它是这条消息的一部分，不是浮在旁边的。
   */
  exports?: TurnExport[];
  /**
   * 这一轮**正在跑的长任务**（截图、设定时…）。
   *
   * <p>没有它，用户看不出是在跑还是已经黄了 —— 只会干等（真机反馈过：截图其实早失败了，
   * 而正文里模型那句「马上到」还挂着）。失败要**留着**，那正是用户需要看见的信息。
   */
  toolBusy?: { label: string; status: "running" | "failed" };
  /** 这一轮挂着的倒计时（AI 定时器），同附件一样贴在气泡下 */
  timers?: TurnTimer[];
  /**
   * 这一轮是**定时器跑完补拉进来的汇报**（不是对话里当场说出来的）。
   *
   * <p>倒计时兜底找落点时要**跳过**它：定时器带的是「工具调用那条消息」的 id，
   * 与当场那条回复的 id 对不上，兜底会落到"最后一条助手消息"—— 而汇报恰好就是最后一条，
   * 于是卡片挂到了汇报下面（真机反馈："应在第一个气泡下，不是等待回复的气泡"）。
   */
  fromTimer?: boolean;
  /**
   * 这一轮就是用户点的那一下「确认执行」（**不是新的一次提问**）。
   *
   * <p>收尾时要把"它之前的、同一次提问产出的附件"都收到最后这条回复上 ——
   * 否则一次提问里有挂起时，图/文件/倒计时会各落一条气泡（真机反馈：三件分了家）。
   */
  isConfirmAnswer?: boolean;
  /**
   * 这一轮助手消息在服务端的 id。
   *
   * 倒计时/产物**按它挂回原位** —— 历史回放时尤其要紧：没有它就全都堆到最后一条上。
   */
  messageId?: number;
};

/**
 * 挂在某一轮下面的**倒计时**（AI 定时器）。
 *
 * <p>和附件一样贴在气泡下 —— 它是「这一轮答应过要做的事」，用户得能看见还要等多久、
 * 还能不能撤、最后到底办成没有。
 */
type TurnTimer = {
  id: number;
  label: string;
  /** 到点的**绝对毫秒**（服务端基准）。本地算显示要补时钟差，见 clockSkewMs。 */
  fireAtMillis: number;
  status: string;
  statusZh: string;
  /** 服务端可能回 boolean 也可能回 0/1（tinyint），两种都收 */
  ok?: boolean | number | null;
  result?: string;
  error?: string;
};

/** 还在跑的状态（要每秒走倒计时、到点要补拉一次结果）。 */
const TIMER_LIVE_STATUSES = new Set(["PENDING", "FIRING", "AWAITING_CONFIRM"]);

/**
 * 哪些工具值得在对话里露出「正在做…」。
 *
 * <p>**只登记长任务**：这类要等好几秒、还可能失败，用户需要知道进度。
 * 其余工具都是毫秒级的读，抖出来只会让每条回答下面都堆一行噪声。
 */
const TOOL_BUSY_LABEL: Record<string, string> = {
  screenshotPage: "正在截图",
  scheduleTimers: "正在设定时",
};

/** 毫秒 → 「12.4s」，超过 60s 显示「1 分 15 秒」 */
function fmtSec(ms: number): string {
  if (!ms || ms < 0) return "0.0s";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)} 分 ${total % 60} 秒`;
}

/** 附件大小：只给人一个「这份多大」的直觉，精确到 KB 就够 */
function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * 一份导出文件的下载卡。**实时对话与历史回放共用同一个** —— 不另做一套历史样式。
 *
 * 两种形态是为了让用户一眼分清「文件的来路」：
 * - **独立成条**（`sub` 不传）：文件就是这条消息本身，用**完整卡片**（图标块 + 文件名 + 下载按钮）；
 * - **跟着某句回答**（`sub`）：它只是那句话的附属物，**压成小小一行**并与气泡齐头，不抢正文版面。
 */
function DownloadCard({
  label,
  busy,
  sub,
  onDownload,
}: {
  label?: string;
  busy: boolean;
  sub?: boolean;
  onDownload: () => void;
}) {
  return (
    <div className={`scan-assistant-ask__download${sub ? " scan-assistant-ask__download--sub" : ""}`}>
      <span className="scan-assistant-ask__download-icon" aria-hidden>
        <FileSpreadsheet strokeWidth={2} />
      </span>
      <span className="scan-assistant-ask__download-name" title={label}>
        {label ?? "导出文件"}
      </span>
      <button
        type="button"
        className="scan-assistant-ask__download-btn"
        disabled={busy}
        onClick={onDownload}
      >
        <Download strokeWidth={2.5} aria-hidden />
        {busy ? "导出中…" : "下载"}
      </button>
    </div>
  );
}

/**
 * 截图卡：把截到的那一页铺在对话里。
 *
 * 正在截时给个占位（这一趟要跳页 + 等渲染，得几秒）；失败给「重截一张」——
 * 历史里那张图的字节可能当年就没归档上（截完就关了页面），那时不能只剩一个转圈。
 */
function ShotCard({ shot, sub, onRetake, onZoom }: {
  shot: TurnExport;
  sub?: boolean;
  onRetake: () => void;
  onZoom: (url: string, label: string) => void;
}) {
  const label = shot.label || "页面截图";
  if (shot.imageState === "ready" && shot.imageUrl) {
    return (
      <figure className={`scan-assistant-ask__shot${sub ? " scan-assistant-ask__shot--sub" : ""}`}>
        <img
          className="scan-assistant-ask__shot-img"
          src={shot.imageUrl}
          alt={label}
          onClick={() => onZoom(shot.imageUrl as string, label)}
        />
        {shot.path ? (
          <button type="button" className="scan-assistant-ask__shot-retake" onClick={onRetake}>
            重截一张
          </button>
        ) : null}
      </figure>
    );
  }
  if (shot.imageState === "failed") {
    return (
      <div className="scan-assistant-ask__shot scan-assistant-ask__shot--failed">
        <span className="scan-assistant-ask__shot-tip">{label}没截成</span>
        {shot.path ? (
          <button type="button" className="scan-assistant-ask__download-btn" onClick={onRetake}>
            <ImagePlus strokeWidth={2.5} aria-hidden />
            重截一张
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="scan-assistant-ask__shot scan-assistant-ask__shot--loading">
      <span className="scan-assistant-ask__shot-tip">正在截「{label}」…</span>
    </div>
  );
}

/**
 * 这一轮**会不会被渲染出来**。
 *
 * <p>判据必须与渲染处那条 `return null` **逐字一致** —— 挂起那一轮正文为空、只剩待答选项，
 * 渲染处**故意不画它**（选项卡片另处渲染）。倒计时/产物若挂到这种轮上就永远看不见，
 * 而服务端存的锚恰好就是那条带工具调用的消息（真机排查很久才定位到这个）。
 */
function isRenderableTurn(t: AskTurn): boolean {
  if (t.role !== "assistant") return true;
  if (t.text.trim().length > 0) return true;
  if ((t.exports?.length ?? 0) > 0) return true;
  return (t.choiceQueue?.length ?? 0) === 0;
}

/** 剩余时间 mm:ss（超过一小时给 h:mm:ss）。 */
function fmtRemain(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * 倒计时卡：像附件一样挂在气泡下面。
 *
 * <p>它回答用户三个问题：**还要等多久**（实时跳秒）、**能不能撤**（停止）、
 * **最后到底办成没有**（已执行 / 失败 + 原因）。少任何一个都会变成「设了之后心里没底」。
 */
function TimerChip({ timer, nowMs, clockSkewMs, onStop, onConfirm }: {
  timer: TurnTimer;
  nowMs: number;
  clockSkewMs: number;
  onStop: () => void;
  onConfirm: () => void;
}) {
  const live = TIMER_LIVE_STATUSES.has(timer.status);
  /** 到点了但**在等用户点头**（写操作不能自己动手）。这不是「正在执行」，别混为一谈。 */
  const awaiting = timer.status === "AWAITING_CONFIRM";
  const remainMs = timer.fireAtMillis - (nowMs - clockSkewMs);
  const failed = timer.status === "FAILED" || timer.ok === false || timer.ok === 0;
  // 结束态要**直接说成功还是失败**：光一个「已完成」等于没说（用户问的就是这个）
  const done = timer.status === "FIRED"
    ? (failed ? " · 失败" : " · 成功")
    : "";
  const text = awaiting
    ? "等待你确认"
    : live
      ? remainMs > 0
        ? `还剩 ${fmtRemain(remainMs)}`
        : "正在执行…"
      : `${timer.statusZh}${done}${timer.error ? `：${timer.error}` : ""}`;
  return (
    <div className={`scan-assistant-ask__timer${failed ? " scan-assistant-ask__timer--failed" : ""}`}>
      <span className="scan-assistant-ask__timer-ico" aria-hidden>
        ⏱
      </span>
      <span className="scan-assistant-ask__timer-label" title={timer.label}>
        {timer.label}
      </span>
      <span className="scan-assistant-ask__timer-remain">{text}</span>
      {awaiting ? (
        <button type="button" className="scan-assistant-ask__timer-confirm" onClick={onConfirm}>
          确认执行
        </button>
      ) : null}
      {live ? (
        <button type="button" className="scan-assistant-ask__timer-stop" onClick={onStop}>
          停止
        </button>
      ) : null}
    </div>
  );
}

function loadCachedTurns(): AskTurn[] {  try {
    const key = currentCacheKey();
    const raw = readAskCache(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { ts?: number; turns?: unknown };
    if (!Array.isArray(parsed.turns)) return [];
    return parsed.turns
      .map<AskTurn>((t: any) => ({
        role: t?.role === "user" ? "user" : "assistant",
        text: String(t?.text ?? ""),
        typed: true, // 恢复的历史一律视为已打完，不重新打字
        meta: t?.meta && typeof t.meta.totalTokens === "number" ? (t.meta as AskMeta) : undefined,
        // **锚点必须一起恢复**：倒计时/产物"挂回原位"全靠它。缓存里存了、这里不读，
        // 结果就是每次恢复后所有轮都没有 id，锚点永远对不上、只能兜底（真机踩到过）。
        messageId: typeof t?.messageId === "number" ? (t.messageId as number) : undefined,
        choiceQueue: Array.isArray(t?.choiceQueue)
          ? (t.choiceQueue as unknown[])
              .map((q) => {
                const item = q as { question?: unknown; options?: unknown; token?: unknown; kind?: unknown };
                return {
                  question: String(item?.question ?? ""),
                  options: Array.isArray(item?.options)
                    ? (item.options as unknown[])
                        .map((c) => c as { label?: unknown; value?: unknown })
                        .filter((c) => c && c.label != null && c.value != null)
                        .map((c) => ({ label: String(c.label), value: String(c.value) }))
                    : [],
                  token: item?.token == null ? undefined : String(item.token),
                  kind: item?.kind == null ? undefined : String(item.kind),
                };
              })
              .filter((q) => q.options.length > 0)
          : undefined,
        // 附件记名字与类型即可；`url` 是 blob 地址，刷新后必然失效，不进缓存（渲染时退化成图标+名字）
        attachments: Array.isArray(t?.attachments)
          ? (t.attachments as unknown[])
              .map((x) => x as { name?: unknown; kind?: unknown })
              .filter((x) => x && x.name != null)
              .map((x) => ({
                name: String(x.name),
                kind: x.kind === "image" ? ("image" as const) : ("file" as const),
              }))
          : undefined,
        /*
         * 产物卡**必须跟着缓存回来**，否则重开面板它们就凭空消失（真机反馈过：图全没了）。
         * 但**只记产物号、不记 blob 地址** —— blob 是这一页的临时地址，刷新后必然失效。
         * 截图的字节随后按 exportId 重取（见下面那个挂载 effect）。
         */
        exports: Array.isArray(t?.exports)
          ? (t.exports as unknown[])
              .map((x) => x as {
                key?: unknown; kind?: unknown; label?: unknown;
                params?: unknown; exportId?: unknown; path?: unknown;
              })
              .filter((x) => x && typeof x.kind === "string")
              .map((x) => ({
                key: String(x.key ?? `h${String(x.exportId)}`),
                kind: String(x.kind),
                label: x.label == null ? undefined : String(x.label),
                params: (x.params as Record<string, unknown> | undefined) ?? undefined,
                exportId: typeof x.exportId === "number" ? x.exportId : undefined,
                path: x.path == null ? undefined : String(x.path),
                ...(x.kind === "screenshot" ? { imageState: "loading" as const } : {}),
              }))
          : undefined,
      }))
      // 丢弃空回合：中断流式/问好中途缓存，避免空白气泡卡死并挡住重新问好 ——
      // 但**挂了卡片的要留**（模型只调工具、一个字都没说的那轮就是这种）
      .filter((t) => t.text.trim().length > 0 || (t.exports?.length ?? 0) > 0);
  } catch {
    return [];
  }
}

/**
 * 刷新后要恢复的待答问题：只认最后一条助手回合。
 * 更早的提问早就被回答过了，再把它的选项亮出来等于在问一个已经结束的问题。
 */
function pendingQueueOf(turns: AskTurn[]): AskQuestion[] {
  const last = turns[turns.length - 1];
  return last && last.role === "assistant" && last.choiceQueue ? last.choiceQueue : [];
}

/**
 * 多问时把所有答案合成一条消息：每行「<题目标题>：<答案>」，模型据此逐条对应。
 * 只有一问时原样回那个值 —— 上下文已经说明了在问什么，不必加壳。
 */
function composeAnswers(questions: AskQuestion[], answers: string[]): string {
  if (questions.length <= 1) {
    return answers[0] ?? "";
  }
  return questions
    .map((q, i) => `${q.question || `第 ${i + 1} 问`}：${answers[i] ?? ""}`)
    .join("\n");
}

/**
 * 把选项**值**换回人看的**标签**。
 *
 * 值可以是不该露面的内部标识（审核类候选的 value 就是单据 id），直接铺进用户气泡会变成
 * 一串 `MR17858187453770426`；发给模型的仍是值本身，只是气泡上显示标签。
 * 找不到对应选项（自定义回答）就原样回值。
 */
function labelsOf(questions: AskQuestion[], values: string[]): string[] {
  return questions.map((q, i) => {
    const v = values[i] ?? "";
    return q.options.find((o) => o.value === v)?.label ?? v;
  });
}

/** 同一份缓存里读「当前会话 id」：切到历史对话后刷新页面，下一条还得接在那条会话上 */
function loadCachedSessionId(): number | null {
  try {
    const raw = readAskCache(currentCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts?: number; sessionId?: unknown };
    const id = Number(parsed.sessionId);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function saveCachedTurns(turns: AskTurn[], sessionId: number | null) {
  try {
    writeAskCache(currentCacheKey(), JSON.stringify({ ts: Date.now(), turns, sessionId }));
  } catch {
    /* ignore quota / private mode */
  }
}

/** 历史列表里的时间：只到分钟，今天的不带日期 */
function fmtSessionTime(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(String(iso).replace(" ", "T"));
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const now = new Date();
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === now.toDateString()
    ? hhmm
    : `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hhmm}`;
}

/** 助手气泡：最新一条回答逐字打出；打完后标记 typed 避免重复打字 */
function AssistantBubble({
  text,
  type,
  onTyped,
  meta,
  live,
  children,
}: {
  text: string;
  type: boolean;
  onTyped?: () => void;
  /** 落定后的用量（跨轮累加） */
  meta?: AskMeta;
  /** 正在生成时的实时态：本地计时 + 每轮推来的 token */
  live?: AskMeta;
  /**
   * 挂在这条消息下面的东西（目前是导出卡片）。
   *
   * **放在气泡这一列里**，与用户侧「气泡 + 附件」同一套排法 —— 卡片要看起来
   * 属于这条消息，用户往上翻时才认得出「那份文件是哪句话给我的」。
   */
  children?: ReactNode;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const { displayed, done } = useTypewriterText(text, {
    cps: 40,
    enabled: type && !reducedMotion,
  });

  useEffect(() => {
    if (done && type) onTyped?.();
  }, [done, type, onTyped]);

  const shown: AskMeta | undefined = meta ?? live;
  const metaNode = shown ? (
    <div className="scan-assistant-ask__meta" aria-live="off">
      <span>{meta ? "用时" : "思考中"} {fmtSec(shown.latencyMs)}</span>
      {shown.totalTokens > 0 ? (
        <span>
          · {shown.totalTokens.toLocaleString()} tokens
          <span className="scan-assistant-ask__meta-sub">
            （↑{shown.promptTokens.toLocaleString()} ↓{shown.completionTokens.toLocaleString()}）
          </span>
        </span>
      ) : null}
      {shown.turns > 1 ? <span>· {shown.turns} 轮</span> : null}
    </div>
  ) : null;

  const hasText = text.trim().length > 0;
  // 有没有「气泡行」：有正文、或正在生成时才有。没话说、只给了文件的那一轮不该留空气泡。
  const hasBubbleRow = hasText || type;

  return (
    <div className="scan-assistant-ask__answer">
      {hasBubbleRow ? (
        <div className="scan-assistant-ask__answer-row">
          <ScanAssistantPegtopLoader animated={type && !done} />
          <div className="scan-assistant-ask__bubble scan-assistant-ask__bubble--assistant">
            {type && !text ? (
              "正在思考…"
            ) : (
              // 模型很爱写 `**加粗**` 和 `- 列表`：纯文本渲染会把星号和短横线原样显示出来。
              // 打字期间仍走纯文本（半截 markdown 会解析成乱七八糟的结构），打完再转。
              <ChatMarkdownBody text={displayed} streaming={type && !done} />
            )}
          </div>
        </div>
      ) : null}
      {children
        ? hasBubbleRow
          ? children
          : (
              /*
               * 模型一个字都没说、只产出了文件：**照样给它配一列头像**。
               * 少了这一列，它就成了一个没有起头的小挂件，和上面那些有头像的消息不在一个体系里
               * （用户反馈「独立输出的文件前方没有图标」）。
               */
              <div className="scan-assistant-ask__answer-row">
                <ScanAssistantPegtopLoader animated={false} />
                <div className="scan-assistant-ask__download-stack">{children}</div>
              </div>
            )
        : null}
      {metaNode}
    </div>
  );
}

type ScanAssistantAskPanelProps = {
  /** 需要读 .current 量展开前的小卡位置（FLIP 动画起点） */
  anchorRef?: RefObject<HTMLDivElement | null>;
  placement: BubblePlacement;
  positionStyle: CSSProperties;
  onDismiss: () => void;
  /** 「新建对话」入口。行为由载体接入（清空会话 / 开新会话），这里只提供按钮 */
  onNewChat?: () => void;
  /** 「历史对话」入口。行为由载体接入（展开侧栏选历史会话），这里只提供按钮 */
  onOpenHistory?: () => void;
  /**
   * 载体的**即时播报**（刷卡后的欢迎语、提醒等）。
   *
   * <p>全站只有这一张卡：播报铺在这张卡的对话末尾，输入框就在它下面 —— 用户听完能直接接着问，
   * 不用先收起再点开（原来播报走的是另一张没有输入框的小卡）。
   * 只渲染、不进 `turns` 状态：它是载体推来的内容，不是这轮会话自己的回合。
   */
  incoming?: {
    key: string | number;
    text: string;
    isStreaming: boolean;
    isAwaitingFirstToken: boolean;
    isTyping: boolean;
    /** 这次刷的人没绑卡 → 在播报下面出一个**可点**的「绑定校园卡」入口 */
    unboundCard?: boolean;
    /** 被刷的人（点入口时要用它定位绑谁） */
    personKey?: string;
  } | null;
  /** 点「绑定校园卡」时调它（载体接那根线，见 scanAssistantSpeak 的注册回调） */
  onUnboundBind?: (userId: string) => void;
};

export function ScanAssistantAskPanel({
  anchorRef,
  placement,
  positionStyle,
  onDismiss,
  onNewChat,
  onOpenHistory,
  incoming,
  onUnboundBind,
}: ScanAssistantAskPanelProps) {
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<AskTurn[]>(loadCachedTurns);
  const [sending, setSending] = useState(false);
  /**
   * 连点闸门。**必须是 ref 而不是只看 sending**：setSending 是异步的，两次快速点击
   * 都能在 state 落地前通过判空，于是一次「确认执行」发两遍续跑（第二遍被服务端判「已处理过」，
   * 弹个莫名错误），一次澄清答案发两条消息（模型看到重复回答）。
   */
  const sendingRef = useRef(false);

  /**
   * 载体的即时播报，作为**最新一条助手消息**铺在对话末尾。
   *
   * <p>只参与渲染，不进 `turns` 状态：它是载体推来的（刷卡欢迎语等），不是这轮会话自己的回合；
   * 混进状态会在「保存到缓存 / 续跑挂起」那条路上被当成真实历史。
   */
  const incomingTurn: AskTurn | null = incoming
    ? {
        role: "assistant",
        text:
          incoming.text.trim().length > 0
            ? incoming.text
            : incoming.isAwaitingFirstToken
              ? "思考中…"
              : "",
        typed: true,
      }
    : null;
  /**
   * 播报视图：刷卡那一刻的对话**每次从零开始** —— 不把上一次的对话接着摞上来给用户看。
   * 播报本身也不落库、不进历史（它只是载体推来的一条展示内容）。
   *
   * <p>`broadcastConsumed` = 用户已经在这张卡里说话了：这时视图交还给对话（播报当开场白留在最上面），
   * 否则**他自己问的那句和回答都会被播报挡住**（真机踩到过）。
   */
  const broadcastMode = incomingTurn != null;
  const [broadcastConsumed, setBroadcastConsumed] = useState(false);
  const displayTurns =
    broadcastMode && !broadcastConsumed ? [incomingTurn] : broadcastMode ? [incomingTurn, ...turns] : turns;
  const incomingIndex = broadcastMode ? 0 : -1;

  // 新的一次播报 = 新的一段对话：下一次提问从零开始，不接上一段会话的上下文
  const lastBroadcastKeyRef = useRef<string | number | null>(null);
  const [unboundBindClicked, setUnboundBindClicked] = useState(false);
  useEffect(() => {
    if (!incoming) return;
    if (lastBroadcastKeyRef.current === incoming.key) return;
    lastBroadcastKeyRef.current = incoming.key;
    setUnboundBindClicked(false);
    setBroadcastConsumed(false);
    sessionIdRef.current = null;
    newSessionRef.current = true;
  }, [incoming]);
  const beginSend = () => {
    if (sendingRef.current) return false;
    sendingRef.current = true;
    setSending(true);
    return true;
  };
  const endSend = () => {
    sendingRef.current = false;
    setSending(false);
  };

  /**
   * 正在跑的那一轮的中止柄（空 = 没在跑）。「停止生成」与「新一轮顶掉旧一轮」都靠它。
   *
   * <p>为什么要有它而不是只有一个 sending 标志：中止是**异步收尾**的 —— 被中止那轮的 finally
   * 会在新一轮已经开始之后才跑到。那时若无条件 endSend()，就会把新一轮的发送态清掉，
   * 于是「停止」按钮消失、还能再发一条（连发）。所以收尾前先比对「还是不是当前这一轮」。
   */
  const runRef = useRef<AbortController | null>(null);

  /**
   * 停止生成。只断客户端的流：不再收后续 delta，气泡停止打字，按钮立刻回到「发送」。
   *
   * <p>注意服务端那一轮**不会因此中止**（编排层没有取消令牌），它会把结果写完并落库；
   * 也就是说停掉之后，这一轮的答复仍可能出现在刷新后的历史里。
   */
  const stopReply = () => {
    const ctrl = runRef.current;
    runRef.current = null;
    ctrl?.abort();
    endSend();
  };

  /**
   * 被停止之后的收尾：把已经吐出来的部分**定稿**，一个字都没有就注明已停止。
   *
   * <p>不做这一步，中止那一轮的气泡会永远停在「正在思考…」——中止走的是 catch 分支，
   * 而正文只在 onDone/onError 里落地。
   */
  const settleStopped = (partial: string) => {
    setTurns((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      if (last && last.role === "assistant" && !last.text) {
        next[next.length - 1] = {
          role: "assistant",
          text: partial || "（已停止生成）",
          typed: true,
        };
      }
      return next;
    });
  };
  const [liveMs, setLiveMs] = useState(0);
  const [usage, setUsage] = useState<ScanAssistantUsage | null>(null);
  /**
   * 提问时把**当前页面**一并发给服务端，只用于工具路由：「在这个页面上该带哪些工具包」。
   * 站在内容管理页说「帮我发个通知」时，光靠题目里的词路由会猜不中（「通知」不是本域独有词），
   * 页面才是那个可靠的信号。它不参与权限判定 —— 权限只看服务端解出来的身份。
   */
  const { pathname: currentPath } = useLocation();
  const navigate = useNavigate();
  /**
   * 服务端发来的跳转指令，**压到这一轮结束才执行**。
   *
   * 收到就跳不行：模型常先说「我帮你打开…」再说别的，立刻切页会把正文和待答选项一起带走；
   * 而全屏壳子（内容管理那套）被卸载时还会顺手掐断这条 SSE。顺序交给人（用户先看完话，再换页）。
   */
  const pendingNavRef = useRef<{ path: string; label?: string } | null>(null);
  /**
   * 助手算好的一次导出（点「用上次配置直接导出」之后给的那个**下载按钮**）。
   *
   * <p>为什么由面板拉文件：导出接口要 Authorization 头（聊天里塞裸 URL 会 401），而「上次的小计配置」
   * 存在浏览器 localStorage 里 —— 两边都只有载体够得着。后端只负责说「导什么」。
   */
  const pendingDownloadRef = useRef<AssistantDownload | null>(null);
  /**
   * 正在下载的是哪一张卡。历史里可能同时摆着好几张卡片，用一个布尔会把它们一起变灰 ——
   * 所以按卡片记账（键就是那张卡的 `key`）。
   */
  const [busyDownloadKey, setBusyDownloadKey] = useState<string | null>(null);
  /**
   * 正在放大看的那张图。面板里的图是**缩放铺**的（长页面铺满会把对话顶没），
   * 细节得点开看 —— 所以这个浮层不是装饰，是那张图唯一看得清的地方。
   */
  const [zoomShot, setZoomShot] = useState<{ url: string; label: string } | null>(null);
  /**
   * 服务端时间 − 本地时间。
   *
   * <p>倒计时必须补这个差：机器时钟快/慢几分钟时，不补就会显示成「早该到了却没执行」。
   * 与计时器页同一口径（那个接口专门回了 serverNowMillis 就是为这个）。
   */
  const [clockSkewMs, setClockSkewMs] = useState(0);
  /** 每秒走一格，只为重算倒计时显示（不参与任何判定）。 */
  const [nowMs, setNowMs] = useState(() => Date.now());
  /** 多选题当前勾中的值（勾完按「确认」一次性提交） */
  const [multiPick, setMultiPick] = useState<string[]>([]);
  /** 助手抛回来的待答问题（可能一次好几道）：渲染成可点选的控件，答完一道依次往下走 */
  const [queue, setQueue] = useState<AskQuestion[]>(() => pendingQueueOf(loadCachedTurns()));
  /** 已答的答案，下标与 queue 对应；答满 queue.length 就把整组合成一条消息发出去 */
  const [answers, setAnswers] = useState<string[]>([]);
  /** 向导当前在第几题（`answers` 存选择，这个存「在看哪一题」——分开才能上一题回去改） */
  const [current, setCurrent] = useState(0);
  /** 自定义回答的草稿：输入框**常驻**在选项下面（不再点开才出现），回车即等于选了这一项 */
  const [customDraft, setCustomDraft] = useState("");
  /**
   * 大窗态：卡片脱离气泡锚点、居中放大 —— 小卡装不下多轮对话。
   * popupFrom 记「小卡中心相对视口中心的偏移」与「小卡宽 / 弹窗宽」，
   * 展开从这里飞向中心、收起飞回这里；两个方向共用同一组值，动画才对得上。
   */
  const [expanded, setExpanded] = useState(false);
  /** 展开后的放大档：1 = 原大窗，2 = 二级放大。收起时复位回一级，下次展开仍是可预期的「一次一级」。 */
  const [zoom, setZoom] = useState<1 | 2>(1);
  const [closing, setClosing] = useState(false);
  const [popupFrom, setPopupFrom] = useState<{ x: number; y: number; smallWidth: number } | null>(null);
  /** 待发图片：只做本地预览（objectURL），上传链路尚未接 */
  const [images, setImages] = useState<{ url: string; name: string; dataUrl: string }[]>([]);
  /**
   * 表格 / 文本附件（xlsx / xls / md / txt）。
   *
   * <p>与图片**分开放**：两者的去向不同 —— 图片走视觉通道（只发本轮、历史里就没了），
   * 表格交给服务端解析落库（后续追问仍看得见）。混在一个数组里会让「发出去时怎么分流」变成 if 地狱。
   */
  const [files, setFiles] = useState<{ name: string; size: number; dataUrl: string }[]>([]);
  /** 正在往面板上拖文件：只用于给个视觉提示，不影响逻辑。 */
  const [dragging, setDragging] = useState(false);
  /**
   * 附件按钮的第一步：**先问「从哪儿来」**（本机 / 文件模板库）。
   * 合成一步会让「模板库里那份现成文件」这条路根本没有入口 —— 而它恰恰是最常用的。
   */
  const [attachSource, setAttachSource] = useState<"closed" | "choose" | "library">("closed");
  /** 模板库列表：null = 还没拉取（先显示两个来源选项） */
  const [libRows, setLibRows] = useState<AdminFileTemplateRow[] | null>(null);
  const [libLoading, setLibLoading] = useState(false);
  /** 当前会话：续历史对话时带上它；null = 用该来源最近一条（球球默认） */
  const sessionIdRef = useRef<number | null>(loadCachedSessionId());
  /** 点过「新建对话」还没发第一条消息：下一条提问要开新会话 */
  const newSessionRef = useRef(false);
  /** 历史对话：打开即拉列表，点一条就切过去 */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<AssistantSession[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  /** 哪一条正在等第二次点击确认删除（两步确认，避免误点） */
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /** 附件（Excel / md / txt）用**另一个** input：accept 不同，而且用户要能分清两个按钮各收什么。 */
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  /** 同一问题短时间重复提问直接回放。**必须连选项一起回放** —— 只回放正文会让「该人的可选房间」这类问题
   *  第二次问出来时没有可点的选项，看起来像功能坏了（真机踩过：连问两次同一句，第二次只剩纯文本）。 */
  /**
   * 同一句话的回放缓存。
   *
   * <p>**带上后端的 bootId**：后端重启（改完 bug 再测）之后，同一句话若还回放旧答案，
   * 就会让人以为修复没生效 —— 真机踩过（时间闸装好以后，同一句话回放了「21:00」的旧答案）。
   * bootId 变了就重新问后端。
   */
  const answerCacheRef = useRef(
    new Map<string, { text: string; choiceQueue: AskQuestion[]; bootId: string | null }>(),
  );
  const historyRef = useRef<HTMLDivElement | null>(null);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  // 对话一变即持久化（而非仅卸载时）：页面刷新/切路由不触发 unmount cleanup，
  // 只靠卸载 flush 会把最近对话丢在内存里 → 刷新后"缓存丢失不显示文字"的根因。
  // 每次提交的 turns 已含加载的缓存回写，故无需单独的卸载 flush。
  useEffect(() => {
    saveCachedTurns(turns, sessionIdRef.current);
  }, [turns]);

  // 挂载时清掉别人留在这个浏览器里的对话副本（含旧的、不分账号的那个 key）
  useEffect(() => {
    purgeForeignAskCaches();
  }, []);

  /**
   * 新消息 / 打字机增长时**跟随**到底部 —— 但**只在用户本来就在底部时**。
   *
   * <p>无条件滚到底的版本把用户按在了底部：一往上翻就被顶回来，看着像"滚不动"（真机反馈）。
   * 判据放在滚动事件里（`stickRef`），所以用户自己往上滚过之后就一直听他的，直到他自己回到底部，
   * 或者来了新消息（新消息要能看见，所以那时强制重新跟随）。
   */
  const stickToBottomRef = useRef(true);
  useEffect(() => {
    const el = historyRef.current;
    if (!el) return;
    const syncStick = () => {
      // 距底部 48px 内都算「在底部」—— 到底时的亚像素误差与滚动条宽度都会让差值不为 0
      stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    };
    const follow = () => {
      if (stickToBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    };
    stickToBottomRef.current = true; // 新消息来了：这一轮要看到
    el.addEventListener("scroll", syncStick, { passive: true });
    follow();
    const observer = new MutationObserver(follow);
    observer.observe(el, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", syncStick);
    };
  }, [turns.length]);

  /**
   * 唯一的闸是「同一时刻只能有一条在飞」。
   *
   * <p>曾经还有一道 15 秒冷却，且在**回复结束**时才起算 —— 回复 2 秒返回、再锁 13 秒，
   * 表现为「刚答完就发不出去」（真机反馈）。重复提问由答案缓存免费回放兜底，不需要时间锁。
   */
  /** 有字、有图或有附件就能发。跑着的时候也能发 —— 点了就是「停掉上一轮，发这条」。 */
  const canSend = draft.trim().length > 0 || images.length > 0 || files.length > 0;

  /** 展开：此刻 anchor 还停在气泡位上，正好量得到动画起点 */
  const openExpanded = useCallback(() => {
    const rect = anchorRef?.current?.getBoundingClientRect();
    if (rect) {
      setPopupFrom({
        x: rect.left + rect.width / 2 - window.innerWidth / 2,
        y: rect.top + rect.height / 2 - window.innerHeight / 2,
        // 只记小卡实际宽度，缩放比例在渲染时按**当前放大档**算（见 anchorStyle）：
        // 从二级直接收起时，结束帧要缩回小卡大小，用一级的宽度算会差一截、收尾会弹一下。
        smallWidth: rect.width,
      });
    } else {
      setPopupFrom(null);
    }
    setZoom(1);
    setExpanded(true);
  }, [anchorRef]);

  /** 一级 → 二级：卡片本来就是居中定位，加宽是从中心往两边长，不必另算动画起点。 */
  const zoomIn = useCallback(() => setZoom(2), []);

  const collapseExpanded = useCallback(() => {
    setZoom(1); // 下次展开回到一级，路径可预期
    if (reducedMotion) {
      setExpanded(false);
      return;
    }
    setClosing(true); // 播完收起动画（onAnimationEnd）才真正卸载
  }, [reducedMotion]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") collapseExpanded();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded, collapseExpanded]);

  // 展开后焦点落到输入框：用户展开就是要接着问，不该再让他点一次
  useEffect(() => {
    if (expanded && !closing) textareaRef.current?.focus();
  }, [expanded, closing]);

  // 输入框随内容长高；上限交给 CSS 的 max-height，超出部分自己滚
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight 不含边框，而 box-sizing:border-box 下 height 含边框，所以要把边框补回去。
    // 不能拿 offsetHeight - clientHeight 代替：那里还混着滚动条的占位，会把高度算大，
    // 结果就是内容明明只有一行、输入框却比一行高，还外挂着一条滚动条。
    const cs = getComputedStyle(el);
    const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = `${el.scrollHeight + borderY}px`;
  }, [draft, expanded]);

  /**
   * 选图：只收图片。
   *
   * <p>`url` 是给缩略图看的 objectURL；`dataUrl` 才是**发出去的那份**（base64，随提问一起 POST）。
   * 两份都要：objectURL 服务端拿不到，dataUrl 又不能当预览（长字符串塞进 img src 白占内存）。
   */
  const pickImages = (picked: File[]) => {
    if (picked.length === 0) return;
    const room = MAX_ATTACHMENTS - imagesRef.current.length;
    if (room <= 0) return; // 先看余量再建 URL，否则超出的那几张会泄漏
    picked.slice(0, room).forEach((f) => {
      const url = URL.createObjectURL(f);
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) {
          URL.revokeObjectURL(url); // 读失败就别留下一个发不出去的缩略图
          return;
        }
        setImages((prev) =>
          prev.length >= MAX_ATTACHMENTS ? prev : [...prev, { url, name: f.name, dataUrl }],
        );
      };
      reader.onerror = () => URL.revokeObjectURL(url);
      reader.readAsDataURL(f);
    });
  };

  const removeImage = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    setImages((prev) => prev.filter((img) => img.url !== url));
  }, []);

  const removeFile = useCallback((name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  /** 拉模板库列表。失败就关掉菜单并说清 —— 别留一个空列表让用户以为库里没文件。 */
  const loadLibrary = async () => {
    setLibLoading(true);
    try {
      const { rows } = await fetchAdminFileTemplates();
      setLibRows(rows);
    } catch {
      toast.error("读取文件模板库失败，请稍后再试");
      setAttachSource("closed");
      setLibRows(null);
    } finally {
      setLibLoading(false);
    }
  };

  /**
   * 从模板库挑一份加到待发列表。
   *
   * <p>实现上把文件下下来再 base64 上传一次 —— 绕了一圈，但**服务端一行都不用改**（复用同一条附件通道）。
   * 代价是这份文件过两遍网络；内网 + 单个文件（几 MB 内）可以接受，真嫌费再改成「服务端按 templateId 直取」。
   */
  const pickFromLibrary = async (row: AdminFileTemplateRow) => {
    try {
      const { blob, fileName } = await downloadAdminFileTemplateBlob(row.id, row.originalName);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(new Error("读取失败"));
        reader.readAsDataURL(blob);
      });
      if (!dataUrl) throw new Error("空内容");
      const name = fileName || row.originalName;
      // **按类型分流**：模板库里既有文档也有图片。图片要走视觉通道（跟本机选的照片同一条路），
      // 塞进附件通道会被服务端按「解析文档」处理而失败 —— 库里确实躺着 png（实测）。
      if (blob.type.startsWith("image/")) {
        const url = URL.createObjectURL(blob);
        setImages((prev) =>
          prev.length >= MAX_ATTACHMENTS ? prev : [...prev, { url, name, dataUrl }],
        );
      } else {
        setFiles((prev) =>
          prev.length >= MAX_ATTACHMENTS ? prev : [...prev, { name, size: blob.size, dataUrl }],
        );
      }
      setAttachSource("closed");
      setLibRows(null);
    } catch {
      toast.error(`「${row.originalName}」读取失败`);
    }
  };

  /** 只收表格/文本。附件按钮走这条；拖拽走 {@link pickAttachments}（它两样都分）。 */
  const pickDocs = (incoming: File[]) => {
    const docs = incoming.filter((f) => {
      const n = f.name.toLowerCase();
      return ATTACH_FILE_EXTS.some((ext) => n.endsWith(ext));
    });
    if (docs.length === 0) return;
    const room = MAX_ATTACHMENTS - filesRef.current.length;
    if (room <= 0) return;
    docs.slice(0, room).forEach((f) => {
      if (f.size > MAX_ATTACH_FILE_BYTES) {
        toast.error(`「${f.name}」超过 ${Math.round(MAX_ATTACH_FILE_BYTES / 1024 / 1024)}MB，先压缩或拆分再传`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) return;
        setFiles((prev) =>
          prev.length >= MAX_ATTACHMENTS ? prev : [...prev, { name: f.name, size: f.size, dataUrl }],
        );
      };
      reader.readAsDataURL(f);
    });
  };

  /**
   * 拖拽入口：**按类型自动分流**。
   *
   * <p>点选时是两个按钮（图片 / 附件），但拖进来的时候用户不会先声明「这是表格」，
   * 所以拖放这条路得自己认。
   */
  const pickAttachments = (incoming: File[]) => {
    if (incoming.length === 0) return;
    pickImages(incoming.filter((f) => f.type.startsWith("image/")));
    pickDocs(incoming);
  };

  // 卸载时释放还没被删掉的预览 URL
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(
    () => () => {
      imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url));
    },
    [],
  );

  // 发送期间的本地计时：服务端只在每轮结束时报时，秒针要自己走
  useEffect(() => {
    if (!sending) {
      setLiveMs(0);
      return;
    }
    const startedAt = Date.now();
    const id = window.setInterval(() => setLiveMs(Date.now() - startedAt), 200);
    return () => window.clearInterval(id);
  }, [sending]);

  const liveMeta: AskMeta | undefined =
    sending && liveMs > 0
      ? {
          latencyMs: liveMs,
          totalTokens: usage?.totalTokens ?? 0,
          promptTokens: usage?.promptTokens ?? 0,
          completionTokens: usage?.completionTokens ?? 0,
          turns: usage?.turns ?? 0,
        }
      : undefined;

  /**
   * 让球球先说一句。**打开面板**和**新建对话**都走它。
   *
   * <p>空着只剩一个输入框时用户不知道它能干什么；新建对话之后同样如此 —— 所以新会话也重新问好，
   * 而不是留一个塌成一行的高度（真机反馈：新建完"就一行输入框太难受"）。
   */
  const fireGreeting = useCallback(() => {
    setTurns([{ role: "assistant", text: "", typed: false }]);
    let acc = "";
    void streamScanAssistantGreet({
      onDelta: (text) => {
        acc += text;
      },
      onDone: (payload) => {
        const finalText = (payload.text ?? acc).trim();
        setTurns([{ role: "assistant", text: finalText, typed: false }]);
      },
      onError: (message) => {
        setTurns([{ role: "assistant", text: message, typed: false }]);
      },
    }).catch(() => {});
  }, []);

  const submit = () => {
    // 跑着的时候又按了发送：由 submitText 统一「先停上一轮、再发这一条」——
    // 用户按发送就是要发，卡在「上一轮还在跑」上等于按钮是死的。
    void submitText(draft);
  };

  /**
   * 发一句话。选项芯片、自定义回答、提问框三条入口都走这里，没有冷却差异。
   */
  /** 新建对话：清掉本地这几样（对话/待答题/答案缓存/待发图），并让下一条消息开一条服务端新会话 */
  const handleNewChat = () => {
    setTurns([]);
    setQueue([]);
    setAnswers([]);
    setCustomDraft("");
    setDraft("");
    setImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.url));
      return [];
    });
    answerCacheRef.current.clear();
    sessionIdRef.current = null;
    newSessionRef.current = true;
    try {
      dropAskCache(currentCacheKey());
    } catch {
      /* ignore */
    }
    fireGreeting(); // 新会话照样先问好，别留一块空白
    onNewChat?.();
  };

  /** 打开历史对话：拉一次列表（只 source=scan），点一条就切过去 */
  const openHistory = () => {
    setHistoryOpen(true);
    setHistoryList(null);
    setHistoryLoading(true);
    onOpenHistory?.();
    void fetchAssistantSessions()
      .then((list) => setHistoryList(list))
      .catch(() => setHistoryList([]))
      .finally(() => setHistoryLoading(false));
  };

  /**
   * 删除一条对话：**服务端软删**（列表/续聊不再出现，审计留痕保留）。
   * 删掉的如果正是当前这条，就回到「新会话」—— 否则 panel 会盯着一份已经删掉的会话继续发消息。
   */
  const removeSession = async (session: AssistantSession) => {
    setPendingDeleteId(null);
    try {
      await deleteAssistantSession(session.id);
    } catch {
      return;
    }
    setHistoryList((prev) => (prev ?? []).filter((x) => x.id !== session.id));
    if (sessionIdRef.current === session.id) {
      sessionIdRef.current = null;
      newSessionRef.current = false;
      setTurns([]);
      setQueue([]);
      setAnswers([]);
      setCurrent(0);
      answerCacheRef.current.clear();
      fireGreeting();
    }
  };

  /** 切到某条历史会话：把它的消息铺成对话，并记住会话 id 让下一条接上去 */
  const pickSession = useCallback(async (sessionId: number) => {
    setHistoryLoading(true);
    try {
      // 消息与产物**两路并行**取：产物要按锚点挂回它当年那一轮，否则卡片就回不到原位
      const [msgs, exports] = await Promise.all([
        fetchAssistantSessionMessages(sessionId),
        fetchSessionExports(sessionId).catch(() => [] as AssistantExportArtifact[]),
      ]);
      // 先铺成轮次（暂时留着消息 id，用来给产物找落点）
      const rows = msgs
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          text: m.content ?? "",
          typed: true, // 恢复的历史一律视为已打完
          messageId: m.id,
          exports: [] as TurnExport[],
        }));

      // 产物**不挂在它产生的那个工具轮上**：那一轮正文是空的，卡片会孤零零占一行，
      // 看着像「另外单独发的文件」，分不清归属。
      // 挂到它之后（含自己）**第一条有正文的助手回复**下面 —— 那才是「跟着这句话输出的文件」，
      // 和实时对话里卡片落在答复气泡下面的样子一致。找不到就退到锚点之后的第一轮。
      for (const e of exports) {
        const anchor = e.messageId ?? null;
        let target = -1;
        for (let i = 0; i < rows.length; i++) {
          if (anchor != null && rows[i].messageId < anchor) continue;
          if (rows[i].role === "assistant" && rows[i].text.trim().length > 0) {
            target = i;
            break;
          }
        }
        if (target < 0) {
          target = rows.findIndex((r) => anchor == null || r.messageId >= anchor);
        }
        if (target < 0) {
          target = rows.length - 1;
        }
        if (target >= 0) {
          const isShot = e.kind === "screenshot";
          rows[target].exports.push({
            key: `h${e.exportId}`,
            kind: e.kind,
            label: e.label,
            params: e.params,
            exportId: e.exportId,
            // 截图那张卡先占位，字节待会儿单独取（消息里没有图，只有文字）
            ...(isShot ? { imageState: "loading" as const, path: shotPathOf(e.params) } : {}),
          });
        }
      }

      setTurns(
        rows
          // 工具轮 / 空答复不铺成气泡 —— 但**挂了文件的那一轮要留**（卡片得有落脚点）
          .filter((r) => r.text.trim().length > 0 || r.exports.length > 0)
          .map((r) => ({
            role: r.role,
            text: r.text,
            typed: r.typed,
            // 留着锚点：倒计时/产物按它挂回原位
            messageId: r.messageId,
            ...(r.exports.length ? { exports: r.exports } : {}),
          })),
      );
      // 截图的字节不在消息里，单独把图取回来铺上去；取不到那张卡会退化成「重截一张」
      for (const e of exports) {
        if (e.kind === "screenshot") {
          void loadShotBytes(`h${e.exportId}`, e.exportId, shotPathOf(e.params));
        }
      }
      // 倒计时按 messageId 挂回原位（与产物同一套锚点）
      void mountTimers();
      sessionIdRef.current = sessionId;
      newSessionRef.current = false;
      setQueue([]);
      setAnswers([]);
      answerCacheRef.current.clear();
      setHistoryOpen(false);
    } catch {
      setHistoryList([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  /**
   * 打开面板：先续本机缓存（含还没发出去的草稿），本机没有就去服务端拉**最近一条会话**接着聊，
   * 都没有（全新用户）才问好。
   *
   * <p>不去服务端找的话，换台机器/清了缓存/点过「新建对话」之后，用户回来永远是一句问候 + 空对话，
   * 想接着刚才那条还得自己去「历史对话」里翻 —— 但他多半就是要"接着说"。
   *
   * <p>写在 {@code pickSession} 之后不是排版偏好：依赖数组在**渲染期**求值，放前面会踩 TDZ。
   */
  useEffect(() => {
    if (turnsRef.current.length > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const latest = (await fetchAssistantSessions())[0];
        if (latest?.id) {
          if (cancelled) return;
          await pickSession(latest.id);
          return;
        }
      } catch {
        /* 拉不到就落回问好 */
      }
      if (!cancelled) fireGreeting();
    })();
    return () => {
      cancelled = true;
    };
  }, [fireGreeting, pickSession]);

  /** 流式结束：把最后那条 assistant 占位气泡换成最终文本 + 用量 + 待答问题。 */
  const applyStreamResult = (
    payload: {
      text?: string;
      totalTokens?: number;
      latencyMs?: number;
      promptTokens?: number;
      completionTokens?: number;
      turns?: number;
      /** 这一轮助手消息在服务端的 id：倒计时/产物按它挂回原位 */
      messageId?: number;
    },
    acc: string,
    accQueue: AskQuestion[],
  ) => {
    const finalText = (payload.text ?? acc).trim();
    const meta: AskMeta | undefined =
      typeof payload.totalTokens === "number"
        ? {
            latencyMs: payload.latencyMs ?? 0,
            totalTokens: payload.totalTokens,
            promptTokens: payload.promptTokens ?? 0,
            completionTokens: payload.completionTokens ?? 0,
            turns: payload.turns ?? 1,
          }
        : undefined;
    setTurns((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      if (last && last.role === "assistant") {
        next[next.length - 1] = {
          role: "assistant",
          text: finalText,
          // 有正文就交给打字机逐个吐（typed=false）；**没正文就直接算打完** ——
          // 否则气泡永远停在「正在思考…」+ 转圈上（挂起等确认那一轮正文本来就是空的，
          // 点一次确认就多堆一个不结束的思考中气泡）。
          typed: finalText.length === 0,
          meta,
          /*
           * **本轮没有新问题就留住上一轮未答的**。
           *
           * 一轮里可能有多个工具各抛一次交互：导出要选维度 + 建定时要确认。而写操作的确认
           * 会把那一轮**挂起**（就此收尾），选项先渲染出来；点了确认续跑，续跑那轮没有新问题，
           * 如果这里直接清空，导出那批选项就**被覆盖掉了**（真机反馈：导出的选项没了）。
           */
          choiceQueue: accQueue.length > 0 ? accQueue : last.choiceQueue,
          // 「正在跑」到这儿就该撤掉；**失败要留着** —— 那正是用户需要看见的信息
          toolBusy: last.toolBusy?.status === "failed" ? last.toolBusy : undefined,
          messageId: payload.messageId ?? last.messageId,
          // **已经挂在这一轮上的东西要原样带过来**：这里是「重建」不是「追加」，漏带的字段会被直接抹掉。
          // 确认续跑会再走一次这里 —— 真机就是这么把刚挂上的倒计时卡弄没的。
          exports: last.exports,
          timers: last.timers,
        };
      }
      /*
       * **把同一次提问产出的附件收拢到最后这条回复上。**
       *
       * 一次提问中间可能挂起过（写操作要确认）—— 但**挂起不算这次提问结束**，
       * 用户点完确认仍是在办同一件事。于是图/文件/倒计时原本各落一条气泡，
       * 现在都收拢到"这次提问真正收尾的那一条"上。
       *
       * 往前扫的停法：遇到助手轮就收它的产物；遇到"确认执行"那条用户轮继续往前；
       * 遇到真正的新提问就停。收空了的轮由渲染处丢掉（不再留空壳）。
       */
      const lastIdx = next.length - 1;
      if (next[lastIdx] && next[lastIdx].role === "assistant") {
        const carriedExports = [...(next[lastIdx].exports ?? [])];
        const carriedTimers = [...(next[lastIdx].timers ?? [])];
        for (let i = lastIdx - 1; i >= 0; i -= 1) {
          const t = next[i];
          if (t.role === "user") {
            if (t.isConfirmAnswer) continue;   // 点确认不算新提问，继续往前收
            break;                              // 上一次真正的提问 → 停
          }
          // **只复制、不清源**：搬走了就再也没法回头，而收拢会因为"又收尾一次"重复执行 ——
          // 复制留下两份，由渲染处按 key 去重（只显示最后一次出现的那条），
          // 这样"收拢"这件事**天然幂等、且不可能丢东西**。
          if (t.exports?.length) {
            carriedExports.unshift(...t.exports);
          }
          if (t.timers?.length) {
            carriedTimers.unshift(...t.timers);
          }
        }
        next[lastIdx] = {
          ...next[lastIdx],
          ...(carriedExports.length ? { exports: carriedExports } : {}),
          ...(carriedTimers.length ? { timers: carriedTimers } : {}),
        };
      }
      // **刚收尾的就是这一轮**（prev 是权威的，不是闭包快照）—— 之后新建的产物挂它下面
      lastFinalizedTurnRef.current = lastIdx;
      return next;
    });

    // 轮到跳转了：正文已落定、待答问题已挂上，现在切页不会丢掉任何东西。
    const nav = pendingNavRef.current;
    pendingNavRef.current = null;
    if (nav && nav.path) {
      // 服务端给的是注册表里的 canonical 路径（/admin/xxx），直接 navigate 会命中顶层
      // legacy 重定向 —— 整个后台壳层卸载重建、页面闪一下。转成 /console/admin/xxx 再跳。
      const target = toAdminRoutePath(nav.path);
      if (target && target !== currentPath) {
        navigate(target);
        toast.success(nav.label ? `已打开「${nav.label}」` : "已打开");
      }
    }

    // 下载按钮同理：压到本轮结束再出现，免得正文还没说完按钮就跳出来了。
    // **挂在刚说完的这条助手消息上**（而不是单独浮一块）—— 用户在历史里顺着那句话就能找到那份文件。
    const dl = pendingDownloadRef.current;
    pendingDownloadRef.current = null;
    if (dl && dl.kind) {
      const one: TurnExport = {
        key: `live${Date.now()}`,
        kind: dl.kind,
        label: dl.label,
        params: dl.params,
        exportId: dl.exportId,
      };
      setTurns((prev) => {
        const next = prev.slice();
        const lastIndex = next.length - 1;
        const last = next[lastIndex];
        if (last && last.role === "assistant") {
          next[lastIndex] = { ...last, exports: [...(last.exports ?? []), one] };
          return next;
        }
        // 没有助手轮可挂（模型一个字都没说）：补一轮只有卡片的，别让它无处可去
        return [...next, { role: "assistant" as const, text: "", typed: true, exports: [one] }];
      });
    }


    // 这一轮可能刚设了定时：**锁死挂到刚说完这条**（此刻它就是最后一轮），
    // 不锁的话等 fetch 回来时可能已经被补拉进来的汇报顶掉了落点
    void mountTimers();
  };

  /**
   * 执行一次导出下载。**实时那张卡和历史里的卡走同一条路** —— 用户在历史里点到的
   * 和他当时点的是同一个东西，认知才不割裂。
   *
   * 两条分支：
   * ① 这份**已经归档过** → 直接给当时那份字节（历史里再下与当时逐字节相同）；
   * ② 还没归档过（只拿到过按钮、没真下过）→ 用参数重跑一次导出，并**把刚生成的这份交回归档**，
   *    于是下一次再点就走 ①。
   *
   * 小计配置用**浏览器里那份**（与导出弹窗同一个 storageKey），所以文件与页面上导出来的一致。
   */
  const performDownload = async (dl: TurnExport, busyKey: string): Promise<void> => {
    if (busyDownloadKey) return;
    setBusyDownloadKey(busyKey);
    /*
     * 领用单：附件里带的是一份**免登录的下载路径**（令牌就是能力），取到字节强制保存即可。
     * 不走下面那套「导出 + 浏览器里的小计配置 + 归档」—— 那是物资审计导出专用的。
     */
    if (dl.kind === "supplyClaim") {
      const path = String((dl.params as Record<string, unknown> | undefined)?.downloadPath ?? "");
      const name = dl.label || "领用单.pdf";
      try {
        if (!path) throw new Error("没有下载路径");
        const resp = await fetch(path);
        if (!resp.ok) throw new Error(String(resp.status));
        downloadBlob(await resp.blob(), name);
        toast.success("已开始下载");
      } catch {
        toast.error("领用单下载失败，链接可能已过期（7 天有效），让助手重新生成一份");
      } finally {
        setBusyDownloadKey(null);
      }
      return;
    }
    /*
     * 后面的重跑分支是**物资审计导出专用**的（文件名前缀、浏览器里那份小计配置）。
     * 别的导出域不能被它兜住 —— 那样会下到一份跟用户要的完全无关的文件。
     */
    const isMaterialAudit = !dl.kind || dl.kind === "materialAudit";
    const url = String((dl.params as Record<string, unknown> | undefined)?.url ?? "");
    const filename = isMaterialAudit
      ? `material-audit-${dl.label || "export"}.xlsx`
      : `${dl.label || "export"}.xlsx`;
    try {
      if (dl.exportId) {
        const archived = await fetchExportBlob(dl.exportId);
        if (archived) {
          downloadBlob(archived, filename);
          toast.success("已开始下载");
          return;
        }
      }
      /*
       * **带地址的导出**（动物订购这类）：后端给的是相对地址，按它取 —— 与页面上那个
       * 「导出 Excel」按钮走的是同一条接口，所以小计口径、可见范围都由服务端同一处判。
       * 取到就顺手归档：历史里再下、以及之后「改这份文件」，靠的都是这份字节。
       */
      if (url) {
        const blob = await fetchExportByUrl(url);
        downloadBlob(blob, filename);
        if (dl.exportId) {
          await archiveExportContent(dl.exportId, blob, filename);
        }
        toast.success("已开始下载");
        return;
      }
      if (!isMaterialAudit) {
        toast.error("这份导出暂时取不到文件，让助手重新导一次");
        return;
      }
      if (!dl.params) {
        toast.error("这份导出没有文件、也没有可重跑的参数");
        return;
      }
      const p = { ...dl.params } as Record<string, unknown>;
      const itemFamily = p.tab === "item" || p.tab === "itemGroup";
      const storageKey = itemFamily
        ? "fm-export-subtotal:material-item-flow"
        : "fm-export-subtotal:material-audit";
      const base = { ...p, exportLabel: dl.label };
      const sum = itemFamily
        ? await exportMaterialItemFlowSummary(p as never)
        : await exportMaterialAuditSummary(p as never);
      // 用户在对话里勾了层级（mode=direct）就按他勾的走；没勾才用浏览器里那份「上次配置」。
      // 后端契约：levels 是**保留**的层级逗号列表（空 = 全保留、`none` = 全不保留）。
      const picked = Array.isArray(p.levels) ? (p.levels as string[]) : [];
      if (picked.length) {
        // **把这次勾的层级存成「上次的配置」**：用户下次说「用上次的」时，用的就是他这次勾的这份。
        // 不存的话「上次」永远是浏览器里更早那份（用户会以为自己刚配的没生效）。
        // 排除法存储：没勾的层级进 offLevels。
        saveConfig(storageKey, {
          offLevels: (sum.levels ?? []).filter((l) => !picked.includes(l)),
          excludeBlocks: loadConfig(storageKey).excludeBlocks ?? [],
        });
      }
      const config = picked.length
        ? { levels: picked.join(","), excludeBlocks: "" }
        : toQuery(loadConfig(storageKey), sum.levels ?? []);
      const blob = itemFamily
        ? await exportMaterialItemFlow(base as never, config)
        : await exportMaterialAuditTrail(base as never, config);
      downloadBlob(blob, filename);
      // 交回归档：下过一次之后，历史里再下拿到的就是**这次这一份**，不再依赖重建
      if (dl.exportId) {
        await archiveExportContent(dl.exportId, blob, filename);
      }
      toast.success("已开始下载");
    } catch {
      toast.error("下载失败：去导出页面上点一次导出试试");
    } finally {
      setBusyDownloadKey(null);
    }
  };

  /** 给「刚说完的那条助手消息」打补丁（长任务状态就挂在那儿）。 */
  const patchLastAssistant = (patch: Partial<AskTurn>) => {
    setTurns((prev) => {
      const i = prev.length - 1;
      if (i < 0 || prev[i].role !== "assistant") {
        return prev;
      }
      const next = prev.slice();
      next[i] = { ...next[i], ...patch };
      return next;
    });
  };

  /** 还有在跑的倒计时就每秒走一格；没有就停掉，别白跑一个定时器。 */
  const hasLiveTimer = turns.some((t) => t.timers?.some((x) => TIMER_LIVE_STATUSES.has(x.status)));
  useEffect(() => {
    if (!hasLiveTimer) {
      return undefined;
    }
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasLiveTimer]);

  /**
   * 把这个会话的倒计时拉回来、挂到对应的那一轮上。
   *
   * <p>实时与历史共用：实时刚设完定时，那条还没挂上，会落到**刚说完那一条**；
   * 历史则按 `messageId` 挂回原位（缺了就落到最后一条助手回复，总比不显示强）。
   * 已经挂上的只刷状态 —— 等它从「等待」变成「已执行 / 失败」。
   *
   * <p>**归零后再拉一次**就是为了拿到那个结果。不新增推送通道：你正看着它，它自己就变；
   * 你没看，下次打开也是对的。
   */
  const mountTimers = async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      return;
    }
    let res;
    try {
      res = await fetchAiTimers({ scope: "mine" });
    } catch (e) {
      // 读不到不影响对话本身，但**要留一行** —— 它失败的症状是「卡片要重开对话才出现」，
      // 静默吞掉根本查不出是网络抖了还是逻辑错（真机排查吃过这个亏）。
      console.warn("[scan-assistant] 倒计时读取失败：", e);
      return;
    }
    setClockSkewMs(res.serverNowMillis - res.clientAt);
    const rows = (res.list || []).filter((t) => t.sessionId === sessionId);
    if (rows.length === 0) {
      return;
    }
    const toTurn = (t: (typeof rows)[number]): TurnTimer => ({
      id: t.id,
      label: t.label || "定时任务",
      fireAtMillis: t.fireAtMillis ?? 0,
      status: t.status,
      statusZh: t.statusZh,
      ok: t.ok ?? null,
      result: t.result,
      error: t.error,
    });
    setTurns((prev) => {
      const next = prev.map((t) => ({ ...t, timers: t.timers ? [...t.timers] : undefined }));
      const mounted = new Set<number>();
      next.forEach((t) => (t.timers || []).forEach((x) => mounted.add(x.id)));
      next.forEach((t) => {
        if (!t.timers) return;
        t.timers = t.timers.map((x) => {
          const fresh = rows.find((y) => y.id === x.id);
          return fresh ? toTurn(fresh) : x;
        });
      });
      rows
        .filter((r) => !mounted.has(r.id))
        .forEach((r) => {
          /*
           * 落点先后：按 messageId 找（历史/缓存）→ 兜底「最后一条**会渲染**的助手轮」。
           *
           * 兜底那条有两个**必须**的过滤，少一个就会挂到一个看不见的轮上（真机排查了很久）：
           *   ① 跳过定时器补拉进来的汇报轮（`fromTimer`）—— 它不是"说这句话的那一轮"；
           *   ② 跳过**正文为空**的轮 —— 挂起那一轮模型只调了工具、一个字没说，
           *      面板**故意不给它画气泡**（选项卡片另处渲染），挂上去等于挂在空气上。
           * 另外服务端那条锚是**工具调用消息**的 id，与面板上"最终回复"那条不是同一个 id，
           * 所以 id 匹配多半落空、真正起作用的就是这个兜底，它必须选对人。
           */
          /*
           * 落点 = **载体最近收尾的那一轮**（见 lastFinalizedTurnRef 的注释）。
           *
           * 不看服务端的 messageId：那个锚指的是「工具调用那条消息」，跟面板上的轮不是一回事，
           * 而且它常常落在挂起那一轮上 —— 那一轮正文为空、面板故意不画，卡片挂上去就隐形了。
           *
           * 只有它不可渲染时才往后挪一格（挂起那轮不该成为落点）。
           */
          let idx = lastFinalizedTurnRef.current ?? -1;
          if (idx < 0 || idx >= next.length || !isRenderableTurn(next[idx])) {
            idx = -1;
            for (let i = next.length - 1; i >= 0; i -= 1) {
              if (isRenderableTurn(next[i])) {
                idx = i;
                break;
              }
            }
          }
          if (idx < 0) {
            for (let i = next.length - 1; i >= 0; i -= 1) {
              // 跳过定时器补拉进来的汇报轮：它不是"说这句话的那一轮"（见 AskTurn.fromTimer）
              if (next[i].role === "assistant" && !next[i].fromTimer && next[i].text.trim().length > 0) {
                idx = i;
                break;
              }
            }
          }
          if (idx < 0) return;
          next[idx] = { ...next[idx], timers: [...(next[idx].timers ?? []), toTurn(r)] };
        });
      return next;
    });
  };

  /**
   * 归零之后**反复补拉**，直到它不再是「在跑」的状态。
   *
   * <p>只补一次是不够的：服务端的调度器每 5 秒扫一遍到期单，而我们最早在 +3s 就去问 ——
   * 那时它多半还没执行，一次问完就再也没有第二次，那一格会**永远停在「正在执行…」**（真机踩到）。
   *
   * <p>上限 24 次（约 2 分钟）：再久就是服务端那边出问题了，页面上没必要一直打接口。
   */
  const timerPollRef = useRef<Map<number, { at: number; tries: number }>>(new Map());
  /** 上一轮看到的每个倒计时的状态 —— 用来发现「刚从在跑变成终态」那一瞬。 */
  const timerSeenStatusRef = useRef<Map<number, string>>(new Map());
  useEffect(() => {
    const live = turns.flatMap((t) => t.timers || []);
    let need = false;
    live.forEach((x) => {
      // 刚从「在跑」变成终态 → 必须补拉：**定时器写回会话的那条汇报就在这一刻出现**。
      // 少了这个判断，轮询会在卡片变「已完成」的同一拍停下，正好错过那条汇报（真机踩到）。
      const prevStatus = timerSeenStatusRef.current.get(x.id);
      if (prevStatus && TIMER_LIVE_STATUSES.has(prevStatus) && !TIMER_LIVE_STATUSES.has(x.status)) {
        need = true;
      }
      timerSeenStatusRef.current.set(x.id, x.status);
      if (!TIMER_LIVE_STATUSES.has(x.status)) {
        timerPollRef.current.delete(x.id);
        return;
      }
      if (x.fireAtMillis <= 0 || nowMs - clockSkewMs < x.fireAtMillis + 3000) {
        return;
      }
      const seen = timerPollRef.current.get(x.id);
      if (!seen) {
        timerPollRef.current.set(x.id, { at: nowMs, tries: 1 });
        need = true;
        return;
      }
      if (seen.tries < 24 && nowMs - seen.at >= 5000) {
        seen.at = nowMs;
        seen.tries += 1;
        need = true;
      }
    });
    if (need) {
      // 两条一起补：倒计时的状态（含成败）+ 定时器写回会话的那条汇报。
      // 后者绕开了对话流（跑在调度线程里），不主动拉就永远看不见。
      void mountTimers();
      void pullNewMessages();
    }
    // mountTimers 每次渲染都是新函数，不进依赖 —— 靠上面的 Map 防重入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMs, clockSkewMs, turns]);

  /**
   * 把服务端**新落进会话**的消息补到界面上。
   *
   * <p>谁会绕开对话流直接往会话里写？**定时器执行完的那条汇报** —— 它跑在调度线程里，
   * 这头没有任何 SSE 连接。不补的话：通知都推到他手机上了，对话里却要重开才看得见，
   * 用户看到的就是「推送了，但对话里没有」。
   *
   * <p>只认**比已知最大消息 id 更新**的助手消息：消息是按 id 递增追加的，
   * 用「大于」不会把已经渲染过的重复拉一遍。
   */
  const pullNewMessages = async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      return;
    }
    let msgs: { id: number; role: string; content: string }[] = [];
    try {
      msgs = await fetchAssistantSessionMessages(sessionId);
    } catch {
      return; // 拉不到就算了，别把这一轮搞坏
    }
    setTurns((prev) => {
      const maxKnown = prev.reduce((mx, t) => (typeof t.messageId === "number" && t.messageId > mx ? t.messageId : mx), 0);
      // 一个 id 都不知道就**不补**：这种情况无从判断哪条是新的，硬补会把整段对话复制一遍
      if (maxKnown <= 0) {
        return prev;
      }
      const fresh = (msgs || []).filter(
        (m) => m.role === "assistant" && m.id > maxKnown && String(m.content || "").trim().length > 0,
      );
      if (fresh.length === 0) {
        return prev;
      }
      return [
        ...prev,
        ...fresh.map((m) => ({
          role: "assistant" as const,
          text: String(m.content),
          typed: true,
          messageId: m.id,
          // 打上标记：倒计时兜底找落点时要跳过它（见 AskTurn.fromTimer 的注释）
          fromTimer: true,
        })),
      ];
    });
  };

  /** 手动停止一个倒计时（走的是计时器页同一套接口）。 */
  const stopTimer = async (timerId: number) => {
    try {
      await cancelAiTimer(timerId);
      await mountTimers();
      toast.success("已停止");
    } catch {
      toast.error("没能停止这个定时");
    }
  };

  /**
   * 确认一次**到点了但被挂起**的定时。
   *
   * <p>**新定时不会再进这个状态了**（确认已经前移到建单那一刻，见 AiTimerService.dispatchClaimed），
   * 这个键留着是给**改造前就卡在「等待确认」的老单子**一个就地放行的入口 ——
   * 否则用户在对话里只看到「等待你确认」，却得自己找到「AI 计时器」那一页去点。
   */
  const confirmTimer = async (timerId: number) => {
    try {
      await confirmAiTimer(timerId);
      await mountTimers();
      toast.success("已确认，正在执行");
    } catch {
      toast.error("确认失败，去「AI 计时器」页面看看");
    }
  };

  /**
   * 总是最新的 turns。
   *
   * <p>流式回调里闭包拿到的 `turns` 是**发起那一轮时的快照**，早就旧了 ——
   * 用它算"最后一条"会指到别的轮上（真机就是这么把倒计时挂歪的）。
   * 这个 ref 每渲染都刷一次，谁要用现成的就用它。
   */
  const latestTurnsRef = useRef<AskTurn[]>([]);
  latestTurnsRef.current = turns;
  /**
   * **载体最近收尾的那一轮**的下标 —— 产物/倒计时的唯一落点。
   *
   * <p>为什么用它是本质正确的：服务端给的锚是「工具调用那条消息」的 id，而面板上的轮是
   * 「最终回复那条」的 id，两者不是一回事；中间还夹着一次挂起（那一轮正文为空、面板故意不画）。
   * 拿两边的 id 去对齐，怎么对都会错。
   *
   * <p>而「刚收尾的是哪一轮」**只有载体自己知道，且它一定知道**（它刚往那一轮写完正文）。
   * 所以这个值在 `applyStreamResult` 里、**从权威的 `prev` 上**取值（不用任何过期闭包），
   * 之后新建的产物就挂它下面 —— 不需要跟服务端对齐任何 id。
   */
  const lastFinalizedTurnRef = useRef<number | null>(null);

  /** 给某张截图卡打补丁（按 key 找）。实时与历史两条路都用它更新状态。 */  const patchShot = (key: string, patch: Partial<TurnExport>) => {
    setTurns((prev) =>
      prev.map((t) => {
        if (!t.exports?.some((e) => e.key === key)) return t;
        return { ...t, exports: t.exports.map((e) => (e.key === key ? { ...e, ...patch } : e)) };
      }),
    );
  };

  /**
   * 实时那次：跳到那一页 → 等它画稳 → 截下来 → 显示，并把字节交回产物归档。
   *
   * 截的是**提问者自己这份画面**（他的登录态、数据、视口），所以服务端不需要注入任何身份。
   * 归档是为了切走再回来那张图还在（与导出同一条口径）。
   */
  const captureShot = async (key: string, exportId: number | undefined, path: string | undefined) => {
    try {
      if (path) {
        const target = toAdminRoutePath(path);
        if (target && target !== currentPath) {
          navigate(target);
        }
        await waitForPagePainted();
      }
      const blob = await captureAppRoot();
      patchShot(key, { imageUrl: URL.createObjectURL(blob), imageState: "ready" });
      if (exportId) {
        void archiveExportContent(exportId, blob, "screenshot.png");
      }
    } catch (e) {
      // 必须留一行：截图失败是**静默**的（卡片只是变成「没截成」），不记的话
      // 事后只能看到一个空产物，查不出是取字节失败还是渲染失败。真机踩过。
      console.warn("[scan-assistant] 截图失败：", e);
      patchShot(key, { imageState: "failed" });
    }
  };

  /** 历史那次：产物里已经有字节（当年截的那一张），取回来显示。取不到就退化成「重截一张」。 */
  const loadShotBytes = async (key: string, exportId?: number, path?: string) => {
    if (!exportId) {
      patchShot(key, { imageState: "failed", path });
      return;
    }
    try {
      const blob = await fetchExportBlob(exportId);
      if (!blob) {
        patchShot(key, { imageState: "failed", path });
        return;
      }
      patchShot(key, { imageUrl: URL.createObjectURL(blob), imageState: "ready" });
    } catch {
      patchShot(key, { imageState: "failed", path });
    }
  };

  /**
   * 从缓存恢复出来的那一屏，补两样缓存里必然存不住的东西。
   *
   * <p>① 截图的**字节**：缓存只记了产物号（blob 地址是这一页的临时地址，重开就没），
   * 所以要按 exportId 重新取一趟 —— 不补的话，关掉再打开面板图就全没了（真机反馈过）。
   * ② 倒计时的**真实状态**：缓存里那份早就过期了，重新拉一次才算数。
   *
   * <p>只跑一次（挂载时）。成功/失败都会改写 imageState，不需要再触发；
   * 「点开历史会话」那条路自己会取，不走这里。
   */
  useEffect(() => {
    turns
      .flatMap((t) => t.exports || [])
      .filter((e) => e.kind === "screenshot" && e.exportId && !e.imageUrl)
      .forEach((e) => void loadShotBytes(e.key, e.exportId, e.path));
    if (sessionIdRef.current) {
      void mountTimers();
      // 面板关着的那段时间，定时器可能已经写完汇报了 —— 那时没有轮询在跑，这里补一次
      void pullNewMessages();
    }
    // 只在挂载时补一次；turns/loadShotBytes 都是那一刻的快照
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 流式出错：占位气泡还没写出正文时，把错误当这一轮的答复显示出来。 */
  const applyStreamError = (message: string) => {
    setTurns((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      if (last && last.role === "assistant" && !last.text) {
        next[next.length - 1] = { role: "assistant", text: message, typed: false };
      }
      return next;
    });
  };

  /** 把球球抛回来的候选收进待答队列 —— 澄清与确认走同一条收集路径，区别只在点选后发去哪。 */
  const collectInteraction = (
    p: { question: string; options: AskChoice[]; token?: string; kind?: string; multiSelect?: boolean },
    accQueue: AskQuestion[],
  ) => {
    if (!p.options || p.options.length === 0) return;
    // **同一轮里一模一样的问题只排一次**：模型有时会把同一个出选项的工具调两遍，
    // 于是用户看到「两个重复的提问物资」（真机反馈 2026-10-09）。问题+选项全同就算重复。
    const key = `${p.question}|${p.options.map((o) => `${o.label}=${o.value}`).join(",")}`;
    if (accQueue.some((x) => `${x.question}|${x.options.map((o) => `${o.label}=${o.value}`).join(",")}` === key)) {
      return;
    }
    accQueue.push({
      question: p.question,
      options: p.options,
      token: p.token,
      kind: p.kind,
      multiSelect: p.multiSelect === true,
    });
    setQueue([...accQueue]);
    setAnswers([]);
    setMultiPick([]);
  };

  /**
   * @param displayText 气泡上显示什么（可选）。**只影响显示**：发给模型、落库的仍是 raw。
   *                    点选项时 raw 是选项的值（可能是单据 id），显示给用户的是选项标签。
   */
  const submitText = async (raw: string, displayText?: string) => {
    const question = raw.trim();
    const outgoingImages = images.map((img) => img.dataUrl).filter((s) => !!s);
    const outgoingFiles = files.map((f) => ({ filename: f.name, data: f.dataUrl })).filter((f) => !!f.data);
    // 只有附件没有字也放行：「这张图里是谁」「看看这份表」这类问法可能一个字都不打
    if (!question && outgoingImages.length === 0 && outgoingFiles.length === 0) return;
    // 连点闸门：放在**清附件之前**，否则第二次点击会把还没发出去的图清掉
    if (sendingRef.current) return;
    /** 存进对话/发给模型的那句：纯附件时给个占位，否则气泡是空的、历史也看不出发生了什么 */
    const outgoingText = question || (outgoingFiles.length > 0 ? "（见附件）" : "（见图片）");
    /** 本轮有没有附件 —— 答案缓存的开关也看它：对着附件说的答案不该被回放。 */
    const hasAttachments = outgoingImages.length > 0 || outgoingFiles.length > 0;
    /** 记在用户那一轮上的附件（含图片的 blob 预览地址），发完托盘清空后历史里还能看出带了什么。 */
    const turnAttachments = [
      ...images.map((img) => ({ name: img.name, kind: "image" as const, url: img.url })),
      ...files.map((f) => ({ name: f.name, kind: "file" as const })),
    ];

    // 附件随本次请求发出；待发托盘立刻清掉（免得留着让人以为还在队列里）。
    // **图片的 objectURL 不撤销** —— 它要留在这轮气泡里当缩略图；页面卸载时随之外释放。
    setImages(() => []);
    setFiles([]);

    // 缓存命中：同一问题本次会话内直接回放（正文 + 待答问题一起回放）。
    // **带附件那次不进缓存** —— 答案是对着那份附件说的，回放同样的问题只会给出一个不看附件的答案。
    // **后端重启过的不回放**：旧答案是改规则之前算出来的（socket 没连上时 bootId 为 null，此时退化成原行为）
    const hit = hasAttachments ? undefined : answerCacheRef.current.get(question);
    const cached = hit && hit.bootId === getLastAckBootId() ? hit : undefined;
    if (cached != null) {
      setTurns((prev) => [
        ...prev,
        { role: "user", text: question, typed: true },
        { role: "assistant", text: cached.text, typed: true, choiceQueue: cached.choiceQueue },
      ]);
      setQueue(cached.choiceQueue);
      setAnswers([]);
      setCurrent(0);
      setCustomDraft("");
      setDraft("");
      return;
    }

    // 上一轮还在跑：先停掉它。点选项芯片、点发送、敲回车三条入口都汇到这里，口径一致。
    if (sendingRef.current) {
      stopReply();
    }
    const ctrl = new AbortController();
    runRef.current = ctrl;
    beginSend();
    setUsage(null);
    setQueue([]);
    setAnswers([]);
    setCustomDraft("");
    setDraft("");
    pendingNavRef.current = null;
    // 播报视图里发问：这一段就从零开始（不摞上一次的对话），并且把视图交还给对话
    if (broadcastMode) setBroadcastConsumed(true);
    setTurns((prev) => [
      ...(broadcastMode ? [] : prev),
      { role: "user", text: displayText ?? outgoingText, typed: true, attachments: turnAttachments },
      { role: "assistant", text: "", typed: false },
    ]);

    let acc = "";
    /** 本次请求带回的待答问题，逐条收；答完最后一道才把它们合成一条消息发回去 */
    const accQueue: AskQuestion[] = [];
    /** 本轮是不是开了新会话（发完就复位，别让下一条又开一条） */
    const startingNewSession = newSessionRef.current;
    try {
      await streamScanAssistantAsk(
        outgoingText,
        {
          onDelta: (delta) => {
            acc += delta;
          },
          onUsage: (u) => setUsage(u),
          onInteraction: (p) => collectInteraction(p, accQueue),
          // 跳转指令先攒着，等这一轮说完再执行（见 pendingNavRef 的注释）
          onNavigate: (p) => {
            pendingNavRef.current = p;
          },
          onDownload: (p) => {
            pendingDownloadRef.current = p as AssistantDownload;
          },
          /*
           * **立刻挂上去，不压到这一轮结束。**
           *
           * 一轮里可能同时办好几件事（截图 / 导出 / 定时），压到最后等于用户全程看不到任何进展，
           * 只觉得"特别慢、不知道发生了什么"（真机反馈）。事件到了就该在对话里出现一件。
           */
          onImage: (p) => {
            const one: TurnExport = {
              key: `shot${Date.now()}`,
              kind: "screenshot",
              label: p.label,
              exportId: p.exportId,
              path: p.path,
              imageState: "loading",
            };
            setTurns((prev) => {
              const next = prev.slice();
              const lastIndex = next.length - 1;
              const last = next[lastIndex];
              if (last && last.role === "assistant") {
                next[lastIndex] = { ...last, exports: [...(last.exports ?? []), one] };
                return next;
              }
              return [...next, { role: "assistant" as const, text: "", typed: true, exports: [one] }];
            });
            if (p.path) {
              void captureShot(one.key, p.exportId, p.path);
            } else {
              void loadShotBytes(one.key, p.exportId);
            }
          },
          // 长任务进度：running 挂一行「正在截图…」，done 撤掉，failed 留着（那正是要害）
          onTool: (p) => {
            const label = TOOL_BUSY_LABEL[p.name];
            if (!label) return;
            if (p.status === "running") {
              patchLastAssistant({ toolBusy: { label, status: "running" } });
            } else if (p.status === "failed") {
              patchLastAssistant({ toolBusy: { label, status: "failed" } });
            } else {
              patchLastAssistant({ toolBusy: undefined });
            }
          },
          onDone: (payload) => {
            const finalText = (payload.text ?? acc).trim();
            // 带附件那次不进答案缓存：缓存只按问题文本命中，回放它等于给出一个不看附件的答案。
            //
            // **带副作用的那一轮也不进缓存**（跳页 / 下载按钮）：缓存只存文本，回放时那句「下载按钮
            // 已生成」还在、按钮却不在了（用户第二次点「用上次的」就会撞上）。真机 2026-10-09 踩到。
            const producedDirective = Boolean(pendingDownloadRef.current || pendingNavRef.current);
            if (!hasAttachments && !producedDirective) {
              answerCacheRef.current.set(question, {
                text: finalText,
                choiceQueue: accQueue,
                bootId: getLastAckBootId(),
              });
            }
            // 记住会话 id：挂起确认要拿着它去续跑（服务端只认这一个坐标）
            if (typeof payload.sessionId === "number") {
              sessionIdRef.current = payload.sessionId;
            }
            applyStreamResult(payload, acc, accQueue);
          },
          onError: applyStreamError,
        },
        {
          // 续历史会话 / 开新会话 / 带图：三件都走这一条链路，服务端各自校验
          sessionId: startingNewSession ? null : sessionIdRef.current,
          newSession: startingNewSession,
          // 刷卡那次对话是**临时会话**：不进「历史对话」列表（新开由上面的 newSession 保证）
          ephemeral: broadcastMode,
          images: outgoingImages,
          spreadsheets: outgoingFiles,
          contextPage: currentPath,
          signal: ctrl.signal,
        },
      );
      newSessionRef.current = false;
    } catch {
      // 被「停止生成」掐断：中止是有意为之，不是错误 —— 把已收到的部分定稿收尾。
      if (ctrl.signal.aborted) {
        settleStopped(acc.trim());
      }
      // 其余错误已在 onError 兜底
    } finally {
      // 只有「还是当前这一轮」才复位：被停止、或被新一轮顶掉的旧轮，收尾时不许动发送态
      if (runRef.current === ctrl) {
        runRef.current = null;
        endSend();
      }
    }
  };

  /**
   * 回应一次挂起确认（通过 / 驳回 / 取消）。
   *
   * 与 chooseOption 的老路（把选项当一句新消息发出去）**不能混用**：确认必须落到服务端那条
   * 挂起记录上，前端只回传选择值。当成新消息发出去的话，那条待办的调用会被当孤儿丢掉 ——
   * 用户点了「确认执行」，结果什么都没执行，是最难查的一类假成功。
   */
  const submitInteraction = async (token: string, value: string, label: string) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    // 同上：跑着的时候还能点确认（比如前一轮刚挂起）——先停旧的，别让按钮点不动
    if (sendingRef.current) {
      stopReply();
    }
    const ctrl = new AbortController();
    runRef.current = ctrl;
    beginSend();
    setUsage(null);
    // **只把这一个「确认」从队列里拿掉，别整个清空。**
    // 一轮里可能有多个工具各抛一次交互（导出要选维度 + 建定时要确认），点确认只是回答后者；
    // 整个清空会把导出那批**还没答**的问题一起抹掉（真机反馈：导出的选项没了）。
    setQueue((prev) => prev.filter((q) => q.kind !== "confirm"));
    setAnswers([]);
    setCurrent(0);
    setCustomDraft("");
    // 用户那一侧只留他点的那一下，不把内部选项值原样摆出来
    setTurns((prev) => [
      ...prev,
      // 打标：这不是新的一次提问，是接着上面那条回复把没办完的事办完
      { role: "user", text: label, typed: true, isConfirmAnswer: true },
      { role: "assistant", text: "", typed: false },
    ]);

    let acc = "";
    const accQueue: AskQuestion[] = [];
    try {
      await streamAiInteraction(sessionId, token, value, {
        onDelta: (delta) => {
          acc += delta;
        },
        onUsage: (u) => setUsage(u),
        onInteraction: (p) => collectInteraction(p, accQueue),
        onDone: (payload) => applyStreamResult(payload, acc, accQueue),
        onError: applyStreamError,
      }, { signal: ctrl.signal });
    } catch {
      if (ctrl.signal.aborted) {
        settleStopped(acc.trim());
      }
      // 其余错误已在 onError 兜底
    } finally {
      if (runRef.current === ctrl) {
        runRef.current = null;
        endSend();
      }
    }
  };

  /**
   * 选一项。
   *
   * <p>三条路分开，别混：
   * <ul>
   *   <li><b>写操作确认</b>（kind=confirm）：点一下就走，落到服务端那条挂起记录上；</li>
   *   <li><b>只有一问</b>：点一下即办（一问还要先选再按提交，纯属多一步）；</li>
   *   <li><b>多问</b>：进向导 —— 点一下只**高亮**，可来回改，最后按「提交」把整组合成一条消息发出去。</li>
   * </ul>
   */
  const chooseOption = (value: string, label: string) => {
    const q = currentQuestion;
    if (!q) return;
    // 多选题：点一下只勾/取消勾，勾完按「确认」提交（配置类问题就是这种，一次配完）
    if (q.multiSelect) {
      setMultiPick((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
      return;
    }
    if (q.kind === "confirm") {
      const chosen = q.options.find((o) => o.value === value)?.label ?? label;
      void submitInteraction(q.token ?? "", value, chosen);
      return;
    }
    setCustomDraft("");
    if (!wizardMode) {
      setQueue([]);
      setAnswers([]);
      // 发给模型的是选项值；气泡上显示标签 —— 值是单据 id 这类内部标识时尤其需要
      void submitText(value, label);
      return;
    }
    setAnswers((prev) => {
      const next = Array.from({ length: queue.length }, (_, i) => prev[i] ?? "");
      next[safeIndex] = value;
      return next;
    });
    // 选完自动进下一题 —— 否则每一题都得再点一次「下一题」。
    // 自定义回答是例外（见 chooseCustom）：用户可能还要改字，跳走等于把输入框收了。
    if (safeIndex < queue.length - 1) {
      setCurrent(safeIndex + 1);
    }
  };

  /**
   * 多选的「确认」：把勾中的项**一次性**交给模型。
   *
   * <p>气泡上显示标签、发给模型的是值 —— 与单选同一条约定（值可能是内部码：小计层级就是 total/lv1/…）。
   */
  const confirmMulti = () => {
    const q = currentQuestion;
    if (!q || multiPick.length === 0) return;
    const labels = q.options.filter((o) => multiPick.includes(o.value)).map((o) => o.label);
    const raw = multiPick.join(",");
    setQueue([]);
    setAnswers([]);
    setMultiPick([]);
    void submitText(raw, labels.join("、"));
  };

  /** 自定义回答：只落这一题的答案，**不自动跳题** */
  const chooseCustom = () => {
    const text = customDraft.trim();
    if (!text || !currentQuestion) return;
    if (!wizardMode) {
      setCustomDraft("");
      void submitText(text);
      return;
    }
    setAnswers((prev) => {
      const next = Array.from({ length: queue.length }, (_, i) => prev[i] ?? "");
      next[safeIndex] = text;
      return next;
    });
  };

  /** 向导提交：每一题都选好了才让按 */
  const submitAllAnswers = () => {
    if (!allAnswered || sendingRef.current) return;
    const filled = Array.from({ length: queue.length }, (_, i) => answers[i] ?? "");
    setQueue([]);
    setAnswers([]);
    setCurrent(0);
    setCustomDraft("");
    void submitText(composeAnswers(queue, filled), composeAnswers(queue, labelsOf(queue, filled)));
  };

  const goStep = (delta: number) => {
    setCurrent((prev) => Math.min(Math.max(prev + delta, 0), Math.max(queue.length - 1, 0)));
    setCustomDraft("");
  };

  /** 多问时的向导指针：不是「答到第几题」—— 两者分开，才能上一题回去改答案 */
  const safeIndex = queue.length === 0 ? 0 : Math.min(current, queue.length - 1);
  const wizardMode = queue.length > 1;
  const allAnswered = queue.length > 0 && queue.every((_, i) => (answers[i] ?? "").length > 0);
  const currentQuestion: AskQuestion | null = queue.length === 0 ? null : queue[safeIndex];

  // 大窗态自带 left/top/transform，覆盖掉气泡锚点那套拖拽定位
  const anchorStyle: CSSProperties = expanded
    ? ({
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        "--sa-popup-from-x": `${popupFrom?.x ?? 0}px`,
        "--sa-popup-from-y": `${popupFrom?.y ?? 0}px`,
        // 按**当前放大档**算缩放：起点是小卡本身，终点是这一档的宽度。
        // 写死比例会让展开时先瞬间缩小、收起时结尾瞬间弹回小卡。
        "--sa-popup-scale": popupFrom
          ? Math.min(popupFrom.smallWidth / popupWidthFor(zoom), 1)
          : 1,
      } as CSSProperties)
    : positionStyle;

  return (
    <>
      {expanded ? (
        <div
          className={
            closing
              ? "scan-assistant-popup-scrim scan-assistant-popup-scrim--closing"
              : "scan-assistant-popup-scrim"
          }
          onClick={collapseExpanded}
          aria-hidden
        />
      ) : null}

      <div
        ref={anchorRef}
        className={[
          "scan-assistant-bubble-anchor",
          `scan-assistant-bubble-anchor--${placement}`,
          expanded ? "scan-assistant-bubble-anchor--expanded" : "",
          expanded && zoom === 2 ? "scan-assistant-bubble-anchor--expanded-2" : "",
          expanded && !closing && !reducedMotion ? "scan-assistant-bubble-anchor--expanded-in" : "",
          closing ? "scan-assistant-bubble-anchor--expanded-out" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={anchorStyle}
        /* 拖文件到面板上即添加：图片 / xlsx / xls / md / txt 按扩展名自动分流。
           dragover 必须 preventDefault，否则浏览器不给 drop（这是拖拽的硬要求，不是可选项）。 */
        onDragOver={(event) => {
          if (!event.dataTransfer?.types?.includes("Files")) return;
          event.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={(event) => {
          // 只在真正离开面板时收掉提示：拖过子元素也会触发 dragleave，用 relatedTarget 判一下
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer?.types?.includes("Files")) return;
          event.preventDefault();
          setDragging(false);
          pickAttachments(Array.from(event.dataTransfer.files ?? []));
        }}
        onAnimationEnd={(event) => {
          // 卡片自身的入场动画也会冒泡上来，只认落在 anchor 上的那一次
          if (closing && event.target === event.currentTarget) {
            setClosing(false);
            setExpanded(false);
          }
        }}
        /* 后台壳全局右键菜单在此放行，保证输入框能用原生粘贴 */
        data-admin-chrome-ctx-surface
      >
        {dragging ? (
          <div className="scan-assistant-ask__drop-hint" aria-hidden>
            松手即可添加（图片 / Excel / md / txt）
          </div>
        ) : null}
      <ScanAssistantChatCard
        kind="info"
        text=""
        isStreaming={false}
        isAwaitingFirstToken={false}
        isTyping={false}
        placement={placement}
        phase="entering"
        onDismiss={onDismiss}
        dismissLabel="关闭提问"
        askPanel
        // 对话标题就是第一句用户话（与服务端生成的会话标题同源），浮在左上角、不占行
        title={turns.find((t) => t.role === "user" && t.text.trim().length > 0)?.text.trim()}
        actions={
          <>
            <button
              type="button"
              className="scan-assistant-chat-card__action"
              onClick={handleNewChat}
              aria-label="新建对话"
              title="新建对话"
            >
              <SquarePen className="size-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              className="scan-assistant-chat-card__action"
              onClick={() => (historyOpen ? setHistoryOpen(false) : openHistory())}
              aria-label="历史对话"
              title="历史对话"
              aria-expanded={historyOpen}
            >
              <History className="size-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              className="scan-assistant-chat-card__action"
              onClick={!expanded ? openExpanded : zoom === 1 ? zoomIn : collapseExpanded}
              aria-label={!expanded ? "展开为大窗口" : zoom === 1 ? "再放大一级" : "收起为小卡片"}
              aria-expanded={expanded}
            >
              {expanded && zoom === 2 ? (
                <Minimize2 className="size-4" strokeWidth={2} />
              ) : (
                <Maximize2 className="size-4" strokeWidth={2} />
              )}
            </button>
          </>
        }
        footer={
          <>
            {/*
             * 历史对话与当前对话共用同一块位置：开列表就把对话收起来，卡片高度不变，
             * 也不会出现「列表和对话一起往下长、把卡片顶出屏幕」。
             */}
            {historyOpen ? (
              <div className="scan-assistant-ask__sessions">
                <div className="scan-assistant-ask__sessions-head">
                  <span>历史对话</span>
                  <button
                    type="button"
                    className="scan-assistant-ask__choice-action"
                    onClick={() => setHistoryOpen(false)}
                  >
                    返回
                  </button>
                </div>
                {historyLoading ? (
                  <div className="scan-assistant-ask__sessions-empty">读取中…</div>
                ) : (historyList?.length ?? 0) === 0 ? (
                  <div className="scan-assistant-ask__sessions-empty">还没有别的对话</div>
                ) : (
                  <div className="scan-assistant-ask__sessions-items" data-modal-scroll>
                    {(historyList ?? []).map((s) => (
                      <div key={s.id} className="scan-assistant-ask__session-row">
                        <button
                          type="button"
                          className={
                            s.id === sessionIdRef.current
                              ? "scan-assistant-ask__session-item scan-assistant-ask__session-item--active"
                              : "scan-assistant-ask__session-item"
                          }
                          onClick={() => void pickSession(s.id)}
                        >
                          <span className="scan-assistant-ask__session-title">{s.title || "未命名对话"}</span>
                          <span className="scan-assistant-ask__session-time">{fmtSessionTime(s.updatedAt)}</span>
                        </button>
                        {pendingDeleteId === s.id ? (
                          // 两步确认：避免误点把对话删了（壳里 window.confirm 可能被拦）
                          <span className="scan-assistant-ask__session-confirm">
                            <button
                              type="button"
                              className="scan-assistant-ask__session-del-ok"
                              onClick={() => void removeSession(s)}
                            >
                              删除
                            </button>
                            <button
                              type="button"
                              className="scan-assistant-ask__session-del-cancel"
                              onClick={() => setPendingDeleteId(null)}
                            >
                              取消
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="scan-assistant-ask__session-del"
                            aria-label={`删除 ${s.title || "未命名对话"}`}
                            onClick={() => setPendingDeleteId(s.id)}
                          >
                            <X className="size-3" strokeWidth={3} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : displayTurns.length > 0 ? (
              <div
                className={
                  currentQuestion
                    ? "scan-assistant-ask__history scan-assistant-ask__history--with-choices"
                    : "scan-assistant-ask__history"
                }
                ref={historyRef}
                /* 显式声明「这里接滚轮」：卡片是 portal 到 body 的，落在弹窗层之外，
                   modalScrollGuard 本来会把它的滚轮拦掉（真机「卡片里滚不动」）。 */
                data-modal-scroll
                aria-live="polite"
                /*
                 * 模板库下载链接的点击要**接管**：markdown 链接点出去是裸 GET，没有 Authorization 头，
                 * 而那个下载口要 requireStaff —— 直接点只会得到 401。这里改走带 token 的 api，
                 * 拿到 blob 再触发浏览器下载。（模型按工具给的路径原样写链接，路径本身是真的。）
                 */
                onClick={(event) => {
                  const a = (event.target as HTMLElement)?.closest?.("a") as HTMLAnchorElement | null;
                  const href = a?.getAttribute("href") ?? "";
                  /*
                   * 领用单下载链接同理接管。区别：那个下载口是「令牌就是能力」（免登录、可外发），
                   * 但直接点会在浏览器里**开 PDF 预览**而不是存成文件 —— 用户说的是「下载」，
                   * 所以这里取到字节再触发保存，文件名用链文本（模型给的就是归档名）。
                   */
                  const claim = /\/api\/supplies\/claims\/download\/([A-Za-z0-9_-]+)/.exec(href);
                  if (claim) {
                    event.preventDefault();
                    void (async () => {
                      try {
                        const resp = await fetch(`/api/supplies/claims/download/${claim[1]}`);
                        if (!resp.ok) throw new Error(String(resp.status));
                        const text = (a?.textContent ?? "").trim();
                        const fileName = text.toLowerCase().endsWith(".pdf")
                          ? text
                          : `${text || "领用单"}.pdf`;
                        downloadBlob(await resp.blob(), fileName);
                        toast.success("已开始下载");
                      } catch {
                        toast.error("领用单下载失败，链接可能已过期（7 天有效），让助手重新生成一份");
                      }
                    })();
                    return;
                  }
                  const m = /^\/api\/admin\/file-templates\/([^/]+)\/download$/.exec(href);
                  if (!m) return;
                  event.preventDefault();
                  void (async () => {
                    try {
                      const { blob, fileName } = await downloadAdminFileTemplateBlob(
                        m[1],
                        (a?.textContent ?? "下载").trim(),
                      );
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = fileName;
                      link.click();
                      URL.revokeObjectURL(url);
                    } catch {
                      toast.error("下载失败，请到「文件模板库」页面下载");
                    }
                  })();
                }}
              >
                {displayTurns.map((turn, index) => {
                  /*
                   * **产物按 key 全局去重、只显示最后一次出现的那一条**。
                   *
                   * 收拢是"复制"而不是"搬"（见收集处的注释），所以同一条产物可能出现在好几轮上；
                   * 这里保证它**只画一次、且画在最后出现的位置**（也就是这次提问真正收尾的那一轮）。
                   * 顺带让"收拢"这件事可以随便重复执行，不会重复显示、也不会丢。
                   */
                  const isLastOccurrence = (key: string, kind: "e" | "t") => {
                    for (let j = displayTurns.length - 1; j > index; j -= 1) {
                      if (kind === "e") {
                        if ((displayTurns[j].exports ?? []).some((x) => x.key === key)) return false;
                      } else if ((displayTurns[j].timers ?? []).some((x) => String(x.id) === key)) {
                        return false;
                      }
                    }
                    return true;
                  };
                  // 挂起那一轮模型常常一个字都不说（它只调了工具，正文是空的），交互全在下面那张
                  // 选项卡片里。这种回合**不铺空气泡** —— 铺了就是一个空框占位，还容易跟
                  // 「正在思考」混起来；对话一长就堆一片看不出来历的空白。
                  const shownExports = (turn.exports ?? []).filter((one) => isLastOccurrence(one.key, "e"));
                  const shownTimers = (turn.timers ?? []).filter((one) => isLastOccurrence(String(one.id), "t"));
                  if (
                    turn.role === "assistant" &&
                    turn.text.trim().length === 0 &&
                    // 有产物（图/文件/倒计时）的空轮**要画** —— 但要看**去重后还剩没剩**：
                    // 收拢是复制，源轮的产物会被去重掉，那种轮就该当空轮丢掉（不然留个空壳）
                    shownExports.length === 0 &&
                    shownTimers.length === 0 &&
                    // 两种该丢的空轮：① 交互都在下面那张选项卡片里（挂起那轮）；
                    // ② 不是最后一条 —— 同一次提问的附件已经**收拢到最后那条**上，
                    //    留在中间的就是个空壳（真机反馈过会堆一条空白）
                    ((turn.choiceQueue?.length ?? 0) > 0 || index !== displayTurns.length - 1)
                  ) {
                    return null;
                  }
                  return (
                    <div
                      key={index}
                      className={`scan-assistant-ask__row scan-assistant-ask__row--${turn.role}`}
                    >
                      {turn.role === "assistant" ? (
                        <AssistantBubble
                          text={turn.text}
                          type={!turn.typed}
                          meta={index === incomingIndex ? undefined : turn.meta}
                          /* 实时态（计时/token）只属于会话自己的最后一个回合；播报那条不带 */
                          live={
                            index === incomingIndex
                              ? undefined
                              : index === turns.length - 1
                                ? liveMeta
                                : undefined
                          }
                          onTyped={() =>
                            setTurns((prev) => {
                              const next = prev.slice();
                              const last = next[next.length - 1];
                              if (last && last.role === "assistant" && !last.typed) {
                                next[next.length - 1] = { ...last, typed: true };
                              }
                              return next;
                            })
                          }
                        >
                          {turn.toolBusy ? (
                            <div
                              className={`scan-assistant-ask__toolbusy${
                                turn.toolBusy.status === "failed" ? " scan-assistant-ask__toolbusy--failed" : ""
                              }`}
                            >
                              {turn.toolBusy.status === "failed"
                                ? `${turn.toolBusy.label}没成功`
                                : `${turn.toolBusy.label}…`}
                            </div>
                          ) : null}
                          {shownTimers.map((one) => (
                            <TimerChip
                              key={one.id}
                              timer={one}
                              nowMs={nowMs}
                              clockSkewMs={clockSkewMs}
                              onStop={() => void stopTimer(one.id)}
                              onConfirm={() => void confirmTimer(one.id)}
                            />
                          ))}
                          {shownExports.map((one) =>
                            one.kind === "screenshot" ? (
                              <ShotCard
                                key={one.key}
                                shot={one}
                                sub={turn.text.trim().length > 0}
                                onZoom={(url, label) => setZoomShot({ url, label })}
                                onRetake={() => {
                                  if (!one.path) return;
                                  patchShot(one.key, { imageState: "loading" });
                                  void captureShot(one.key, one.exportId, one.path);
                                }}
                              />
                            ) : (
                              <DownloadCard
                                key={one.key}
                                label={one.label}
                                busy={busyDownloadKey === one.key}
                                // 这一轮有正文 = 文件是跟着这句话出来的 → 往里缩一点；
                                // 没正文 = 模型只调了工具，文件自己占一条 → 不缩进。
                                sub={turn.text.trim().length > 0}
                                onDownload={() => void performDownload(one, one.key)}
                              />
                            ),
                          )}
                          {/*
                            刷卡后没绑卡这次的**可点入口**。
                            要点：给按钮而不是在文案里说「弹窗下方有…」——说位置和给按钮体验差一大截；
                            点完还得告诉人下一步（刷卡 → 点确认绑定），否则他点开窗口不知道要干什么。
                          */}
                          {index === incomingIndex && incoming?.unboundCard ? (
                            unboundBindClicked ? (
                              <p className="scan-assistant-ask__unbound-hint">
                                已打开绑卡窗口：让 TA 刷一下卡，再点「确认绑定」就好了
                              </p>
                            ) : (
                              <button
                                type="button"
                                className="scan-assistant-ask__unbound-chip"
                                onClick={() => {
                                  setUnboundBindClicked(true);
                                  onUnboundBind?.(incoming?.personKey ?? "");
                                }}
                              >
                                <CreditCard className="h-3.5 w-3.5" />
                                绑定校园卡
                              </button>
                            )
                          ) : null}
                        </AssistantBubble>
                      ) : (
                        <div className="scan-assistant-ask__user-block">
                          <div className="scan-assistant-ask__bubble scan-assistant-ask__bubble--user">
                            {turn.text}
                          </div>
                          {/*
                           * 把这一轮带出去的附件显示出来。发完托盘就清了，不显示的话历史里只剩一句
                           * 「（见附件）」——回头看根本想不起发的是什么。图片能显示缩略图（blob 还活着）；
                           * 刷新后 blob 失效，退化成图标 + 文件名。
                           */}
                          {turn.attachments?.length ? (
                            <div className="scan-assistant-ask__turn-attachments">
                              {turn.attachments.map((att, i) =>
                                att.kind === "image" && att.url ? (
                                  <img
                                    key={`${att.name}-${i}`}
                                    className="scan-assistant-ask__turn-thumb"
                                    src={att.url}
                                    alt={att.name}
                                    title={att.name}
                                  />
                                ) : (
                                  <span
                                    key={`${att.name}-${i}`}
                                    className="scan-assistant-ask__turn-file"
                                    title={att.name}
                                  >
                                    {att.kind === "image" ? (
                                      <ImagePlus className="size-3" strokeWidth={2} aria-hidden />
                                    ) : (
                                      <Paperclip className="size-3" strokeWidth={2} aria-hidden />
                                    )}
                                    <span className="scan-assistant-ask__turn-file-name">{att.name}</span>
                                  </span>
                                ),
                              )}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {!historyOpen && currentQuestion ? (
              <>
                {/*
                 * 问题头只在**多问**时出现：一道题时正文气泡就在上面，再写一遍是重复；
                 * 多问时才需要「第几问 / 问的是谁·什么」来区分。
                 *
                 * 写操作确认是例外 —— 它**永远**要显示问句（做了什么、什么参数），
                 * 因为这一轮模型没机会先说话，用户唯一能判断的依据就是这行字。
                 */}
                {currentQuestion.kind === "confirm" ? (
                  <div className="scan-assistant-ask__choices-head">
                    {currentQuestion.question ? (
                      <span className="scan-assistant-ask__choices-title scan-assistant-ask__choices-title--confirm">
                        {currentQuestion.question}
                      </span>
                    ) : null}
                  </div>
                ) : queue.length > 1 ? (
                  <div className="scan-assistant-ask__choices-head">
                    <span className="scan-assistant-ask__choices-step">
                      第 {safeIndex + 1}/{queue.length} 问
                    </span>
                    {currentQuestion.question ? (
                      <span className="scan-assistant-ask__choices-title">{currentQuestion.question}</span>
                    ) : null}
                    {/* 翻页贴在问句这一行的右端：它翻的是「问题」，不是选项 */}
                    <span className="scan-assistant-ask__choices-nav">
                      <button
                        type="button"
                        className="scan-assistant-ask__wizard-btn"
                        onClick={() => goStep(-1)}
                        disabled={safeIndex === 0}
                      >
                        上一题
                      </button>
                      <button
                        type="button"
                        className="scan-assistant-ask__wizard-btn"
                        onClick={() => goStep(1)}
                        disabled={safeIndex >= queue.length - 1}
                      >
                        下一题
                      </button>
                    </span>
                  </div>
                ) : null}
                <div className="scan-assistant-ask__choices" role="group" aria-label="请选择">
                  {currentQuestion.options.map((option) => {
                    // 向导里选中的那项要亮着：用户要能一眼看出「我这题选了哪个」
                    const picked = currentQuestion.multiSelect
                      ? multiPick.includes(option.value)
                      : wizardMode && (answers[safeIndex] ?? "") === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={
                          picked
                            ? "scan-assistant-ask__choice scan-assistant-ask__choice--picked"
                            : "scan-assistant-ask__choice"
                        }
                        disabled={sending}
                        aria-pressed={wizardMode ? picked : undefined}
                        onClick={() => chooseOption(option.value, option.label)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                  {currentQuestion.multiSelect ? (
                    <button
                      type="button"
                      className="scan-assistant-ask__choice"
                      disabled={sending || multiPick.length === 0}
                      onClick={confirmMulti}
                    >
                      确认（已选 {multiPick.length} 项）
                    </button>
                  ) : null}
                </div>
                {currentQuestion.kind === "confirm" ? null : (
                  <>
                {/* 自定义回答的输入框紧跟在选项行下面：它答的就是上面那道题，隔一排控件会看不出对应关系 */}
                {/* 自定义回答就摆在选项下面：它也是一项，回车即选中；在向导里和别的选项一起提交 */}
                <form
                  className="scan-assistant-ask__custom"
                  onSubmit={(event) => {
                    event.preventDefault();
                    chooseCustom();
                  }}
                >
                  <input
                    className="scan-assistant-ask__custom-input"
                    value={customDraft}
                    onChange={(event) => setCustomDraft(event.target.value)}
                    placeholder="自定义回答：写出你的答案，点「确认」或按回车"
                    aria-label="自定义回答"
                  />
                  {/*
                   * 确认键：**不能只留回车**。上面那些选项都是点一下就完事，
                   * 到这里突然变成"得知道按回车才算作答"，普通人会以为输入框是死的（真机反馈）。
                   * 走 form 的 submit，与回车同一条 chooseCustom()，行为不会分叉。
                   */}
                  <button
                    type="submit"
                    className="scan-assistant-ask__custom-confirm"
                    disabled={!customDraft.trim()}
                  >
                    确认
                  </button>
                </form>
                {/*
                 * 提交与取消在选项**下方**一行：取消在左、提交在右（右端是这一排的终点）。
                 * 一问没有提交键 —— 点一下即办；写操作确认也没有 —— 它只有执行/不执行两个选项。
                 */}
                <div className="scan-assistant-ask__controls">
                  <button
                    type="button"
                    className="scan-assistant-ask__choice-action"
                    onClick={() => {
                      setQueue([]);
                      setAnswers([]);
                      setCurrent(0);
                      setCustomDraft("");
                    }}
                  >
                    取消本次对话
                  </button>
                  {wizardMode ? (
                    <button
                      type="button"
                      className="scan-assistant-ask__wizard-btn scan-assistant-ask__wizard-btn--primary"
                      onClick={submitAllAnswers}
                      disabled={!allAnswered || sending}
                    >
                      提交（{answers.filter((a) => a).length}/{queue.length}）
                    </button>
                  ) : null}
                </div>
                  </>
                )}
              </>
            ) : null}

            {!historyOpen && images.length > 0 ? (
              <div className="scan-assistant-ask__attachments">
                {images.map((img) => (
                  <div key={img.url} className="scan-assistant-ask__attachment">
                    <img src={img.url} alt={img.name} />
                    <button
                      type="button"
                      className="scan-assistant-ask__attachment-remove"
                      onClick={() => removeImage(img.url)}
                      aria-label={`移除 ${img.name}`}
                    >
                      <X className="size-3" strokeWidth={3} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {/*
             * 表格/文本附件单独一排：它们**发出去的方式和图片不同**（服务端解析后落库，
             * 消息里只拼预览、后续追问仍看得见），所以不跟缩略图混在一行里 —— 混了用户也看不出区别，
              却在「为什么这条历史还认得那份表」上被绕晕。
             */}
            {!historyOpen && files.length > 0 ? (
              <div className="scan-assistant-ask__attachments">
                {files.map((f) => (
                  <div key={f.name} className="scan-assistant-ask__filechip" title={f.name}>
                    <FileSpreadsheet className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
                    <span className="scan-assistant-ask__filechip-name">{f.name}</span>
                    <span className="scan-assistant-ask__filechip-size">{fmtBytes(f.size)}</span>
                    <button
                      type="button"
                      className="scan-assistant-ask__filechip-remove"
                      onClick={() => removeFile(f.name)}
                      aria-label={`移除 ${f.name}`}
                    >
                      <X className="size-3" strokeWidth={3} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {/* 看历史时把输入条收起来 —— 这一屏是「翻旧对话」，不该同时留个提问框（旁边几个块都这么门控）。 */}
            {!historyOpen ? (
            <form
              className="scan-assistant-ask"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              {/*
                附件来源二选一。挂在 form 里用绝对定位浮在输入行上方 —— 放进文档流会把整块卡片顶高，
                点一下弹一下的观感很跳。
              */}
              {attachSource !== "closed" ? (
                <div className="scan-assistant-ask__attach-menu" role="menu" aria-label="附件来源">
                  {attachSource === "choose" ? (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        className="scan-assistant-ask__attach-menu-item"
                        onClick={() => {
                          setAttachSource("closed");
                          attachInputRef.current?.click();
                        }}
                      >
                        从本机选择
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="scan-assistant-ask__attach-menu-item"
                        disabled={libLoading}
                        onClick={() => {
                          setAttachSource("library");
                          void loadLibrary();
                        }}
                      >
                        {libLoading ? "读取模板库…" : "从文件模板库选择"}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="scan-assistant-ask__attach-menu-item scan-assistant-ask__attach-menu-item--muted"
                        onClick={() => setAttachSource("closed")}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="scan-assistant-ask__attach-menu-head">
                        文件模板库{libRows ? `（${libRows.length}）` : ""}
                      </div>
                      <div className="scan-assistant-ask__attach-menu-list">
                        {libRows === null ? (
                          <div className="scan-assistant-ask__attach-menu-empty">读取中…</div>
                        ) : libRows.length === 0 ? (
                          <div className="scan-assistant-ask__attach-menu-empty">库里还没有文件</div>
                        ) : (
                          libRows.map((row) => (
                            <button
                              key={row.id}
                              type="button"
                              role="menuitem"
                              className="scan-assistant-ask__attach-menu-item"
                              title={row.originalName}
                              onClick={() => void pickFromLibrary(row)}
                            >
                              <span className="scan-assistant-ask__attach-menu-name">{row.originalName}</span>
                              <span className="scan-assistant-ask__attach-menu-size">{fmtBytes(row.sizeBytes)}</span>
                            </button>
                          ))
                        )}
                      </div>
                      <button
                        type="button"
                        role="menuitem"
                        className="scan-assistant-ask__attach-menu-item scan-assistant-ask__attach-menu-item--muted"
                        onClick={() => setAttachSource("choose")}
                      >
                        返回
                      </button>
                    </>
                  )}
                </div>
              ) : null}
              <textarea
                ref={textareaRef}
                className="scan-assistant-ask__input"
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Enter 发送、Shift+Enter 换行；输入法选词那一下回车不算
                  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  submit();
                }}
                placeholder={sending ? "正在回复…" : "向我提问…"}
                aria-label="向智能助手提问"
                autoFocus
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="scan-assistant-ask__file"
                onChange={(event) => {
                  pickImages(Array.from(event.target.files ?? []));
                  event.target.value = ""; // 清空才能再选同一张
                }}
                tabIndex={-1}
                aria-hidden
              />
              <button
                type="button"
                className="scan-assistant-ask__attach"
                onClick={() => fileInputRef.current?.click()}
                aria-label="上传图片"
                title="上传图片"
              >
                <ImagePlus className="size-4" strokeWidth={2} />
              </button>
              {/*
                附件按钮与图片按钮分开：两者**去向不同** —— 图片走视觉通道（只发本轮），
                表格/文本由服务端解析落库（后续追问仍看得见）。合成一个按钮用户就分不清
                「我发的这份东西会变成什么」，所以宁可多一个按钮。
              */}
              <input
                ref={attachInputRef}
                type="file"
                accept=".xlsx,.xls,.md,.markdown,.txt"
                multiple
                className="scan-assistant-ask__file"
                onChange={(event) => {
                  pickDocs(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
                tabIndex={-1}
                aria-hidden
              />
              <button
                type="button"
                className="scan-assistant-ask__attach"
                onClick={() => setAttachSource(attachSource === "closed" ? "choose" : "closed")}
                aria-label="上传附件"
                aria-expanded={attachSource !== "closed"}
                title="上传附件（Excel / PDF / Word / md / txt）"
              >
                <Paperclip className="size-4" strokeWidth={2} />
              </button>
              {/*
                发送 / 停止共用这一个位置：
                - **在跑且输入框空着** → 停止（点一下掐掉这一轮，按钮立刻回到发送）
                - 其余（含「在跑但已经打了字」）→ 发送：用户打了字就是想发，这时要让他发得出去，
                  而不是对着一个点不动的键。删除输入内容后自然又回到停止。
              */}
              {sending && !canSend ? (
                <button
                  type="button"
                  className="scan-assistant-ask__send scan-assistant-ask__send--stop"
                  onClick={stopReply}
                  aria-label="停止生成"
                  title="停止生成"
                >
                  <Square className="size-4" strokeWidth={2} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  className="scan-assistant-ask__send"
                  disabled={!canSend}
                  aria-label="发送"
                >
                  <SendHorizonal className="size-4" strokeWidth={2} />
                </button>
              )}
            </form>
            ) : null}
          </>
        }
      />
      </div>

      {/* 点图放大：铺满一屏、再点关掉。点背景关闭之外没有别的操作，所以不需要标题栏和按钮。 */}
      {zoomShot ? (
        <div className="scan-assistant-zoom" onClick={() => setZoomShot(null)} role="dialog" aria-label="查看大图">
          <img className="scan-assistant-zoom__img" src={zoomShot.url} alt={zoomShot.label} />
          <span className="scan-assistant-zoom__hint">点任意处关闭</span>
        </div>
      ) : null}
    </>
  );
}
