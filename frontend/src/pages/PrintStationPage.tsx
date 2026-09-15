import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { APP_BUILD_ID, resolveSocketUrl, SOCKET_IO_CLIENT_OPTIONS } from "@/config/socketUrl";
import { SOCKET_CLIENT_FORCE_RELOAD } from "@/config/socketEvents";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { authStorage } from "@/features/auth/authStorage";
import {
  ackPrintJob,
  claimPrintJob,
  fetchMyPrintJobs,
  fetchMyStation,
  fetchPendingCount,
  fetchPrintJobFile,
  type PrintJob,
} from "@/api/domains/print.api";
import { PdfPrintCanvas } from "@/features/print-station/PdfPrintCanvas";
import { sniffBlobKind } from "@/features/print-station/printableTypes";
import { printStatusOf } from "@/features/print-station/printStatus";

/**
 * 兜底轮询间隔。socket 只降延迟，正确性靠它 ——
 * 断网、刷新页面、服务端重启，任务都还在 PENDING 里等人领。
 */
const POLL_MS = 15000;

/** 等 afterprint 的兜底上限：万一某些环境不派发该事件，也不能把工位卡死 */
const PRINT_SETTLE_MS = 8000;

function fmtTime(v: string | null | undefined) {
  if (!v) return "";
  return v.length > 19 ? v.slice(0, 19) : v;
}

/** 当前登录的用户名。只在排障横幅里用 —— 出问题时第一件事就是「现在是谁在登录」。 */
function currentUsername(): string {
  try {
    const raw = localStorage.getItem("auth_user_info");
    if (!raw) return "（没有登录信息）";
    const o = JSON.parse(raw) as { username?: string };
    return o.username ?? "（未知）";
  } catch {
    return "（读不出）";
  }
}

/**
 * 打印工位页。工位电脑常开此页，用专用账号登录。
 *
 * 这一页要回答现场的人三个问题：**现在在打什么**（文件名 + 备注 + 第几份）、
 * **后面还排着几件**、**刚才有没有打砸**。所以除了任务本身，
 * 还显示派发人写的备注、份数，以及排队计数。
 */
export default function PrintStationPage() {
  const [stationName, setStationName] = useState("");
  /** 本工位的纸张尺寸。为空则不打 @page size，用驱动默认 —— 桌面 A4 就该留空 */
  const [pageSize, setPageSize] = useState<string | null>(null);
  const [current, setCurrent] = useState<PrintJob | null>(null);
  const [file, setFile] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  /**
   * 收到的文件按**内容**判定的类型。
   * 不能看扩展名：Word 在上传时已被服务端转成 PDF，但 file_name 还是 .docx。
   */
  const [blobKind, setBlobKind] = useState<"pdf" | "image" | null>(null);
  const [recent, setRecent] = useState<PrintJob[]>([]);
  const [pending, setPending] = useState(0);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  /**
   * 当前挂着的打印内容是否已经打完了。
   *
   * 打完**不清 DOM**：kiosk 模式下 window.print() 立刻返回，光栅化在后面异步做，
   * 这时把内容摘掉打印机就取到一张白纸（实测踩过）。所以内容一直留到下一件任务领到才替换，
   * 这个标记只用来表达「现在挂着的是上一件，不是进行中」。
   */
  const [lastPrinted, setLastPrinted] = useState(false);
  /**
   * 左侧预览是否展开。
   * 新任务进来时自动展开（现场的人得看见要打的是什么），也可以收起，
   * 把宽度让给右边的队列表格 —— 空闲时预览是纯占地方。
   */
  const [previewOpen, setPreviewOpen] = useState(true);
  /**
   * 工位自身的配置拿不到时的原因。
   *
   * 这一条以前是静默的 —— 页面只显示一个红点，看不出到底是没登录、
   * 登录的不是工位账号、还是后端连不上。实测排查时为此白花过时间，
   * 所以现在把服务端的原始报错直接摆出来。
   */
  const [stationError, setStationError] = useState("");
  const busyRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const navigate = useNavigate();

  /**
   * 清掉当前会话回到登录页，登完再跳回本页。
   *
   * 工位机是无人值守的，会话一坏（token 过期、登错账号）就得能在**这一个页面里**
   * 自己救回来 —— 不然得让人知道去哪个别的地址登录。返回地址走 location.state.from，
   * 这是登录页本来就认的字段（AuthGuard 也是这么传的）。
   */
  const relogin = useCallback(() => {
    authStorage.clear();
    socketRef.current?.disconnect();
    navigate("/", { replace: true, state: { from: { pathname: "/console/admin/print-station" } } });
  }, [navigate]);

  const refreshRecent = useCallback(async () => {
    try {
      const [jobs, n] = await Promise.all([fetchMyPrintJobs(20), fetchPendingCount()]);
      setRecent(jobs);
      setPending(n);
    } catch {
      /* 列表刷新失败不该打断打印 */
    }
  }, []);

  /** 收尾：回执 + 复位。PRINTED 的语义是「已交给打印队列」，不是「纸张已出」。 */
  const settle = useCallback(
    async (job: PrintJob, ok: boolean, err?: string) => {
      // 先放开重入锁：从「领到任务」到这里的整段，是工位页不允许再领第二条的窗口。
      // 放这里而不是最末尾，是为了兜住后面任何一步抛异常 —— 锁不释放工位就停摆了。
      busyRef.current = false;
      try {
        await ackPrintJob(job.id, ok, err);
      } catch {
        /* 回执失败交给超时调度兜底 */
      }
      setMessage(ok ? `已提交打印：${job.fileName}` : `打印失败：${err ?? job.fileName}`);
      if (ok) {
        // 成功时**刻意不清** current/file —— 打印内容必须留在 DOM 里，
        // 直到浏览器把这一页光栅化完（见 lastPrinted 的说明）。
        // 内容留到下一件任务领到时再替换。
        setLastPrinted(true);
      } else {
        setCurrent(null);
        setFile(null);
        setBlobKind(null);
        setImageUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      }
      await refreshRecent();
    },
    [refreshRecent],
  );

  /** 领一条 → 取文件。一次只处理一条。 */
  const drainOne = useCallback(async () => {
    // busyRef 从「领到任务」一直持到 settle，**不是**只锁住那一次网络请求。
    // 只锁请求的话：领到任务后 setCurrent 是异步的，state 生效前若再来一次
    // drainOne（socket 推送 + 15s 轮询 会同时触发），它看到 current 还是旧的 null，
    // 就再领一条 —— 实测一次派 4 条时 4 条全被领走、卡在 SENT 谁也不打。
    if (busyRef.current) return;
    busyRef.current = true;
    let claimed = false;
    try {
      const job = await claimPrintJob();
      if (!job) return;
      claimed = true;
      // 新任务来了才替换掉上一件残留的打印内容
      setLastPrinted(false);
      setPreviewOpen(true);
      setCurrent(job);
      setBlobKind(null);
      setImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setFile(null);
      setMessage(`正在准备 ${job.fileName}`);
      // 这里不按文件名判断 —— Word/Excel 在上传时已被服务端转成 PDF，
      // 但 file_name 还是 .docx，看扩展名会把一个真 PDF 判成"不支持"。
      try {
        const blob = await fetchPrintJobFile(job.id);
        const kind = await sniffBlobKind(blob);
        if (kind === "unsupported") {
          // 服务端在文件已不存在时回的是 JSON 业务错误（HTTP 200 + success:false）。
          // 不辨别就喂给 pdf.js，会报出驴唇不对马嘴的「Invalid PDF structure」。
          // JSON 以 { 开头，据此把两种原因分开说。
          const head = new Uint8Array(await blob.slice(0, 1).arrayBuffer());
          const looksJson = head[0] === 0x7b;
          await settle(
            job,
            false,
            looksJson
              ? "源文件已不存在（一次性打印的文件打完即删，无法重推）"
              : "收到的内容既不是 PDF 也不是图片，无法打印",
          );
          return;
        }
        setBlobKind(kind);
        setFile(blob);
      } catch (e) {
        await settle(job, false, e instanceof Error ? e.message : "取文件失败");
      }
    } catch {
      /* 领任务失败（断网等）下轮再试 */
    } finally {
      // 领到了就交给 settle 放开；没领到（空队列 / 抛错）立刻放开，别把工位锁死
      if (!claimed) busyRef.current = false;
    }
  }, [settle]);

  /**
   * 在**独立的隐藏 iframe** 里打印，而不是直接 window.print() 当前页面。
   *
   * 为什么绕这一圈：工位页挂在管理后台壳里，直接打当前页面就得靠 CSS 把侧栏顶栏
   * 全隐藏掉，还得跟 `position:absolute` 的定位祖先把位置算对 —— 实测排版不可控，
   * 并且打印内容一旦从 DOM 卸载就打出白纸。iframe 的文档**就是**全部输出，
   * 与页面样式、后台壳、React 的挂载/卸载全都无关。
   *
   * **返回 iframe 而不在这里移除它**：`afterprint` 触发 ≠ 浏览器已经光栅化完，
   * 此时把 iframe 摘掉会把还没画完的那一页一起带走（实测表现就是"多页只出第一张"）。
   * 由调用方在整批打完后统一清理。
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
        const imgs = images.map((src) => `<img src="${src}" alt="" />`).join("");
        doc.open();
        doc.write(
          `<!doctype html><html><head><meta charset="utf-8"><style>` +
            `@page{${sizeCss}margin:0}` +
            `html,body{margin:0;padding:0}` +
            // 一个 iframe 只放一页，所以不需要任何分页规则 —— 那次踩过的坑就是
            // 把多页塞进来靠 break-before 分页，结果只出第一张。
            `img{width:100%;height:auto;display:block}` +
            `</style></head><body>${imgs}</body></html>`,
        );
        doc.close();

        // 图片没解码完就打印会出空白 —— iframe 里也要等
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
              resolve(frame); // ← 不移除，交给调用方
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

  /**
   * 渲染完成 → 调起打印 → 回执。
   *
   * **一页一个 iframe**：多页塞进同一个 iframe 靠 CSS `break-before: page` 分页，
   * 实测只出第一张。改成逐页打印，每次调用只产生一张纸，不依赖浏览器怎么处理分页符。
   * 份数在外层：打 3 份 2 页的 = 6 次打印调用 = 6 张纸。
   *
   * 中途某次失败会少打一份 —— 回执只能记整条任务的结果，这一层粒度报不出去。
   */
  const onPrintableReady = useCallback(
    async (images: string[]) => {
      if (!current || images.length === 0) return;
      const copies = Math.max(1, Math.min(current.copies || 1, 99));
      const total = copies * images.length;
      const frames: HTMLIFrameElement[] = [];
      let done = 0;
      try {
        for (let c = 0; c < copies; c++) {
          for (const page of images) {
            done++;
            if (total > 1) {
              setMessage(`正在打印 ${current.fileName}（${done} / ${total} 张）`);
            }
            frames.push(await printViaIframe([page], pageSize));
          }
        }
        await settle(current, true);
      } catch (e) {
        await settle(current, false, e instanceof Error ? e.message : "调起打印失败");
      } finally {
        // 整批打完再统一摘 iframe，且留一段宽限期：打印调用返回 ≠ 已经画完
        setTimeout(() => frames.forEach((f) => f.remove()), 3000);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, settle, pageSize],
  );

  // 图片走 <img> 路径：转成 objectURL 等 onLoad 后再打
  useEffect(() => {
    if (!current || !file || blobKind !== "image") return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [current, file, blobKind]);

  useEffect(() => {
    void refreshRecent();
    void drainOne();
    void fetchMyStation()
      .then((s) => {
        setStationName(s.name ?? "");
        setPageSize(s.pageSize ?? null);
        setStationError("");
      })
      .catch((e: unknown) => {
        setStationError(e instanceof Error ? e.message : "取工位配置失败");
      });

    const token = authStorage.getToken();
    if (!token) return;

    // 必须自建连接：共享 socket 握手时不带 channel=station，进不了工位房间
    const socket = io(resolveSocketUrl(), {
      ...SOCKET_IO_CLIENT_OPTIONS,
      query: { token, v: APP_BUILD_ID, channel: "station" },
    });
    socketRef.current = socket;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("PRINT_JOB", () => void drainOne());
    // 远程刷新：部署或改配置后，管理员在后台点一下就重启这个页面，
    // 不用跑到机器前按 F5。工位机通常是无人值守的，这一条很省事。
    // 注意工位页用的是自己的 socket，共享 socket 上那套处理它收不到。
    socket.on(SOCKET_CLIENT_FORCE_RELOAD, () => {
      window.location.reload();
    });

    const timer = setInterval(() => void drainOne(), POLL_MS);
    return () => {
      clearInterval(timer);
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const printable = Boolean(current && file) && (blobKind === "pdf" || Boolean(imageUrl));
  const copies = current?.copies ?? 1;

  return (
    <AdminPageShell>
      <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[420px] flex-col gap-3">
        {/* 顶栏：连接状态、排队数、预览开关。常驻不滚 */}
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <span className={`inline-block size-3 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <h1 className="text-lg font-semibold">打印工位{stationName ? `：${stationName}` : ""}</h1>
          <span className="text-sm opacity-60">{connected ? "已连接" : "未连接（仍在轮询兜底）"}</span>
          {pending > 0 ? (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[13px]">
              后面还排着 <b>{pending}</b> 件
            </span>
          ) : (
            <span className="text-[13px] opacity-50">队列是空的</span>
          )}
          {/* 开关只在真的能预览时才出现 —— 没东西可预览就没得收 */}
          {printable ? (
            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              className="ml-auto rounded-md border border-[var(--app-color-border-default)] px-3 py-1.5 text-[13px] text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]"
            >
              {previewOpen ? "收起预览" : "展开预览"}
            </button>
          ) : null}
        </div>

        {stationError || !connected ? (
          <div className="shrink-0 rounded border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm">
            <div className="font-semibold text-red-700">这个页面现在不能收打印任务</div>
            {stationError ? <div className="mt-1 text-red-700">{stationError}</div> : null}
            <div className="mt-1 text-[12px] text-red-700">
              当前登录账号：<code className="rounded bg-white px-1">{currentUsername()}</code>
              {!connected ? " · socket 没连上，多半是登录态失效了" : ""}
            </div>
            <div className="mt-1 text-[12px] text-red-600">
              换一个**绑定了打印工位**的账号登录即可。点下面的按钮，登录完会自动跳回本页。
            </div>
            <button
              type="button"
              onClick={relogin}
              className="mt-2 rounded-md border border-red-600 bg-white px-3 py-1.5 text-[13px] font-medium text-red-700 transition hover:bg-red-600 hover:text-white"
            >
              退出并重新登录
            </button>
          </div>
        ) : null}

        {message ? <div className="shrink-0 rounded bg-gray-100 px-3 py-2 text-sm">{message}</div> : null}

        {/* 左：预览（可收起）｜右：当前任务 + 队列。
            预览收起时右栏自动占满整行 —— 空闲时预览纯占地方。
            注意预览是纯给人看的：真正的打印走独立 iframe（printViaIframe），
            输出与这块 DOM 无关，打不打得到它说了不算。 */}
        <div className="flex min-h-0 flex-1 gap-3">
          {printable && current && previewOpen ? (
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-[var(--app-color-border-default)] bg-white p-3">
              {blobKind === "pdf" && file ? (
                <PdfPrintCanvas
                  blob={file}
                  onReady={(urls) => void onPrintableReady(urls)}
                  onError={(msg) => {
                    // 渲染失败立刻回执 FAILED，而不是干等超时调度 ——
                    // 否则后台只看到「超时未回执」，真正的原因留不下来。
                    if (current) void settle(current, false, `PDF 渲染失败：${msg}`);
                  }}
                />
              ) : imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  style={{ width: "100%", display: "block" }}
                  onLoad={() => void onPrintableReady([imageUrl])}
                />
              ) : null}
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-y-contain">
        {/* 当前任务：现场的人靠这块知道手上这叠纸是什么 */}
        {current ? (
          <div
            className={
              "mb-5 rounded border-l-4 px-4 py-3 " +
              (lastPrinted ? "border-gray-300 bg-gray-50" : "border-blue-500 bg-blue-50")
            }
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-semibold">{current.fileName}</span>
              {copies > 1 ? (
                <span className="rounded bg-white px-2 py-0.5 text-[12px]">共 {copies} 份</span>
              ) : null}
              {lastPrinted ? (
                <span className="rounded bg-white px-2 py-0.5 text-[12px] text-gray-500">已提交打印</span>
              ) : null}
            </div>
            {current.note ? (
              <div className="mt-1 text-[13px] text-gray-700">备注：{current.note}</div>
            ) : null}
            <div className="mt-1 text-[12px] text-gray-500">
              派发人 {current.createdByName || current.createdBy || "—"} · {fmtTime(current.createdAt)}
            </div>
          </div>
        ) : null}

        <h2 className="mb-2 text-sm font-semibold">最近任务</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs opacity-60">
            <tr>
              <th className="py-1">文件</th>
              <th className="py-1">份数</th>
              <th className="py-1">备注</th>
              <th className="py-1">状态</th>
              <th className="py-1">时间</th>
              <th className="py-1">说明</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((j) => {
              const st = printStatusOf(j.status);
              return (
                <tr
                  key={j.id}
                  className={
                    "border-t border-gray-200 " + (j.status === "FAILED" ? "bg-red-50" : "")
                  }
                >
                  <td className="max-w-[18rem] truncate py-1">{j.fileName}</td>
                  <td className="py-1">{j.copies}</td>
                  <td className="max-w-[16rem] truncate py-1 text-gray-600" title={j.note ?? ""}>
                    {j.note ?? ""}
                  </td>
                  <td className="py-1" title={st.hint}>
                    <span className="review-status" data-tone={st.tone}>
                      {st.label}
                    </span>
                  </td>
                  <td className="py-1 text-xs">{fmtTime(j.printedAt ?? j.createdAt)}</td>
                  <td className="max-w-[18rem] truncate py-1 text-xs text-red-600" title={j.lastError ?? ""}>
                    {j.lastError ?? ""}
                  </td>
                </tr>
              );
            })}
            {recent.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-3 text-xs opacity-50">
                  暂无任务
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
          </div>
        </div>
      </div>
    </AdminPageShell>
  );
}
