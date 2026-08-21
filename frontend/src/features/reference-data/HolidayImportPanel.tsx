import { useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  useAnimalOrderHolidays,
  useAnimalOrderTimePolicy,
  useCreateAnimalOrderHoliday,
  useDeleteAnimalOrderHoliday,
  useImportAnimalOrderHolidays,
  useSyncAnimalOrderHolidaysCdn,
} from "@/api/hooks/useAnimalOrderTime";
import type { AnimalOrderHoliday } from "@/api/domains/animalOrderTime.api";

import { appConfirm } from "@/lib/appDialog";
const DAY_TYPE_LABEL: Record<string, string> = {
  HOLIDAY: "节假日",
  WORKDAY_SHIFT: "调休上班",
};

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "手工",
  IMPORT: "导入",
  CDN: "CDN",
};

function currentYear(): number {
  return new Date().getFullYear();
}

export default function HolidayImportPanel() {
  const [year, setYear] = useState(currentYear());
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: holidays = [], isLoading } = useAnimalOrderHolidays(year);
  const { data: timePolicy } = useAnimalOrderTimePolicy();

  const createMut = useCreateAnimalOrderHoliday();
  const deleteMut = useDeleteAnimalOrderHoliday();
  const importMut = useImportAnimalOrderHolidays();
  const syncMut = useSyncAnimalOrderHolidaysCdn();

  const [formOpen, setFormOpen] = useState(false);
  const [formDate, setFormDate] = useState("");
  const [formType, setFormType] = useState<"HOLIDAY" | "WORKDAY_SHIFT">("HOLIDAY");
  const [formName, setFormName] = useState("");

  const yearOptions = useMemo(() => {
    const y = currentYear();
    return [y - 1, y, y + 1];
  }, []);

  const showEmptyYearWarning =
    holidays.length === 0 &&
    (timePolicy?.warnings?.includes("ANIMAL_ORDER_HOLIDAY_YEAR_EMPTY") ?? false);

  function resetForm() {
    setFormDate("");
    setFormType("HOLIDAY");
    setFormName("");
    setFormOpen(false);
  }

  function handleCreate() {
    if (!formDate) {
      toast.error("请选择日期");
      return;
    }
    const body: AnimalOrderHoliday = {
      holidayDate: formDate,
      dayType: formType,
      name: formName.trim() || null,
      source: "MANUAL",
    };
    createMut.mutate(body, {
      onSuccess: () => resetForm(),
      onError: (e: Error) => toast.error(e.message || "保存失败"),
    });
  }

  async function handleDelete(id: number) {
    if (!await appConfirm("确认删除此节假日？")) return;
    deleteMut.mutate(
      { id, year },
      { onError: (e: Error) => toast.error(e.message || "删除失败") },
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    importMut.mutate(file, {
      onSuccess: (result) => {
        if (result.year) setYear(result.year);
      },
      onError: (err: Error) => toast.error(err.message || "导入失败"),
    });
    e.target.value = "";
  }

  function handleSyncCdn() {
    syncMut.mutate(year, {
      onError: (e: Error) => toast.error(e.message || "同步失败"),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-[var(--twin-body)]">
          <span>年份</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileChange} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importMut.isPending}
          className="rounded-full border border-[var(--twin-hairline)] px-3 py-1 text-xs font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] disabled:opacity-50"
        >
          {importMut.isPending ? "导入中…" : "上传 JSON"}
        </button>
        <button
          type="button"
          onClick={handleSyncCdn}
          disabled={syncMut.isPending}
          className="rounded-full border border-[var(--twin-hairline)] px-3 py-1 text-xs font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] disabled:opacity-50"
        >
          {syncMut.isPending ? "同步中…" : "从 holiday-cn 同步"}
        </button>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="rounded-full border border-dashed border-[var(--twin-hairline)] px-3 py-1 text-xs text-[var(--twin-body)] hover:border-[var(--twin-link)] hover:text-[var(--twin-link)]"
        >
          + 手工新增
        </button>
      </div>

      {showEmptyYearWarning && (
        <div className="rounded-twin-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {year} 年节假日数据为空，工作日计算可能不准确。请导入 JSON 或从 CDN 同步。
        </div>
      )}

      {formOpen && (
        <div className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
          <div className="mb-2 text-xs font-semibold text-[var(--twin-ink)]">新增节假日</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-[var(--twin-mute)]">日期</span>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-[var(--twin-mute)]">类型</span>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as "HOLIDAY" | "WORKDAY_SHIFT")}
                className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="HOLIDAY">节假日</option>
                <option value="WORKDAY_SHIFT">调休上班</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-[var(--twin-mute)]">名称（可选）</span>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="如：国庆节"
                className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={createMut.isPending}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {createMut.isPending ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-twin-md border border-[var(--twin-hairline)]">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)]">
            <tr>
              <th className="px-3 py-2 font-medium">日期</th>
              <th className="px-3 py-2 font-medium">类型</th>
              <th className="px-3 py-2 font-medium">名称</th>
              <th className="px-3 py-2 font-medium">来源</th>
              <th className="px-3 py-2 font-medium w-16">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[var(--twin-mute)]">
                  加载中…
                </td>
              </tr>
            ) : holidays.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[var(--twin-mute)]">
                  暂无 {year} 年节假日数据
                </td>
              </tr>
            ) : (
              holidays.map((row) => (
                <tr key={row.id ?? row.holidayDate} className="border-t border-[var(--twin-hairline)]">
                  <td className="px-3 py-2 text-[var(--twin-ink)]">{row.holidayDate}</td>
                  <td className="px-3 py-2">{DAY_TYPE_LABEL[row.dayType] ?? row.dayType}</td>
                  <td className="px-3 py-2 text-[var(--twin-body)]">{row.name || "—"}</td>
                  <td className="px-3 py-2 text-[var(--twin-mute)]">
                    {SOURCE_LABEL[row.source ?? ""] ?? row.source ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {row.id != null && (
                      <button
                        type="button"
                        onClick={() => handleDelete(row.id!)}
                        disabled={deleteMut.isPending}
                        className="text-[10px] text-red-500 hover:underline disabled:opacity-50"
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
