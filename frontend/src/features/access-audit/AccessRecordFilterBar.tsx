import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { fetchDahuaDeviceChannels, type DahuaDeviceChannelRow } from "@/api/twinApi";
import { cn } from "@/lib/utils";
import { SWING_DIRECTION_OPTIONS, type SwingDirectionFilter } from "@/features/access-fusion/swingDirection";
import { AccessChannelMultiSelect } from "@/features/analytics/AccessChannelMultiSelect";

export type AccessTaskOption = {
  id?: number;
  name: string;
  periodMode?: string;
  lastPulledStart?: string;
  lastPulledEnd?: string;
};

export const OPEN_TYPE_OPTIONS = [
  { code: 51, name: "合法刷卡开门" },
  { code: 52, name: "非法刷卡开门" },
  { code: 48, name: "远程开门" },
  { code: 49, name: "按钮开门" },
];

export type AccessRecordFilters = {
  taskId: string;
  channelCode: string;
  personCode: string;
  personName: string;
  openType: string;
  /** 空=全部；ENTER/EXIT 对应大华 enter_or_exit 1/2 */
  swingDirectionFilter: SwingDirectionFilter;
  startTime: string;
  endTime: string;
  requireMapping: boolean;
  openSuccessOnly: boolean;
  /** 清洗总库表筛选（门禁统计清洗页） */
  libraryActionType: "" | "1" | "2";
  libraryDisposition: string;
  libraryAudience: string;
  libraryPersonName: string;
};

export const emptyAccessFilters = (): AccessRecordFilters => ({
  taskId: "",
  channelCode: "",
  personCode: "",
  personName: "",
  openType: "",
  swingDirectionFilter: "",
  startTime: "",
  endTime: "",
  requireMapping: false,
  openSuccessOnly: true,
  libraryActionType: "",
  libraryDisposition: "",
  libraryAudience: "",
  libraryPersonName: "",
});

export const todayRange = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return { start: `${y}-${m}-${d}T00:00`, end: `${y}-${m}-${d}T23:59` };
};

export const toApiDateTime = (v: string) => (v ? `${v.replace("T", " ")}:00` : "");

type Props = {
  tasks: AccessTaskOption[];
  filters: AccessRecordFilters;
  onChange: (next: AccessRecordFilters) => void;
  onSearch: () => void;
  leading?: ReactNode;
  stats?: ReactNode;
  extraActions?: ReactNode;
  /** 主按钮文案，默认「查询」 */
  searchLabel?: string;
  /** 与统计任务同行的配置按钮区（通道漏斗、去抖等） */
  configSlot?: ReactNode;
  /** 隐藏「更多筛选」中的进出类型（总库页由独立筛选条承担） */
  hideActionType?: boolean;
  /** 清洗总库：已启用通道多选（与隔离服统计 channelCodes 同源） */
  cleanChannelCodes?: string[];
  onCleanChannelCodesChange?: (codes: string[]) => void;
  /** 在「更多筛选」中展示总库字段筛选 */
  showLibraryFilters?: boolean;
};

export const accessFilterToolbarBtnClass =
  "h-8 shrink-0 inline-flex items-center justify-center gap-1 rounded border px-2.5 text-xs whitespace-nowrap";

const fieldClass = "flex flex-col gap-0.5 text-[11px] text-slate-600 min-w-0";
const inputClass = "h-8 rounded border px-2 text-xs bg-white min-w-0 w-full";

function countAdvancedActive(f: AccessRecordFilters): number {
  let n = 0;
  if (f.channelCode) n++;
  if (f.libraryActionType) n++;
  if (f.libraryDisposition) n++;
  if (f.libraryAudience) n++;
  if (f.libraryPersonName.trim()) n++;
  if (f.personName.trim()) n++;
  if (f.openType) n++;
  if (f.swingDirectionFilter) n++;
  if (f.startTime || f.endTime) n++;
  if (f.requireMapping) n++;
  if (!f.openSuccessOnly) n++;
  return n;
}

export function AccessRecordFilterBar({
  tasks,
  filters,
  onChange,
  onSearch,
  leading,
  stats,
  extraActions,
  searchLabel = "查询",
  configSlot,
  hideActionType = false,
  cleanChannelCodes,
  onCleanChannelCodesChange,
  showLibraryFilters = false,
}: Props) {
  const useCleanChannels = cleanChannelCodes != null && onCleanChannelCodesChange != null;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [channelKeyword, setChannelKeyword] = useState("");
  const [channelOptions, setChannelOptions] = useState<DahuaDeviceChannelRow[]>([]);
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false);
  const advancedCount = useMemo(() => countAdvancedActive(filters), [filters]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchDahuaDeviceChannels({ page: 1, pageSize: 100, keyword: channelKeyword.trim() });
        setChannelOptions(res.list || []);
      } catch {
        setChannelOptions([]);
      }
    })();
  }, [channelKeyword]);

  return (
    <div className="rounded-xl border bg-white p-2 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        {leading}

        <label className={cn(fieldClass, "w-[min(100%,140px)] sm:w-[140px]")}>
          <span className="whitespace-nowrap">统计任务</span>
          <select
            className={inputClass}
            value={filters.taskId}
            onChange={(e) => onChange({ ...filters, taskId: e.target.value })}
          >
            <option value="">全部</option>
            {tasks.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        {configSlot ? (
          <div className={cn(fieldClass, "shrink-0")}>
            <span className="whitespace-nowrap">清洗配置</span>
            <div className="flex h-8 items-center gap-1">{configSlot}</div>
          </div>
        ) : null}

        {stats ? <div className="pb-1 text-[11px] text-slate-600">{stats}</div> : null}

        {extraActions}

        <button
          type="button"
          className={cn(
            "h-8 shrink-0 inline-flex items-center gap-1 rounded border px-2.5 text-xs whitespace-nowrap",
            advancedOpen ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "bg-white text-slate-700"
          )}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          更多筛选
          {advancedCount > 0 ? (
            <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] text-white">{advancedCount}</span>
          ) : null}
          <ChevronDown className={cn("h-3.5 w-3.5 transition", advancedOpen && "rotate-180")} />
        </button>

        <button
          type="button"
          className="h-8 shrink-0 rounded bg-slate-900 px-3 text-xs text-white whitespace-nowrap"
          onClick={onSearch}
        >
          {searchLabel}
        </button>
      </div>

      {useCleanChannels ? (
        <AccessChannelMultiSelect
          variant="inline"
          selected={cleanChannelCodes}
          onChange={onCleanChannelCodesChange}
          className="border-t border-slate-100 pt-2"
        />
      ) : null}

      {advancedOpen ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2">
          {!useCleanChannels ? (
          <label className={cn(fieldClass, "w-[min(100%,200px)] sm:w-[200px]")}>
            <span className="whitespace-nowrap">通道</span>
            <div className="relative">
              <div className="flex h-8 items-center rounded border bg-white">
                <input
                  className="min-w-0 flex-1 px-2 text-xs outline-none"
                  placeholder="全部"
                  value={channelKeyword}
                  onChange={(e) => {
                    setChannelKeyword(e.target.value);
                    setChannelDropdownOpen(true);
                  }}
                  onFocus={() => setChannelDropdownOpen(true)}
                />
                <button
                  type="button"
                  className="h-full shrink-0 px-1.5 text-slate-500"
                  onClick={() => setChannelDropdownOpen((v) => !v)}
                >
                  ▾
                </button>
              </div>
              {channelDropdownOpen ? (
                <div className="absolute z-20 mt-1 max-h-48 w-[220px] overflow-auto rounded border bg-white shadow">
                  <button
                    type="button"
                    className="block w-full px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                    onClick={() => {
                      onChange({ ...filters, channelCode: "" });
                      setChannelKeyword("");
                      setChannelDropdownOpen(false);
                    }}
                  >
                    全部通道
                  </button>
                  {channelOptions.map((ch) => {
                    const code = (ch.channelCode || "").trim();
                    if (!code) return null;
                    const label = `${ch.channelName || "未命名"} / ${code}`;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        className="block w-full px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                        onClick={() => {
                          onChange({ ...filters, channelCode: code });
                          setChannelKeyword(label);
                          setChannelDropdownOpen(false);
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </label>
          ) : null}

          {showLibraryFilters ? (
            <>
              <label className={cn(fieldClass, "w-[88px]")}>
                <span className="whitespace-nowrap">进出</span>
                <select
                  className={inputClass}
                  value={filters.libraryActionType}
                  onChange={(e) =>
                    onChange({ ...filters, libraryActionType: e.target.value as AccessRecordFilters["libraryActionType"] })
                  }
                >
                  <option value="">全部</option>
                  <option value="1">仅进入</option>
                  <option value="2">仅离开</option>
                </select>
              </label>
              <label className={cn(fieldClass, "w-[88px]")}>
                <span className="whitespace-nowrap">纳入</span>
                <select
                  className={inputClass}
                  value={filters.libraryDisposition}
                  onChange={(e) => onChange({ ...filters, libraryDisposition: e.target.value })}
                >
                  <option value="">全部</option>
                  <option value="INCLUDED">纳入</option>
                  <option value="EXCLUDED">排除</option>
                </select>
              </label>
              <label className={cn(fieldClass, "w-[88px]")}>
                <span className="whitespace-nowrap">受众</span>
                <select
                  className={inputClass}
                  value={filters.libraryAudience}
                  onChange={(e) => onChange({ ...filters, libraryAudience: e.target.value })}
                >
                  <option value="">全部</option>
                  <option value="STUDENT">学生</option>
                  <option value="STAFF">工作人员</option>
                </select>
              </label>
              <label className={cn(fieldClass, "w-[120px]")}>
                <span className="whitespace-nowrap">人员</span>
                <input
                  className={inputClass}
                  placeholder="姓名"
                  value={filters.libraryPersonName}
                  onChange={(e) => onChange({ ...filters, libraryPersonName: e.target.value })}
                />
              </label>
            </>
          ) : null}

          <label className={cn(fieldClass, "w-[108px]")}>
            <span className="whitespace-nowrap">开门类型</span>
            <select
              className={inputClass}
              value={filters.openType}
              onChange={(e) => onChange({ ...filters, openType: e.target.value })}
            >
              <option value="">全部</option>
              {OPEN_TYPE_OPTIONS.map((it) => (
                <option key={it.code} value={it.code}>
                  {it.name}
                </option>
              ))}
            </select>
          </label>

          {!hideActionType ? (
            <label className={cn(fieldClass, "w-[96px]")}>
              <span className="whitespace-nowrap">进出类型</span>
              <select
                className={inputClass}
                value={filters.swingDirectionFilter}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    swingDirectionFilter: e.target.value as SwingDirectionFilter,
                  })
                }
              >
                {SWING_DIRECTION_OPTIONS.map((it) => (
                  <option key={it.value || "ALL"} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className={cn(fieldClass, "w-[min(100%,160px)] sm:w-[160px]")}>
            <span className="whitespace-nowrap">人员姓名</span>
            <input
              className={inputClass}
              placeholder="模糊搜索"
              value={filters.personName}
              onChange={(e) => onChange({ ...filters, personCode: "", personName: e.target.value })}
            />
          </label>

          <label className={cn(fieldClass, "w-[148px]")}>
            <span className="whitespace-nowrap">开始时间</span>
            <input
              type="datetime-local"
              className={inputClass}
              value={filters.startTime}
              onChange={(e) => onChange({ ...filters, startTime: e.target.value })}
            />
          </label>

          <label className={cn(fieldClass, "w-[148px]")}>
            <span className="whitespace-nowrap">结束时间</span>
            <input
              type="datetime-local"
              className={inputClass}
              value={filters.endTime}
              onChange={(e) => onChange({ ...filters, endTime: e.target.value })}
            />
          </label>

          <div className={fieldClass}>
            <span className="whitespace-nowrap">时间快捷</span>
            <div className="flex h-8 items-center gap-1">
              <button
                type="button"
                className="h-8 rounded border px-2 text-[11px] bg-white"
                onClick={() => onChange({ ...filters, startTime: "", endTime: "" })}
              >
                全部
              </button>
              <button
                type="button"
                className="h-8 rounded border px-2 text-[11px] bg-white"
                onClick={() => {
                  const t = todayRange();
                  onChange({ ...filters, startTime: t.start, endTime: t.end });
                }}
              >
                今天
              </button>
            </div>
          </div>

          <label className="flex h-8 items-center gap-1 text-[11px] text-slate-600 whitespace-nowrap">
            <AdminSwitchScaled
              size="3.5"
              checked={filters.requireMapping}
              onChange={(checked) => onChange({ ...filters, requireMapping: checked })}
            />
            已映射
          </label>
          <label className="flex h-8 items-center gap-1 text-[11px] text-slate-600 whitespace-nowrap">
            <AdminSwitchScaled
              size="3.5"
              checked={filters.openSuccessOnly}
              onChange={(checked) => onChange({ ...filters, openSuccessOnly: checked })}
            />
            开门成功
          </label>
        </div>
      ) : null}
    </div>
  );
}
