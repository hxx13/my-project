import type { JSX } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Search, Settings } from "lucide-react";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSegmentedControl } from "@/components/admin/AdminSegmentedControl";
import {
  VIOLATION_STATUS_LABEL,
  type StudentViolationStatus,
} from "@/api/domains/studentViolation.api";
import { MultiSelectField } from "../shared/MultiSelectField";
import type { MultiSelectOption } from "../shared/multiSelectModel";

export type RecordsView = "person" | "cage";
export type RecordsSource = "MANUAL" | "CAGE_STATUS" | "AUTO_STRANDED";
export type RecordsEnterLock = "LOCKED" | "UNLOCKED";

export type RecordsFilters = {
  keyword: string;
  statuses: StudentViolationStatus[];
  sources: RecordsSource[];
  enterLocks: RecordsEnterLock[];
  view: RecordsView;
};

/** 按人员视图初始筛选：状态=生效中 + 是否禁入=已禁入（默认显示筛过的禁入人员） */
export const DEFAULT_PERSON_RECORDS_FILTERS: RecordsFilters = {
  keyword: "",
  statuses: ["ACTIVE"],
  sources: [],
  enterLocks: ["LOCKED"],
  view: "person",
};

const STATUS_OPTIONS: MultiSelectOption<StudentViolationStatus>[] = (
  Object.keys(VIOLATION_STATUS_LABEL) as StudentViolationStatus[]
).map((s) => ({ value: s, label: VIOLATION_STATUS_LABEL[s] }));

const SOURCE_OPTIONS: MultiSelectOption<RecordsSource>[] = [
  { value: "MANUAL", label: "手动", desc: "管理员手动新建" },
  { value: "CAGE_STATUS", label: "笼架联动", desc: "笼架状态触发" },
  { value: "AUTO_STRANDED", label: "自动滞留", desc: "滞留检测自动创建" },
];

const ENTER_LOCK_OPTIONS: MultiSelectOption<RecordsEnterLock>[] = [
  { value: "LOCKED", label: "已禁入", desc: "当前禁止进入", tone: "danger" },
  { value: "UNLOCKED", label: "可进入", desc: "当前允许进入", tone: "ok" },
];

const VIEW_OPTIONS: { value: RecordsView; label: string }[] = [
  { value: "person", label: "按人员" },
  { value: "cage", label: "按笼架" },
];

type RecordsToolbarProps = {
  filters: RecordsFilters;
  onChange: (next: RecordsFilters) => void;
  onCreate: () => void;
  onOpenConfig: () => void;
};

/**
 * 记录页工具栏（对齐原型 v4 `.toolbar`）：
 * 搜索(定宽) + 状态/来源/是否禁入 筛选(按笼架视图占位隐藏，避免切换时左右重排) + 视图分段 + 右侧组[刷新 | ＋新建违规 | 分隔线 | ⚙ 配置]。
 */
export function RecordsToolbar({ filters, onChange, onCreate, onOpenConfig }: RecordsToolbarProps): JSX.Element {
  const qc = useQueryClient();
  const isCage = filters.view === "cage";
  const onRefresh = () => {
    qc.invalidateQueries({ queryKey: ["studentViolations"] });
    qc.invalidateQueries({ queryKey: ["cage-status-violations"] });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 pb-1 pt-0.5">
      <div className="flex w-52 shrink-0 items-center gap-2 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 py-1.5 transition-colors focus-within:border-[var(--app-color-accent)]">
        <Search className="h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)]" aria-hidden />
        <input
          className="w-full min-w-0 bg-transparent text-[13px] text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)]"
          placeholder={isCage ? "搜索课题组 / 笼位 / 校区 / 房间…" : "搜索姓名 / 工号 / 规则…"}
          value={filters.keyword}
          onChange={(e) => onChange({ ...filters, keyword: e.target.value })}
        />
      </div>

      {/* 固定槽位：按笼架时仍占宽，避免分段控件与右侧操作左右跳动 */}
      <div className="w-36 shrink-0" aria-hidden={isCage}>
        {isCage ? null : (
          <MultiSelectField
            options={STATUS_OPTIONS}
            value={filters.statuses}
            onChange={(statuses) => onChange({ ...filters, statuses })}
            placeholder="状态"
          />
        )}
      </div>
      <div className="w-40 shrink-0" aria-hidden={isCage}>
        {isCage ? null : (
          <MultiSelectField
            options={SOURCE_OPTIONS}
            value={filters.sources}
            onChange={(sources) => onChange({ ...filters, sources })}
            placeholder="来源"
          />
        )}
      </div>
      <div className="w-36 shrink-0" aria-hidden={isCage}>
        {isCage ? null : (
          <MultiSelectField
            options={ENTER_LOCK_OPTIONS}
            value={filters.enterLocks}
            onChange={(enterLocks) => onChange({ ...filters, enterLocks })}
            placeholder="是否禁入"
          />
        )}
      </div>

      <AdminSegmentedControl
        options={VIEW_OPTIONS}
        value={filters.view}
        onChange={(view) => onChange({ ...filters, view })}
        aria-label="记录视图"
        className="shrink-0"
      />

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <AdminButton type="button" tone="secondary" size="sm" className="gap-1.5" onClick={onRefresh} title="刷新列表">
          <RefreshCw className="h-4 w-4" aria-hidden />
          刷新
        </AdminButton>
        <AdminButton type="button" tone="primary" size="sm" className="gap-1.5" onClick={onCreate}>
          <Plus className="h-4 w-4" aria-hidden />
          新建违规
        </AdminButton>
        <span className="mx-0.5 h-6 w-px shrink-0 bg-[var(--app-color-border-default)]" aria-hidden />
        <AdminButton
          type="button"
          tone="secondary"
          size="sm"
          aria-label="配置"
          title="配置"
          onClick={onOpenConfig}
          className="px-2"
        >
          <Settings className="h-5 w-5" aria-hidden />
        </AdminButton>
      </div>
    </div>
  );
}
