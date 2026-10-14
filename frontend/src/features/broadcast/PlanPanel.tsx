import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, PlayCircle, Loader2 } from "lucide-react";
import { appConfirm } from "@/lib/appDialog";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitch } from "@/components/admin/AdminSwitch";
import {
  createPlan,
  deletePlan,
  listZones,
  listSongLists,
  listPlans,
  runPlan,
  togglePlan,
  updatePlan,
  type BroadcastPlan,
  type PlanUpsert,
} from "@/api/domains/broadcast.api";
import PlanEditorDialog from "./PlanEditorDialog";
import { blockBodyClass, blockHeadClass, blockTitleClass, tdClass, thClass } from "./ui";

/** 定时方案面板：本页最高频的一块。 */
export default function PlanPanel() {
  const qc = useQueryClient();
  const plansQ = useQuery({ queryKey: ["broadcast", "plans"], queryFn: listPlans });
  const zonesQ = useQuery({ queryKey: ["broadcast", "zones"], queryFn: listZones, refetchInterval: 20000 });
  const songsQ = useQuery({ queryKey: ["broadcast", "songLists"], queryFn: listSongLists });

  /** undefined = 未开；null = 新建；对象 = 编辑 */
  const [editorFor, setEditorFor] = useState<BroadcastPlan | null | undefined>(undefined);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["broadcast"] });

  const saveMut = useMutation({
    mutationFn: (args: { id?: number; body: PlanUpsert }) =>
      args.id ? updatePlan(args.id, args.body) : createPlan(args.body),
    onSuccess: (_d, args) => {
      toast.success(args.id ? "方案已保存" : "方案已新建");
      setEditorFor(undefined);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const toggleMut = useMutation({
    mutationFn: (args: { id: number; enabled: boolean }) => togglePlan(args.id, args.enabled),
    onSuccess: (_d, args) => {
      toast.success(args.enabled ? "已启用" : "已停用");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });

  const runMut = useMutation({
    mutationFn: (id: number) => runPlan(id),
    onSuccess: () => {
      toast.success("已下发播放");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "试跑失败"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deletePlan(id),
    onSuccess: () => {
      toast.success("已删除");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const plans = plansQ.data ?? [];
  const zones = zonesQ.data?.zones ?? [];
  const songLists = songsQ.data ?? [];
  const today = new Date().toLocaleDateString("sv-SE"); // yyyy-MM-dd

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={blockHeadClass}>
        <span className={blockTitleClass}>定时播放方案</span>
        <div className="flex items-center gap-2">
          <AdminButton
            tone="secondary"
            onClick={() => {
              zonesQ.refetch();
              songsQ.refetch();
              setEditorFor(null);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            新建方案
          </AdminButton>
        </div>
      </div>

      <div className={blockBodyClass}>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className={thClass}>方案</th>
              <th className={thClass}>启用</th>
              <th className={thClass}>时间窗</th>
              <th className={thClass}>周期</th>
              <th className={thClass}>分区</th>
              <th className={thClass}>曲目</th>
              <th className={thClass}>上次触发</th>
              <th className={thClass} />
            </tr>
          </thead>
          <tbody>
            {plansQ.isLoading ? (
              <tr>
                <td className={tdClass} colSpan={8}>
                  <span className="inline-flex items-center gap-2 text-sm text-[var(--app-color-text-tertiary)]">
                    <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
                  </span>
                </td>
              </tr>
            ) : plans.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={8}>
                  <span className="text-sm text-[var(--app-color-text-tertiary)]">
                    还没有定时方案。点右上「新建方案」，到点会自动播放。
                  </span>
                </td>
              </tr>
            ) : (
              plans.map((p) => {
                const firedToday = p.lastFiredDate === today;
                return (
                  <tr key={p.id} className="hover:bg-[var(--app-color-surface-hover)]">
                    <td className={`${tdClass} font-medium`}>{p.planName}</td>
                    <td className={tdClass}>
                      <AdminSwitch
                        checked={p.enabled}
                        onChange={(v) => toggleMut.mutate({ id: p.id, enabled: v })}
                      />
                    </td>
                    <td className={`${tdClass} whitespace-nowrap tabular-nums`}>
                      {p.startTime?.slice(0, 5)}–{p.endTime?.slice(0, 5)}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {p.timeMode === 1 ? (
                        <span className="text-xs">
                          {p.startDate} ~ {p.endDate}
                        </span>
                      ) : (
                        <span className="text-xs">
                          {weekText(p.weekDays)}
                        </span>
                      )}
                    </td>
                    <td className={`${tdClass} tabular-nums`}>{countJson(p.zoneMacs)}</td>
                    <td className={`${tdClass} tabular-nums`}>{countJson(p.songPaths)}</td>
                    <td className={`${tdClass} whitespace-nowrap text-xs`}>
                      {p.lastFiredAt ? (
                        <span
                          title={p.lastResult ?? ""}
                          className={
                            "text-[var(--app-color-text-secondary)]"
                          }
                        >
                          {firedToday ? "今日 " : ""}
                          {String(p.lastFiredAt).slice(11, 16)}
                        </span>
                      ) : (
                        <span className="text-[var(--app-color-text-tertiary)]">—</span>
                      )}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      <span className="flex items-center gap-1">
                        <AdminButton
                          tone="ghost"
                          className="h-7 px-2"
                          loading={runMut.isPending && runMut.variables === p.id}
                          onClick={() => runMut.mutate(p.id)}
                        >
                          <PlayCircle className="h-3.5 w-3.5" />
                        </AdminButton>
                        <AdminButton tone="ghost" className="h-7 px-2" onClick={() => setEditorFor(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </AdminButton>
                        <AdminButton
                          tone="destructive"
                          className="h-7 px-2"
                          onClick={async () => {
                            if (await appConfirm(`确定删除方案「${p.planName}」？`)) {
                              deleteMut.mutate(p.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </AdminButton>
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <PlanEditorDialog
        open={editorFor !== undefined}
        plan={editorFor ?? null}
        zones={zones}
        songLists={songLists}
        submitting={saveMut.isPending}
        onClose={() => setEditorFor(undefined)}
        onSubmit={(body) => saveMut.mutate({ id: editorFor?.id, body })}
      />
    </div>
  );
}

function countJson(raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
}

const WEEK_NAMES = ["一", "二", "三", "四", "五", "六", "日"];

function weekText(days: string | null | undefined): string {
  if (!days) return "—";
  if (days === "1234567") return "每天";
  const picked = days.split("").filter(Boolean).map((d) => WEEK_NAMES[Number(d) - 1] ?? "");
  return `周${picked.join("")}`;
}
