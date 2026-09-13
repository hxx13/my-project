import { useState } from "react";
import type { JSX } from "react";
import { useSearchParams } from "react-router-dom";
import { RecordsToolbar, DEFAULT_RECORDS_FILTERS, type RecordsFilters } from "./RecordsToolbar";
import { RecordsTable } from "./RecordsTable";
import { RecordEditorView } from "./RecordEditorView";
import { ListPageLayout } from "../shared/ListPageLayout";
import type { RecordEditorMode } from "./useRecordForm";
import { RECORDS_CREATE_SUB, parseTabFromSearch } from "../violationsTabs";

type RecordsTabProps = {
  /** 工具栏 ⚙ 齿轮 → 打开配置弹窗。 */
  onOpenConfig: () => void;
};

/** 笼架告警一键跳转的 URL 参数名：值 = animalCageId（雪花 ID 字符串），命中即直达 [笼架提交] 预填。 */
export const CAGE_STATUS_PREFILL_PARAM = "cageStatusPrefill";

/**
 * 首帧由 URL 解析 editor 初始态：告警跳转（cageStatusPrefill）优先于手动 create 哨兵。
 * 只读一次首帧，后续导航不重置 editor（closeEditor 会清掉哨兵）。
 */
function initialEditorFromSearch(search: string): RecordEditorMode | null {
  const params = new URLSearchParams(search);
  const cagePrefillId = params.get(CAGE_STATUS_PREFILL_PARAM);
  if (cagePrefillId) {
    return { kind: "create", source: "cage", cagePrefillAnimalCageId: cagePrefillId };
  }
  return parseTabFromSearch(search).sub === RECORDS_CREATE_SUB
    ? { kind: "create", source: "manual" }
    : null;
}

/**
 * 「违规记录」页面容器：内部管「列表 ↔ 开单/编辑」切换。
 * 开单来源由入口决定（工具栏按钮=手动；编辑沿用行内来源）。
 * 首帧命中 create 哨兵（`?tab=create` 或 `?tab=records&sub=create`）时直达开单表单；
 * 命中告警跳转（`?cageStatusPrefill=<animalCageId>`）时直达 [笼架提交] 并预填。
 * 只读一次首帧 URL，后续导航不会重置 editor。
 * 按人员默认筛：状态=生效中(ACTIVE)、是否禁入=已禁入(LOCKED)；另有来源多选。
 */
export function RecordsTab({ onOpenConfig }: RecordsTabProps): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [editor, setEditor] = useState<RecordEditorMode | null>(() =>
    initialEditorFromSearch(searchParams.toString())
  );
  const [filters, setFilters] = useState<RecordsFilters>(DEFAULT_RECORDS_FILTERS);

  const closeEditor = () => {
    setEditor(null);
    // 清除 create 哨兵与告警跳转参数，避免刷新后重新落到开单表单
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get("sub") === RECORDS_CREATE_SUB) next.delete("sub");
        if (next.get(CAGE_STATUS_PREFILL_PARAM)) next.delete(CAGE_STATUS_PREFILL_PARAM);
        return next;
      },
      { replace: true }
    );
  };

  if (editor) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <RecordEditorView mode={editor} onDone={closeEditor} onCancel={closeEditor} />
      </div>
    );
  }

  return (
    <ListPageLayout
      toolbar={
        <RecordsToolbar
          filters={filters}
          onChange={setFilters}
          onCreate={() => setEditor({ kind: "create", source: "manual" })}
          onOpenConfig={onOpenConfig}
        />
      }
    >
      <RecordsTable filters={filters} onEdit={(row) => setEditor({ kind: "edit", row })} />
    </ListPageLayout>
  );
}
