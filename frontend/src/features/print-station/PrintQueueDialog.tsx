import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ListChecks, RotateCcw, Trash2, XCircle } from "lucide-react";
import {
  cancelPrintJob,
  clearStationQueue,
  fetchPrintCapabilities,
  fetchPrintHistory,
  fetchSelectableStations,
  retryPrintJob,
  type PrintJob,
  type PrintStationOption,
} from "@/api/domains/print.api";
import { printStatusOf, queueHintOf } from "./printStatus";
import { authStorage } from "@/features/auth/authStorage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { appConfirm } from "@/lib/appDialog";

/** 未结束的状态排前面 —— 那些才是要动的；打完的只是留个记录 */
const ACTIVE: PrintJob["status"][] = ["PENDING", "SENT"];

function fmtTime(v: string | null | undefined) {
  if (!v) return "—";
  return v.length > 19 ? v.slice(0, 19) : v;
}

/**
 * 打印队列弹窗：**按打印机分 tab**，每个 tab 就是那台打印机自己的队列。
 *
 * 为什么是弹窗而不是单独一页：发打印和看队列是同一件事的两半 ——
 * 从文件模板库或卡片打印页发完，顺手就该能看它排到哪了，
 * 不该让人跳到另一个页面再找回来。
 *
 * tab 的默认选中项是「当前用户最近用的那台」—— 按任务里的 createdBy 判断，
 * 没有历史就取第一台。
 */
export function PrintQueueDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [stations, setStations] = useState<PrintStationOption[]>([]);
  const [activeStation, setActiveStation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 当前账号能不能清队列。null = 还没问到 —— 没问到就不给按钮（fail-closed）。 */
  const [caps, setCaps] = useState<{ canClearQueue: boolean } | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 历史接口给的是全部状态，队列和记录一次拿齐。
      // 能力跟历史同为 requireStaff 一级，一起拿不会多出一种失败模式。
      const [h, s, c] = await Promise.all([
        fetchPrintHistory(undefined, undefined, 300),
        fetchSelectableStations(),
        fetchPrintCapabilities(),
      ]);
      setJobs(h);
      setStations(s);
      setCaps(c);
      return h;
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load().then((list) => {
      const me = authStorage.getUserInfo()?.id;
      // 自动切到「我正在用的那台」：优先我自己最近一条任务所在的工位
      const mine = list.find((j) => me && j.createdBy === me);
      const fallback = list.find((j) => ACTIVE.includes(j.status));
      setActiveStation((prev) => prev || mine?.stationId || fallback?.stationId || "");
    });
  }, [open, load]);

  /**
   * tab = 打印机。取「有任务的工位」∪「所有已启用的工位」的并集 ——
   * 空队列也要有个 tab，否则「我的打印机没反应」时无从确认它是真没任务还是坏了。
   * 排序：有在途任务的排前面，其次是有过任务的，最后按名字。
   */
  const tabs = useMemo(() => {
    const byStation = new Map<string, PrintJob[]>();
    for (const j of jobs) {
      const arr = byStation.get(j.stationId);
      if (arr) arr.push(j);
      else byStation.set(j.stationId, [j]);
    }
    const nameOf = new Map(stations.map((s) => [s.id, s.name]));
    const ids = new Set<string>([...byStation.keys(), ...stations.map((s) => s.id)]);

    return [...ids]
      .map((id) => {
        const list = byStation.get(id) ?? [];
        const newest = list.reduce<string>((a, b) => (a > b.createdAt ? a : b.createdAt), "");
        return {
          id,
          // 停用的工位取不到名字，退回 id —— 有任务在就别装作它不存在
          name: nameOf.get(id) ?? id,
          hasActive: list.some((j) => ACTIVE.includes(j.status)),
          hasAny: list.length > 0,
          newestAt: newest,
          count: list.filter((j) => ACTIVE.includes(j.status)).length,
        };
      })
      .sort(
        (a, b) =>
          Number(b.hasActive) - Number(a.hasActive) ||
          Number(b.hasAny) - Number(a.hasAny) ||
          a.name.localeCompare(b.name),
      );
  }, [jobs, stations]);

  // tab 列表变化后，保证选中的那个还在；否则退回第一个
  useEffect(() => {
    if (tabs.length === 0) return;
    if (!tabs.some((t) => t.id === activeStation)) setActiveStation(tabs[0].id);
  }, [tabs, activeStation]);

  /** 当前 tab 的内容：未结束的在前，其余按时间倒序 */
  const rows = useMemo(
    () =>
      jobs
        .filter((j) => j.stationId === activeStation)
        .sort((a, b) => {
          const ra = ACTIVE.includes(a.status) ? 0 : 1;
          const rb = ACTIVE.includes(b.status) ? 0 : 1;
          return ra - rb || (a.createdAt < b.createdAt ? 1 : -1);
        }),
    [jobs, activeStation],
  );

  const onCancel = async (j: PrintJob) => {
    const msg =
      j.status === "FAILED"
        ? `把失败的任务「${j.fileName}」从队列里收掉？`
        : `撤回「${j.fileName}」？撤回后不会再打。`;
    if (!(await appConfirm(msg))) return;
    try {
      await cancelPrintJob(j.id);
      toast.success(j.status === "FAILED" ? "已收掉" : "已撤回");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  const onRetry = async (j: PrintJob) => {
    try {
      await retryPrintJob(j.id);
      toast.success("已重新排队");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重推失败");
    }
  };

  /**
   * 清空当前这台打印机**服务端队列里的全部任务**。
   * 影响面不止自己那几条 —— 弹窗里必须说清，否则会把别人排的东西一起撤掉。
   * 不做乐观更新：清空是「部分成功也不奇怪」的场景，权威在服务端，重新拉一遍最省心。
   */
  const onClearQueue = async () => {
    // 工位 id 在弹确认框之前就定下来：确认是异步的，别拿一个可能已经变了的 activeStation
    const stationId = activeStation;
    const name = activeTab?.name ?? "这台打印机";
    const ok = await appConfirm(
      `清空「${name}」的打印队列？\n` +
        `这台机器上所有还排在队列里的任务都会被撤掉，包括别人派发的。\n` +
        `已经打出来的不受影响。`,
      { danger: true, confirmText: "清空" },
    );
    if (!ok) return;
    setClearing(true);
    try {
      const r = await clearStationQueue(stationId);
      toast.success(`已清空 ${r.cleared} 条（库里收起 ${r.cancelled} 条）`);
      await load();
    } catch (e) {
      // 服务端会带回真实原因（如「未配置 lpstat」），原样透出去，别盖成一句「操作失败」
      toast.error(e instanceof Error ? e.message : "清空失败");
    } finally {
      setClearing(false);
    }
  };

  const activeTab = tabs.find((t) => t.id === activeStation);
  /** 清空按钮的显隐：直发工位才有服务端队列，且当前账号得有权限（权限只在服务端判）。 */
  const canClearQueue =
    Boolean(caps?.canClearQueue) &&
    stations.find((s) => s.id === activeStation)?.mode === "SERVER";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>打印队列</DialogTitle>
          <DialogDescription>
            每台打印机一个队列。排队中的可以撤回，失败了的可以重新排队或收掉；
            已经提交、却还卡在打印机队列里没打出来的，也能撤回。
          </DialogDescription>
        </DialogHeader>

        {tabs.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--app-color-text-tertiary)]">
            {loading ? "加载中…" : error ? error : "还没有任何打印记录"}
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="review-tabs flex-wrap">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="review-tab"
                    data-active={t.id === activeStation}
                    onClick={() => setActiveStation(t.id)}
                  >
                    {t.name}
                    {t.count > 0 ? (
                      <span className="ml-1.5 rounded-full bg-[var(--app-color-feedback-info)] px-1.5 text-[11px] text-white">
                        {t.count}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>

              {canClearQueue ? (
                <button
                  type="button"
                  disabled={clearing}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--app-color-border-default)] px-3 py-1.5 text-[13px] font-medium text-[var(--app-color-feedback-error)] transition-colors hover:border-[var(--app-color-feedback-error)] disabled:opacity-50"
                  onClick={() => void onClearQueue()}
                >
                  <Trash2 className="size-3.5" />
                  {clearing ? "清空中…" : "清空这台队列"}
                </button>
              ) : null}
            </div>

            <div className="max-h-[55vh] min-h-[200px] overflow-y-auto rounded-md border border-[var(--app-color-border-default)]">
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 bg-[var(--app-color-surface-container)] text-xs text-[var(--app-color-text-secondary)]">
                  <tr>
                    <th className="px-3 py-2">文件</th>
                    <th className="px-3 py-2">份数</th>
                    <th className="px-3 py-2">备注</th>
                    <th className="px-3 py-2">状态</th>
                    <th className="px-3 py-2">时间</th>
                    <th className="px-3 py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((j) => {
                    const st = printStatusOf(j.status);
                    // 只有核对确实看到「还排在打印机队列里」才说话；null / CLEARED 都不说话。
                    // 这一维跟 status 无关 —— 卡在队列里的直发任务 status 早就是 PRINTED 了。
                    const stuckInQueue = j.queueState === "QUEUED";
                    const queueHint = queueHintOf(j.queueState);
                    return (
                      <tr key={j.id} className="border-t border-[var(--app-color-border-default)]">
                        <td className="max-w-[16rem] px-3 py-2">
                          <span className="flex items-center gap-1.5">
                            {j.priority > 0 ? (
                              <span className="shrink-0 rounded bg-[color-mix(in_srgb,var(--app-color-feedback-warning)_18%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-color-feedback-warning)]">
                                加急
                              </span>
                            ) : null}
                            <span className="truncate text-[var(--app-color-text-primary)]" title={j.fileName}>
                              {j.fileName}
                            </span>
                          </span>
                          {j.lastError ? (
                            <div className="mt-0.5 truncate text-[11px] text-[var(--app-color-feedback-error)]" title={j.lastError}>
                              {j.lastError}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-[var(--app-color-text-secondary)]">{j.copies}</td>
                        <td
                          className="max-w-[12rem] truncate px-3 py-2 text-[var(--app-color-text-secondary)]"
                          title={j.note ?? ""}
                        >
                          {j.note || <span className="text-[var(--app-color-text-tertiary)]">—</span>}
                        </td>
                        <td className="px-3 py-2" title={st.hint}>
                          <span className="flex items-center gap-1.5">
                            <span className="review-status" data-tone={st.tone}>
                              {st.label}
                            </span>
                            {queueHint ? (
                              <span
                                className="shrink-0 rounded bg-[color-mix(in_srgb,var(--app-color-feedback-warning)_18%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-color-feedback-warning)]"
                                title={queueHint}
                              >
                                仍卡在打印机队列
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--app-color-text-tertiary)]">
                          {fmtTime(j.printedAt ?? j.sentAt ?? j.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap justify-end gap-3">
                            {j.status === "PENDING" ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--app-color-feedback-error)]"
                                onClick={() => void onCancel(j)}
                              >
                                <XCircle className="size-3.5" />
                                撤回
                              </button>
                            ) : null}
                            {j.status === "FAILED" ? (
                              <>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--app-color-text-primary)]"
                                  onClick={() => void onRetry(j)}
                                >
                                  <RotateCcw className="size-3.5" />
                                  重新排队
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--app-color-feedback-error)]"
                                  onClick={() => void onCancel(j)}
                                >
                                  <XCircle className="size-3.5" />
                                  收掉
                                </button>
                              </>
                            ) : null}
                            {/* 终态也要给一颗：直发任务提交后 status 就是 PRINTED，
                                可它可能还卡在打印机队列里没出来 —— 这正是原来一个能点的按钮都没有的场景。
                                null（没核对过）和 CLEARED（早打完了）一律不给，撤不得。
                                文案跟同屏那颗 PENDING 的统一叫「撤回」—— 同一个动作别用两个词。 */}
                            {stuckInQueue ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--app-color-feedback-error)]"
                                onClick={() => void onCancel(j)}
                              >
                                <XCircle className="size-3.5" />
                                撤回
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-xs text-[var(--app-color-text-tertiary)]">
                        「{activeTab?.name ?? ""}」还没有打印记录
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * 「打印队列」入口按钮 —— 文件模板库和卡片打印页各放一个。
 * 自己管开关状态，调用方不用为它维护任何 state。
 */
export function PrintQueueButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={
          className ??
          "inline-flex items-center gap-2 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
        }
        onClick={() => setOpen(true)}
      >
        <ListChecks className="h-4 w-4" />
        打印队列
      </button>
      <PrintQueueDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export default PrintQueueDialog;
