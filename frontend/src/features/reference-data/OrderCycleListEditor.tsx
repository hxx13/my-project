import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { fetchOrderCyclesAdmin, saveOrderCyclesAdmin } from "@/api/domains/referenceData.api";
import { appConfirm } from "@/lib/appDialog";
import { calendarDayKeyBeijing } from "@/utils/beijingTime";

/**
 * 到货周期清单。
 *
 * <p>周期原来**每次请求现场推算**，管理员改了也会被下一次重算盖掉。现在后端在清单为空时
 * **自动生成并落库**一份，之后一律读库 —— 所以这里看到的是一份**具体清单**，
 * 只做针对性调整；只有点「按策略重新生成」才回到推算结果。
 *
 * <p>保存是**整份替换**（与预计送达策略同口径），不做增量。
 */
export default function OrderCycleListEditor({ campus }: { campus: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["referenceData", "orderCyclesAdmin", campus],
    queryFn: () => fetchOrderCyclesAdmin(campus),
    enabled: !!campus,
  });

  /** 编辑区：服务端数据到手或换校区时重置，避免把上一个校区的草稿带过来 */
  const [dates, setDates] = useState<string[]>([]);
  const [newDate, setNewDate] = useState("");
  useEffect(() => { setDates(data?.stored ?? []); }, [data?.stored, campus]);

  const saved = useMemo(() => [...(data?.stored ?? [])].sort().join(","), [data]);
  const dirty = useMemo(() => [...dates].sort().join(",") !== saved, [dates, saved]);
  const today = calendarDayKeyBeijing(new Date());

  const saveMut = useMutation({
    mutationFn: (list: string[]) => saveOrderCyclesAdmin(campus, list),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referenceData", "orderCyclesAdmin", campus] });
      qc.invalidateQueries({ queryKey: ["referenceData", "orderCycles"] });
      toast.success("周期清单已保存");
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const add = () => {
    const d = newDate.trim();
    if (!d) return;
    if (dates.includes(d)) { toast.error("这个日期已在清单里"); return; }
    setDates([...dates, d].sort());
    setNewDate("");
  };

  const regenerate = async () => {
    const predicted = data?.predicted ?? [];
    if (predicted.length === 0) { toast.error("策略没算出任何周期，检查可购窗口与节假日"); return; }
    if (dirty && !await appConfirm("当前有未保存的调整，重新生成会覆盖它们。继续？")) return;
    // 只落到编辑区，不直接保存 —— 让管理员先看一眼再决定
    setDates(predicted);
    toast("已按当前策略填入，确认后请点保存", { icon: "ℹ️" });
  };

  const save = async () => {
    if (dates.length === 0) {
      if (!await appConfirm("清单为空会让该校区回到「按策略推算」。确认？")) return;
      saveMut.mutate([]);
      return;
    }
    saveMut.mutate(dates);
  };

  return (
    <div className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--twin-ink)]">到货周期清单</span>
        <span className="text-[10px] text-[var(--twin-mute)]">
          系统已按「预计送达策略 + 节假日」自动生成，可在此针对性调整
        </span>
      </div>

      {isLoading ? (
        <div className="py-2 text-xs text-[var(--twin-mute)]">加载中…</div>
      ) : (
        <>
          <div className="mb-2 space-y-1">
            {dates.length === 0 && (
              <div className="text-xs text-amber-700">清单为空（保存空清单会回到按策略推算）</div>
            )}
            {dates.map((d) => (
              <div key={d} className="flex items-center gap-2 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1">
                <span className="text-xs text-[var(--twin-ink)]">{d}</span>
                {d < today && <span className="rounded bg-[var(--twin-hairline)] px-1 text-[10px] text-[var(--twin-mute)]">已过期</span>}
                <div className="flex-1" />
                <input
                  type="date"
                  value={d}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    if (dates.includes(v)) { toast.error("这个日期已在清单里"); return; }
                    setDates(dates.map((x) => (x === d ? v : x)).sort());
                  }}
                  className="rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1 py-0.5 text-[11px] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setDates(dates.filter((x) => x !== d))}
                  className="text-[11px] text-[var(--app-color-feedback-danger)]"
                >
                  删除
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] outline-none"
            />
            <button
              type="button"
              onClick={add}
              disabled={!newDate}
              className="rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-[11px] font-medium text-[var(--twin-body)] disabled:opacity-50"
            >
              ＋ 新增一天
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => void regenerate()}
              className="rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-[11px] font-medium text-[var(--twin-body)]"
            >
              按策略重新生成
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saveMut.isPending}
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {saveMut.isPending ? "保存中…" : dirty ? "保存周期清单" : "已保存"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
