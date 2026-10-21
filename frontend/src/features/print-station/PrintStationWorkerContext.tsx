import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { APP_BUILD_ID, resolveSocketUrl, SOCKET_IO_CLIENT_OPTIONS } from "@/config/socketUrl";
import { SOCKET_CLIENT_FORCE_RELOAD } from "@/config/socketEvents";
import { authStorage, AUTH_USERINFO_UPDATED_EVENT } from "@/features/auth/authStorage";
import {
  ackPrintJob,
  claimPrintJob,
  fetchMyPrintJobs,
  fetchMyStation,
  fetchPendingCount,
  fetchPrintJobFile,
  type MyStation,
  type PrintJob,
} from "@/api/domains/print.api";
import { PdfPrintCanvas } from "./PdfPrintCanvas";
import { sniffBlobKind } from "./printableTypes";

const POLL_MS = 15000;
const PRINT_SETTLE_MS = 8000;

type WorkerState = {
  station: MyStation | null;
  stationError: string;
  current: PrintJob | null;
  blobKind: "pdf" | "image" | null;
  imageUrl: string | null;
  /** 当前任务渲染出来的每页图片（dataURL / objectURL），预览与出纸共用 */
  pages: string[];
  lastPrinted: boolean;
  recent: PrintJob[];
  pending: number;
  connected: boolean;
  message: string;
};

const EMPTY: WorkerState = {
  station: null,
  stationError: "",
  current: null,
  blobKind: null,
  imageUrl: null,
  pages: [],
  lastPrinted: false,
  recent: [],
  pending: 0,
  connected: false,
  message: "",
};

const Ctx = createContext<WorkerState>(EMPTY);

export function usePrintStationWorker(): WorkerState {
  return useContext(Ctx);
}

/**
 * 工位打印 worker：**挂在后台壳层**，不再绑定 /console/admin/print-station 页面。
 *
 * 只要当前账号绑定了打印工位，任何后台页面开着都会领取并执行打印任务；
 * 工位页只负责展示状态。页面不在工位页也能出纸，靠的就是这一层。
 */
export function PrintStationWorkerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkerState>(EMPTY);
  const [sessionKey, setSessionKey] = useState(0);

  const fileRef = useRef<Blob | null>(null);
  const currentRef = useRef<PrintJob | null>(null);
  const pageSizeRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const printedJobRef = useRef<string | null>(null);

  const patch = useCallback((p: Partial<WorkerState>) => {
    setState((prev) => ({ ...prev, ...p }));
  }, []);

  // 换账号/重新登录后重新初始化（工位绑定跟着账号走）
  useEffect(() => {
    const onUser = () => setSessionKey((k) => k + 1);
    window.addEventListener(AUTH_USERINFO_UPDATED_EVENT, onUser);
    return () => window.removeEventListener(AUTH_USERINFO_UPDATED_EVENT, onUser);
  }, []);

  const refreshRecent = useCallback(async () => {
    try {
      const [jobs, n] = await Promise.all([fetchMyPrintJobs(20), fetchPendingCount()]);
      patch({ recent: jobs, pending: n });
    } catch {
      /* 列表刷新失败不该打断打印 */
    }
  }, [patch]);

  const settle = useCallback(
    async (job: PrintJob, ok: boolean, err?: string) => {
      busyRef.current = false;
      try {
        await ackPrintJob(job.id, ok, err);
      } catch {
        /* 回执失败交给超时调度兜底 */
      }
      patch({ message: ok ? `已提交打印：${job.fileName}` : `打印失败：${err ?? job.fileName}` });
      if (ok) {
        patch({ lastPrinted: true });
      } else {
        currentRef.current = null;
        fileRef.current = null;
        patch({ current: null, blobKind: null, imageUrl: null, pages: [] });
      }
      await refreshRecent();
    },
    [patch, refreshRecent],
  );

  const drainOne = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    let claimed = false;
    try {
      const job = await claimPrintJob();
      if (!job) return;
      claimed = true;
      printedJobRef.current = null;
      currentRef.current = job;
      fileRef.current = null;
      patch({
        lastPrinted: false,
        current: job,
        blobKind: null,
        imageUrl: null,
        pages: [],
        message: `正在准备 ${job.fileName}`,
      });
      try {
        const blob = await fetchPrintJobFile(job.id);
        const kind = await sniffBlobKind(blob);
        if (kind === "unsupported") {
          const head = new Uint8Array(await blob.slice(0, 1).arrayBuffer());
          await settle(
            job,
            false,
            head[0] === 0x7b ? "源文件已不存在（一次性打印的文件打完即删，无法重推）" : "收到的内容既不是 PDF 也不是图片，无法打印",
          );
          return;
        }
        fileRef.current = blob;
        patch({ blobKind: kind });
      } catch (e) {
        await settle(job, false, e instanceof Error ? e.message : "取文件失败");
      }
    } catch {
      /* 领任务失败（断网等）下轮再试 */
    } finally {
      if (!claimed) busyRef.current = false;
    }
  }, [patch, settle]);

  /**
   * 多页放同一个 iframe，按 div 分页；每份只调一次 print。
   * 旧实现一页一次 print，卡片多时会连续闪屏。
   */
  const printViaIframe = (images: string[], size: string | null): Promise<HTMLIFrameElement> =>
    new Promise((resolve, reject) => {
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
      document.body.appendChild(frame);
      try {
        const doc = frame.contentDocument;
        if (!doc) throw new Error("无法创建打印文档");
        const sizeCss = size ? `size:${size};` : "";
        const pagesHtml = images
          .map((src) => `<div class="pg"><img src="${src}" alt="" /></div>`)
          .join("");
        doc.open();
        doc.write(
          `<!doctype html><html><head><meta charset="utf-8"><style>` +
            `@page{${sizeCss}margin:0}` +
            `html,body{margin:0;padding:0}` +
            `.pg{page-break-after:always;break-after:page;margin:0;padding:0}` +
            `.pg:last-child{page-break-after:auto;break-after:auto}` +
            `.pg img{width:100%;height:auto;display:block}` +
            `</style></head><body>${pagesHtml}</body></html>`,
        );
        doc.close();

        const list = Array.from(doc.images);
        Promise.all(
          list.map((im) => (im.complete ? Promise.resolve() : im.decode().catch(() => undefined))),
        )
          .then(() => {
            const win = frame.contentWindow;
            if (!win) throw new Error("打印窗口不可用");
            let settled = false;
            const done = () => {
              if (settled) return;
              settled = true;
              win.removeEventListener("afterprint", done);
              resolve(frame);
            };
            win.addEventListener("afterprint", done);
            win.focus();
            win.print();
            setTimeout(done, PRINT_SETTLE_MS);
          })
          .catch(reject);
      } catch (e) {
        reject(e);
      }
    });

  const onPrintableReady = useCallback(
    async (images: string[]) => {
      const job = currentRef.current;
      if (!job || images.length === 0) return;
      if (printedJobRef.current === job.id) return;
      printedJobRef.current = job.id;
      const copies = Math.max(1, Math.min(job.copies || 1, 99));
      const frames: HTMLIFrameElement[] = [];
      try {
        for (let c = 0; c < copies; c++) {
          if (copies > 1) patch({ message: `正在打印 ${job.fileName}（${c + 1} / ${copies} 份）` });
          frames.push(await printViaIframe(images, pageSizeRef.current));
        }
        await settle(job, true);
      } catch (e) {
        await settle(job, false, e instanceof Error ? e.message : "调起打印失败");
      } finally {
        setTimeout(() => frames.forEach((f) => f.remove()), 3000);
      }
    },
    [patch, settle],
  );

  const handlePages = useCallback(
    (images: string[]) => {
      patch({ pages: images });
      void onPrintableReady(images);
    },
    [patch, onPrintableReady],
  );

  // 图片：转 objectURL，离屏 <img> onLoad 后再打
  useEffect(() => {
    const file = fileRef.current;
    if (!file || state.blobKind !== "image") return;
    const url = URL.createObjectURL(file);
    patch({ imageUrl: url, pages: [url] });
    return () => URL.revokeObjectURL(url);
  }, [state.blobKind, state.current, patch]);

  useEffect(() => {
    const token = authStorage.getToken();
    if (!token) {
      setState(EMPTY);
      return;
    }
    let disposed = false;
    let socket: Socket | null = null;
    let timer: number | null = null;

    void (async () => {
      let myStation: MyStation;
      try {
        myStation = await fetchMyStation();
      } catch (e) {
        // 不是工位账号：保持静默，任何页面都不受影响
        patch({ stationError: e instanceof Error ? e.message : "取工位配置失败" });
        return;
      }
      if (disposed) return;
      pageSizeRef.current = myStation.pageSize ?? null;
      patch({ station: myStation, stationError: "" });
      void refreshRecent();
      void drainOne();

      socket = io(resolveSocketUrl(), {
        ...SOCKET_IO_CLIENT_OPTIONS,
        query: { token, v: APP_BUILD_ID, channel: "station" },
      });
      socket.on("connect", () => patch({ connected: true }));
      socket.on("disconnect", () => patch({ connected: false }));
      socket.on("PRINT_JOB", () => void drainOne());
      socket.on(SOCKET_CLIENT_FORCE_RELOAD, () => window.location.reload());

      timer = window.setInterval(() => void drainOne(), POLL_MS);
    })();

    return () => {
      disposed = true;
      if (timer != null) window.clearInterval(timer);
      socket?.disconnect();
      busyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const pdfBlob = state.blobKind === "pdf" ? fileRef.current : null;

  return (
    <Ctx.Provider value={state}>
      {children}
      {/* 离屏渲染：预览与出纸共用这批页面图，页面切走也不影响打印 */}
      <div
        aria-hidden
        style={{ position: "fixed", left: -100000, top: 0, width: 800, pointerEvents: "none" }}
      >
        {state.current && pdfBlob ? (
          <PdfPrintCanvas
            key={state.current.id}
            blob={pdfBlob}
            onReady={handlePages}
            onError={(msg) => {
              const job = currentRef.current;
              if (job) void settle(job, false, `PDF 渲染失败：${msg}`);
            }}
          />
        ) : null}
        {state.current && state.blobKind === "image" && state.imageUrl ? (
          <img
            key={state.current.id}
            src={state.imageUrl}
            alt=""
            onLoad={() => void onPrintableReady([state.imageUrl as string])}
          />
        ) : null}
      </div>
    </Ctx.Provider>
  );
}
