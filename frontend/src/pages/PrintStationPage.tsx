import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { APP_BUILD_ID, resolveSocketUrl, SOCKET_IO_CLIENT_OPTIONS } from "@/config/socketUrl";
import { authStorage } from "@/features/auth/authStorage";
import {
  ackPrintJob,
  claimPrintJob,
  fetchMyPrintJobs,
  fetchMyStation,
  fetchPrintJobFile,
  type PrintJob,
} from "@/api/domains/print.api";
import { PdfPrintCanvas } from "@/features/print-station/PdfPrintCanvas";

/**
 * 兜底轮询间隔。socket 只降延迟，正确性靠它 ——
 * 断网、刷新页面、服务端重启，任务都还在 PENDING 里等人领。
 */
const POLL_MS = 15000;

function isPdf(job: PrintJob): boolean {
  return job.fileName.toLowerCase().endsWith(".pdf");
}

export default function PrintStationPage() {
  const [stationName, setStationName] = useState("");
  /** 本工位的纸张尺寸。为空则不打 @page size，用驱动默认 —— 桌面 A4 就该留空 */
  const [pageSize, setPageSize] = useState<string | null>(null);
  const [current, setCurrent] = useState<PrintJob | null>(null);
  const [file, setFile] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [recent, setRecent] = useState<PrintJob[]>([]);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  const busyRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);

  const refreshRecent = useCallback(async () => {
    try {
      setRecent(await fetchMyPrintJobs(20));
    } catch {
      /* 列表刷新失败不该打断打印 */
    }
  }, []);

  /** 收尾：回执 + 复位。PRINTED 的语义是「已交给打印队列」，不是「纸张已出」。 */
  const settle = useCallback(
    async (job: PrintJob, ok: boolean, err?: string) => {
      try {
        await ackPrintJob(job.id, ok, err);
      } catch {
        /* 回执失败交给超时调度兜底 */
      }
      setMessage(ok ? `已提交打印：${job.fileName}` : `打印失败：${err ?? job.fileName}`);
      setCurrent(null);
      setFile(null);
      setImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      await refreshRecent();
    },
    [refreshRecent],
  );

  /** 领一条 → 取文件。一次只处理一条。 */
  const drainOne = useCallback(async () => {
    if (busyRef.current || current) return;
    busyRef.current = true;
    try {
      const job = await claimPrintJob();
      if (!job) return;
      setCurrent(job);
      setMessage(`正在准备 ${job.fileName}`);
      try {
        const blob = await fetchPrintJobFile(job.id);
        setFile(blob);
      } catch (e) {
        await settle(job, false, e instanceof Error ? e.message : "取文件失败");
      }
    } catch {
      /* 领任务失败（断网等）下轮再试 */
    } finally {
      busyRef.current = false;
    }
  }, [current, settle]);

  /** 渲染完成 → 调起打印 → 回执。 */
  const onPrintableReady = useCallback(() => {
    if (!current) return;
    try {
      window.print();
      void settle(current, true);
    } catch (e) {
      void settle(current, false, e instanceof Error ? e.message : "调起打印失败");
    }
  }, [current, settle]);

  // 图片走 <img> 路径：转成 objectURL 等 onLoad 后再打
  useEffect(() => {
    if (!current || !file || isPdf(current)) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [current, file]);

  useEffect(() => {
    void refreshRecent();
    void drainOne();
    void fetchMyStation()
      .then((s) => {
        setStationName(s.name ?? "");
        setPageSize(s.pageSize ?? null);
      })
      .catch(() => undefined);

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

    const timer = setInterval(() => void drainOne(), POLL_MS);
    return () => {
      clearInterval(timer);
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const printable = Boolean(current && (isPdf(current) ? file : imageUrl));

  return (
    <div className="min-h-screen bg-white p-6 text-[var(--app-color-text-primary,#111)]">
      {/* 纸张尺寸按工位配置注入：卡片机设成 CR80，桌面打印机留空走驱动默认 */}
      <style>
        {pageSize ? `@page { size: ${pageSize}; margin: 0; }` : "@page { margin: 0; }"}
      </style>

      {/* 只在打印时出现的内容 */}
      {printable && current ? (
        <div>
          {isPdf(current) && file ? (
            <PdfPrintCanvas blob={file} onReady={onPrintableReady} />
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              style={{ width: "100%", display: "block" }}
              onLoad={onPrintableReady}
            />
          ) : null}
        </div>
      ) : null}

      {/* 屏幕上显示的状态面板 */}
      <div className="print:hidden">
        <div className="mb-4 flex items-center gap-3">
          <span className={`inline-block size-3 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <h1 className="text-lg font-semibold">打印工位{stationName ? `：${stationName}` : ""}</h1>
          <span className="text-sm opacity-60">
            {connected ? "已连接" : "未连接（仍在轮询兜底）"}
          </span>
        </div>

        {message ? <div className="mb-4 rounded bg-gray-100 px-3 py-2 text-sm">{message}</div> : null}

        <h2 className="mb-2 text-sm font-semibold">最近任务</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs opacity-60">
            <tr>
              <th className="py-1">文件</th>
              <th className="py-1">状态</th>
              <th className="py-1">时间</th>
              <th className="py-1">说明</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((j) => (
              <tr key={j.id} className="border-t border-gray-200">
                <td className="max-w-[20rem] truncate py-1">{j.fileName}</td>
                <td className="py-1">{j.status}</td>
                <td className="py-1 text-xs">{j.printedAt ?? j.createdAt ?? ""}</td>
                <td className="py-1 text-xs text-red-600">{j.lastError ?? ""}</td>
              </tr>
            ))}
            {recent.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-3 text-xs opacity-50">
                  暂无任务
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
