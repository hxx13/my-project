/**
 * 笼位表单编辑器（MVP 桩）— 对齐 NhpTemplateEditor 路由与壳层。
 *
 * Phase 2：章节树、题型、showWhen、字段引用、版本发布等完整编辑能力。
 * MVP：展示已发布字段分组预览 + 跳转字段字典维护。
 */
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AdminButton } from "@/components/admin/AdminButton";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { fetchCageInfoFields } from "../api/cageForm.api";
import { CAGE_DICT_KEY } from "../components/CageFieldDictWorkbench";
import { CAGE_FORM_KEY, CAGE_FORM_TITLE } from "../cageFormConstants";
import { CageFormPageShell } from "../components/CageFormPageShell";
import { typeLabelOf } from "@/features/nhp/schema/typeRegistry";
import "@/features/aup/aup.css";
import "../cage-form.css";

const CATEGORY_MAP: Record<string, string> = {
  animal_cage_id: "笼位身份",
  position_x: "笼位身份",
  position_y: "笼位身份",
  cage_type_code: "笼位身份",
  state: "笼位身份",
  state_label: "笼位身份",
  rent_type: "笼位身份",
  cage_name: "笼位身份",
  cage_box_code: "笼位身份",
  cage_box_name: "笼位身份",
  pi_name: "项目信息",
  project_pi_name: "项目信息",
  project_name: "项目信息",
  department_name: "项目信息",
  aup_number: "项目信息",
  experimenter_name: "项目信息",
  lab_assistant_name: "项目信息",
  animal_strain_name: "动物信息",
  animal_sex: "动物信息",
  animal_week_age: "动物信息",
  animal_male_number: "动物信息",
  animal_female_number: "动物信息",
  animal_come_from: "动物信息",
  cage_use_time: "动物信息",
  needs_division: "状态标记",
  needs_special_feeding: "状态标记",
  needs_transfer: "状态标记",
  has_health_abnormality: "状态标记",
  special_breeding_name: "状态标记",
  special_breeding_desc: "状态标记",
};

const CATEGORY_ORDER = ["笼位身份", "项目信息", "动物信息", "状态标记", "未分类"];

function categoryOf(canonical: string): string {
  return CATEGORY_MAP[canonical] ?? "未分类";
}

// 取值引擎未接入，PK/FK/DERIVED 均为占位（只读，不接任何取号器）
const ROLE_LABEL: Record<string, string> = {
  VALUE: "可填写",
  DERIVED: "自动获取",
  PK: "PK 取号",
  FK: "FK 实体",
};
function roleLabel(r?: string | null): string {
  return (r && ROLE_LABEL[r]) || "";
}

export default function CageFormEditorPage() {
  const navigate = useNavigate();
  const { formKey: formKeyParam } = useParams<{ formKey: string }>();
  const formKey = (formKeyParam || "").trim() || CAGE_FORM_KEY;

  const fieldsQuery = useQuery({
    queryKey: ["cage-info", "fields"],
    queryFn: fetchCageInfoFields,
  });

  const fields = fieldsQuery.data ?? [];
  const publishedFields = useMemo(() => fields.filter((f) => f.published), [fields]);

  const sections = useMemo(() => {
    const byCat = new Map<string, typeof publishedFields>();
    for (const f of publishedFields) {
      const cat = categoryOf(f.canonical);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(f);
    }
    for (const list of byCat.values()) {
      list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.canonical.localeCompare(b.canonical));
    }
    const order = [
      ...CATEGORY_ORDER.filter((c) => byCat.has(c)),
      ...Array.from(byCat.keys()).filter((c) => !CATEGORY_ORDER.includes(c)),
    ];
    return order.map((cat) => ({ title: cat, fields: byCat.get(cat) ?? [] }));
  }, [publishedFields]);

  const toolbar = (
    <>
      <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">{CAGE_FORM_TITLE}</span>
      <span className="rounded-md bg-[var(--app-color-surface-container)] px-2 py-0.5 font-mono text-xs text-[var(--app-color-text-secondary)]">
        {formKey}
      </span>
      <span className="text-xs text-[var(--app-color-text-tertiary)]">
        {publishedFields.length} 已发布字段
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <AdminButton
          type="button"
          tone="ghost"
          size="sm"
          onClick={() => navigate(toAdminRoutePath(`/admin/cage-shelves/forms/fields/${CAGE_DICT_KEY}`))}
        >
          管理字段
        </AdminButton>
      </div>
    </>
  );

  if (formKey !== CAGE_FORM_KEY) {
    return (
      <CageFormPageShell backTo="/admin/cage-shelves/forms" toolbar={toolbar}>
        <div className="aup-wb-empty">未知表单 {formKey}</div>
      </CageFormPageShell>
    );
  }

  return (
    <CageFormPageShell backTo="/admin/cage-shelves/forms" toolbar={toolbar}>
      <div className="aup-app aup-app--workbench cage-form-wb min-h-0 flex-1">
        <div className="aup-wb">
          <div className="aup-wb-main aup-wb-main--full overflow-auto p-4">
            <div
              className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              role="status"
            >
              <strong>MVP 预览模式</strong>
              ：完整章节编辑、题型配置、条件显示（showWhen）与版本发布将在 Phase 2 实现。当前表单结构由
              <code className="mx-1 rounded bg-amber-100 px-1">cage_info_field</code>
              已发布字段自动派生。
            </div>

            {fieldsQuery.isLoading && <div className="aup-empty">加载字段…</div>}

            {!fieldsQuery.isLoading && publishedFields.length === 0 && (
              <div className="aup-empty">
                尚无已发布字段。
                <button
                  type="button"
                  className="btn primary small"
                  style={{ marginTop: 12 }}
                  onClick={() => navigate(toAdminRoutePath(`/admin/cage-shelves/forms/fields/${CAGE_DICT_KEY}`))}
                >
                  去字段页发布
                </button>
              </div>
            )}

            {sections.map((sec) => (
              <div key={sec.title} className="aup-wb-panel" style={{ marginBottom: 16 }}>
                <div className="aup-wb-panel-hd">
                  <span className="title">{sec.title}</span>
                  <span className="aup-wb-chip muted">{sec.fields.length} 字段</span>
                </div>
                <div className="aup-wb-meta-grid">
                  {sec.fields.map((f) => (
                    <div key={f.id} className="aup-wb-meta-cell">
                      <label>{f.label || f.canonical}</label>
                      <div className="val mono" style={{ fontSize: 12 }}>
                        {f.canonical}
                        {f.fieldType ? ` · ${typeLabelOf(f.fieldType as never)}` : f.dataType ? ` · ${f.dataType}` : ""}
                        {f.dictKey ? ` · ${f.dictKey}` : ""}
                        {roleLabel(f.role) ? ` · ${roleLabel(f.role)}` : ""}
                        {f.required === "YES" ? " · 必填" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </CageFormPageShell>
  );
}
