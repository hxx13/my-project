import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, MapPin, Settings } from "lucide-react";
import { BlacklistManageModal } from "@/components/admin/BlacklistManageModal";
import { AdminToolbar } from "@/components/admin/AdminToolbar";
import type { DebugPipelineFilter } from "@/features/twin-debug/debugPipelineFilter";

type Props = {
  filters: DebugPipelineFilter;
  onChange: (next: DebugPipelineFilter) => void;
  onClear: () => void;
  invalidateKeys?: string[][];
  className?: string;
};

export function DebugPipelineFilterBar({ filters, onChange, onClear, invalidateKeys, className }: Props) {
  const queryClient = useQueryClient();
  const [isBlacklistOpen, setIsBlacklistOpen] = useState(false);

  const invalidateRelated = () => {
    for (const key of invalidateKeys ?? []) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const handleCampusChange = (selectedCampus: string) => {
    onChange({
      ...filters,
      campus: selectedCampus,
      floor: selectedCampus === "浦东" ? filters.floor : "",
    });
  };

  const setToday = () => {
    const today = new Date().toISOString().split("T")[0];
    onChange({ ...filters, startTime: today, endTime: today });
  };

  return (
    <>
      <AdminToolbar
        data-twin-debug-pipeline-filters
        className={
          className ??
          "shrink-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm !items-stretch"
        }
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1.5">
            <Calendar className="ml-2 h-4 w-4 text-slate-400" />
            <input
              type="date"
              value={filters.startTime}
              onChange={(e) => onChange({ ...filters, startTime: e.target.value })}
              className="w-[110px] cursor-pointer bg-transparent text-[13px] font-bold text-slate-700 outline-none"
            />
            <span className="text-slate-300">-</span>
            <input
              type="date"
              value={filters.endTime}
              onChange={(e) => onChange({ ...filters, endTime: e.target.value })}
              className="w-[110px] cursor-pointer bg-transparent text-[13px] font-bold text-slate-700 outline-none"
            />
            <button
              type="button"
              onClick={setToday}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
            >
              今日
            </button>
          </div>

          <div className="mx-1 h-6 w-px bg-slate-200" />

          <select
            value={filters.actionType}
            onChange={(e) => onChange({ ...filters, actionType: e.target.value as DebugPipelineFilter["actionType"] })}
            className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-[13px] font-bold text-slate-700 outline-none"
          >
            <option value="">全部动作</option>
            <option value="1">只看进入</option>
            <option value="2">只看离开</option>
          </select>

          <div className="mx-1 h-6 w-px bg-slate-200" />

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
            <MapPin className="h-4 w-4 text-slate-400" />
            <select
              value={filters.campus}
              onChange={(e) => handleCampusChange(e.target.value)}
              className="cursor-pointer bg-transparent text-[13px] font-bold text-slate-700 outline-none"
            >
              <option value="">全部校区</option>
              <option value="浦东">浦东校区</option>
              <option value="浦西">浦西校区</option>
            </select>
          </div>

          {filters.campus === "浦东" && (
            <select
              value={filters.floor}
              onChange={(e) => onChange({ ...filters, floor: e.target.value })}
              className="cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-2 text-[13px] font-bold text-indigo-700 outline-none"
            >
              <option value="">全部楼层</option>
              <option value="E11A">地下室 E11A 区</option>
              <option value="E11B">地下室 E11B 区</option>
              <option value="地下E11C">地下室 E11C 区</option>
              <option value="1">1F (101等)</option>
              <option value="2">2F (201等)</option>
              <option value="3">3F (301等)</option>
              <option value="4">4F (401等)</option>
            </select>
          )}

          <input
            type="text"
            placeholder="房号尾数 (如: 01A)"
            value={filters.roomName}
            onChange={(e) => onChange({ ...filters, roomName: e.target.value })}
            className="w-[130px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-bold text-slate-700 outline-none transition-colors focus:border-indigo-400"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 sm:border-t-0 sm:pt-0">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={filters.excludeBlacklist}
                onChange={(e) => onChange({ ...filters, excludeBlacklist: e.target.checked })}
              />
              <div
                className={`block h-6 w-10 rounded-full transition-colors ${filters.excludeBlacklist ? "bg-indigo-500" : "bg-slate-300"}`}
              />
              <div
                className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${filters.excludeBlacklist ? "translate-x-4" : ""}`}
              />
            </div>
            <span className="select-none text-xs font-bold text-slate-600">排除黑名单</span>
          </label>
          <button
            type="button"
            onClick={() => setIsBlacklistOpen(true)}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
            title="管理黑名单"
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-bold text-slate-400 underline underline-offset-2 hover:text-rose-500"
          >
            清除过滤
          </button>
        </div>
      </AdminToolbar>

      <BlacklistManageModal
        open={isBlacklistOpen}
        onClose={() => setIsBlacklistOpen(false)}
        onChanged={invalidateRelated}
      />
    </>
  );
}
