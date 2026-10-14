import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { AdminSwitch } from "@/components/admin/AdminSwitch";
import { adminInputClass, adminLabelClass, adminHintClass } from "@/features/admin/adminFormUi";
import type { BroadcastPlan, PlanUpsert, SongListView, ZoneView } from "@/api/domains/broadcast.api";

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

/** 把 "HH:mm" 补成后端要的 "HH:mm:ss" */
function normTime(v: string): string {
  if (!v) return "";
  return v.length === 5 ? `${v}:00` : v;
}

/** "HH:mm:ss" → `<input type="time">` 认的 "HH:mm:ss"（浏览器会按 step 显示秒） */
function toInputTime(v: string | null | undefined): string {
  return (v ?? "").slice(0, 8);
}

/**
 * 定时方案编辑。方案**存在我们自己库里**，到点由我方调度器下发播放指令 ——
 * 不写平台的定时方案，绕开它那套不可靠的引擎。
 */
export default function PlanEditorDialog({
  open,
  plan,
  zones,
  songLists,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  plan: BroadcastPlan | null;
  zones: ZoneView[];
  songLists: SongListView[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (body: PlanUpsert) => void;
}) {
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [timeMode, setTimeMode] = useState(0);
  const [weekDays, setWeekDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5, 6, 7]));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00:00");
  const [endTime, setEndTime] = useState("10:00:00");
  const [volume, setVolume] = useState<string>("");
  const [zoneMacs, setZoneMacs] = useState<Set<string>>(new Set());
  const [songPaths, setSongPaths] = useState<Set<string>>(new Set());
  const [loopPlay, setLoopPlay] = useState(false);

  // 打开时按传入的方案回填
  useEffect(() => {
    if (!open) return;
    if (plan) {
      setName(plan.planName ?? "");
      setEnabled(plan.enabled);
      setTimeMode(plan.timeMode ?? 0);
      setWeekDays(new Set((plan.weekDays ?? "").split("").filter(Boolean).map(Number)));
      setStartDate(plan.startDate ?? "");
      setEndDate(plan.endDate ?? "");
      setStartTime(toInputTime(plan.startTime));
      setEndTime(toInputTime(plan.endTime));
      setVolume(plan.volume == null ? "" : String(plan.volume));
      setZoneMacs(new Set(parseJsonArray(plan.zoneMacs)));
      setSongPaths(new Set(parseJsonArray(plan.songPaths)));
      setLoopPlay(plan.loopPlay ?? false);
    } else {
      setName("");
      setEnabled(true);
      setTimeMode(0);
      setWeekDays(new Set([1, 2, 3, 4, 5, 6, 7]));
      setStartDate("");
      setEndDate("");
      setStartTime("09:00:00");
      setEndTime("10:00:00");
      setVolume("");
      setZoneMacs(new Set());
      setSongPaths(new Set());
      setLoopPlay(false);
    }
  }, [open, plan]);

  const allSongs = useMemo(() => songLists.flatMap((l) => l.songs), [songLists]);

  function toggle<T>(set: Set<T>, v: T, apply: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    apply(next);
  }

  function submit() {
    if (!name.trim()) {
      toast.error("请填方案名称");
      return;
    }
    if (startTime >= endTime) {
      toast.error("结束时间要晚于开始时间");
      return;
    }
    if (timeMode === 0 && weekDays.size === 0) {
      toast.error("请至少选一个星期");
      return;
    }
    if (timeMode === 1 && (!startDate || !endDate)) {
      toast.error("按日期循环要填起止日期");
      return;
    }
    if (zoneMacs.size === 0) {
      toast.error("请至少选一个分区");
      return;
    }
    if (songPaths.size === 0) {
      toast.error("请至少选一首曲目");
      return;
    }
    const list = songLists.find((l) => l.songs.some((s) => songPaths.has(s.pathName)));
    onSubmit({
      planName: name.trim(),
      enabled,
      timeMode,
      weekDays: timeMode === 0 ? [...weekDays].sort().join("") : null,
      startDate: timeMode === 1 ? startDate : null,
      endDate: timeMode === 1 ? endDate : null,
      startTime: normTime(startTime),
      endTime: normTime(endTime),
      volume: volume === "" ? null : Number(volume),
      zoneMacs: [...zoneMacs],
      songPaths: [...songPaths],
      songListId: list?.id ?? null,
      loopPlay,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent variant="rightSheet" className="w-[560px] max-w-[96vw]">
        <DialogHeader>
          <DialogTitle>{plan ? "编辑定时方案" : "新建定时方案"}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-1 py-2">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className={adminLabelClass}>方案名称</label>
              <input
                className={adminInputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：大动物-上午场"
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <AdminSwitch checked={enabled} onChange={setEnabled} />
              <span className="text-sm text-[var(--app-color-text-primary)]">启用</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={adminLabelClass}>定时方式</label>
              <AdminSelect
                className="w-full"
                value={timeMode}
                onChange={(e) => setTimeMode(Number(e.target.value))}
              >
                <option value={0}>按周循环</option>
                <option value={1}>按日期区间</option>
              </AdminSelect>
            </div>
            <div>
              <label className={adminLabelClass}>音量（留空则不改动）</label>
              <input
                className={adminInputClass}
                value={volume}
                onChange={(e) => setVolume(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="0-100"
              />
            </div>
          </div>

          {timeMode === 0 ? (
            <div>
              <label className={adminLabelClass}>星期</label>
              <div className="flex gap-1.5">
                {WEEK_LABELS.map((label, i) => {
                  const day = i + 1;
                  const on = weekDays.has(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggle(weekDays, day, setWeekDays)}
                      className="h-8 w-8 rounded-md border text-sm"
                      style={{
                        borderColor: on ? "var(--app-color-accent)" : "var(--app-color-border-default)",
                        background: on ? "var(--app-color-accent)" : "var(--app-color-surface-container)",
                        color: on ? "#fff" : "var(--app-color-text-primary)",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={adminLabelClass}>开始日期</label>
                <input type="date" className={adminInputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className={adminLabelClass}>结束日期</label>
                <input type="date" className={adminInputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={adminLabelClass}>开始时刻</label>
              <input type="time" step={1} className={adminInputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className={adminLabelClass}>结束时刻</label>
              <input type="time" step={1} className={adminInputClass} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className={adminLabelClass}>目标分区（已选 {zoneMacs.size}）</label>
              <button
                type="button"
                className="text-xs text-[var(--twin-link)]"
                onClick={() =>
                  setZoneMacs(zoneMacs.size === zones.length ? new Set() : new Set(zones.map((z) => z.mac)))
                }
              >
                {zoneMacs.size === zones.length ? "全不选" : "全选"}
              </button>
            </div>
            <div className="grid max-h-40 grid-cols-2 gap-x-3 gap-y-1 overflow-auto rounded-md border border-[var(--twin-hairline)] p-2">
              {zones.map((z) => (
                <label key={z.mac} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={zoneMacs.has(z.mac)}
                    onChange={() => toggle(zoneMacs, z.mac, setZoneMacs)}
                  />
                  <span className="truncate">{z.name}</span>
                </label>
              ))}
              {zones.length === 0 ? <span className={adminHintClass}>未读取到分区</span> : null}
            </div>
          </div>

          <div>
            <label className={adminLabelClass}>曲目（已选 {songPaths.size}）</label>
            <div className="max-h-48 overflow-auto rounded-md border border-[var(--twin-hairline)] p-2">
              {songLists.map((l) => (
                <div key={l.id} className="mb-2 last:mb-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--app-color-text-secondary)]">
                      {l.name}（{l.songCount}）
                    </span>
                    <button
                      type="button"
                      className="text-xs text-[var(--twin-link)]"
                      onClick={() => {
                        const next = new Set(songPaths);
                        const allOn = l.songs.every((s) => next.has(s.pathName));
                        l.songs.forEach((s) => (allOn ? next.delete(s.pathName) : next.add(s.pathName)));
                        setSongPaths(next);
                      }}
                    >
                      {l.songs.every((s) => songPaths.has(s.pathName)) ? "全不选" : "全选"}
                    </button>
                  </div>
                  {l.songs.map((s) => (
                    <label key={s.pathName} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                      <input
                        type="checkbox"
                        checked={songPaths.has(s.pathName)}
                        onChange={() => toggle(songPaths, s.pathName, setSongPaths)}
                      />
                      <span className="truncate">{s.fileName}</span>
                      {s.durationSeconds ? (
                        <span className={adminHintClass}>{Math.round(s.durationSeconds / 60)} 分</span>
                      ) : null}
                    </label>
                  ))}
                </div>
              ))}
              {allSongs.length === 0 ? <span className={adminHintClass}>曲库为空，先去上传音乐</span> : null}
            </div>
            <p className={`${adminHintClass} mt-1`}>
              到点后从<b>第一首</b>开始放，平台会自动接着放完整个列表。
            </p>
            <div className="mt-2 flex items-center gap-2">
              <AdminSwitch checked={loopPlay} onChange={setLoopPlay} />
              <span className="text-sm text-[var(--app-color-text-primary)]">循环播放</span>
              <span className={adminHintClass}>窗口内列表播完自动从头循环，直到结束</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <AdminButton tone="secondary" onClick={onClose}>
            取消
          </AdminButton>
          <AdminButton tone="primary" loading={submitting} onClick={submit}>
            保存
          </AdminButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
