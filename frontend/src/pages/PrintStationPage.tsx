import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Printer } from "lucide-react";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { authStorage } from "@/features/auth/authStorage";
import { usePrintStationWorker } from "@/features/print-station/PrintStationWorkerContext";
import { printStatusOf } from "@/features/print-station/printStatus";

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
 * 打印工位页：只负责展示。
 *
 * 领取/渲染/打印/回执都在 AdminLayout 的工位 worker 里（见 PrintStationWorkerContext），
 * 所以这页关掉、或人跑去别的后台页面，打印仍然继续 —— 它不再是打印的前置条件。
 */
export default function PrintStationPage() {
  const {
    station,
    stationError,
    current,
    blobKind,
    pages,
    lastPrinted,
    recent,
    pending,
    connected,
    message,
  } = usePrintStationWorker();
  const [previewOpen, setPreviewOpen] = useState(true);
  const navigate = useNavigate();

  /**
   * 清掉当前会话回到登录页，登完再跳回本页。
   * 工位机无人值守，会话一坏就得能在这一个页面里自己救回来。
   */
  const relogin = useCallback(() => {
    authStorage.clear();
    navigate("/", { replace: true, state: { from: { pathname: "/console/admin/print-station" } } });
  }, [navigate]);

  const printable = Boolean(current && pages.length > 0) && (blobKind === "pdf" || blobKind === "image");
  const copies = current?.copies ?? 1;

  return (
    <AdminPageShell>
      <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[420px] flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Printer className="size-4 shrink-0 text-[var(--app-color-text-tertiary)]" />
          <span className="text-sm font-medium text-[var(--app-color-text-primary)]">
            {station?.name || "打印工位"}
          </span>

          <span
            className={
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] " +
              (connected
                ? "bg-[color-mix(in_srgb,var(--app-color-feedback-success)_12%,transparent)] text-[var(--app-color-feedback-success)]"
                : "bg-[color-mix(in_srgb,var(--app-color-feedback-error)_12%,transparent)] text-[var(--app-color-feedback-error)]")
            }
          >
            <span
              className={
                "size-1.5 shrink-0 rounded-full " +
                (connected
                  ? "bg-[var(--app-color-feedback-success)]"
                  : "bg-[var(--app-color-feedback-error)]")
              }
            />
            {connected ? "已连接" : "未连接"}
          </span>

          <span
            className={
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] " +
              (pending > 0
                ? "bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)]"
                : "text-[var(--app-color-text-tertiary)]")
            }
          >
            排队 {pending}
          </span>

          {printable ? (
            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              className="ml-auto rounded-md border border-[var(--app-color-border-default)] px-3 py-1 text-[12px] text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]"
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

        <div className="flex min-h-0 flex-1 gap-3">
          {printable && current && previewOpen ? (
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-[var(--app-color-border-default)] bg-white p-3">
              {pages.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  style={{ width: "100%", display: "block" }}
                />
              ))}
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-y-contain">
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
