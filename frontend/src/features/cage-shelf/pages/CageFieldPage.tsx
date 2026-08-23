import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ChevronLeft } from "lucide-react";
import FolderTreeManager, { type FolderTreeGroup } from "@/features/nhp/components/FolderTreeManager";
import {
  createCageInfoField,
  deleteCageInfoField,
  fetchCageInfoFields,
  publishCageInfoFields,
  updateCageInfoField,
  type CageInfoField,
  type CageInfoFieldPayload,
} from "../api/cageForm.api";
import { appConfirm } from "@/lib/appDialog";
import "@/features/aup/aup.css";

/** canonical → 展示分类（笼位信息工作台字段分组） */
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
  cohabitation_date: "动物信息",
  needs_division: "状态标记",
  needs_special_feeding: "状态标记",
  needs_transfer: "状态标记",
  has_health_abnormality: "状态标记",
  special_breeding_name: "状态标记",
  special_breeding_desc: "状态标记",
};

const CATEGORY_ORDER = ["笼位身份", "项目信息", "动物信息", "状态标记"];
const UNGROUPED = "未分类";

const DATA_TYPES = [
  { value: "number", label: "数值" },
  { value: "text", label: "文本" },
  { value: "boolean", label: "布尔" },
];

const REQUIRED_OPTS = [
  { value: "YES", label: "是" },
  { value: "NO", label: "否" },
];

function typeLabel(t?: string | null): string {
  return DATA_TYPES.find((x) => x.value === t)?.label ?? t ?? "—";
}

function requiredLabel(r?: string | null): string {
  return REQUIRED_OPTS.find((x) => x.value === r)?.label ?? r ?? "—";
}

function categoryOf(field: CageInfoField): string {
  return CATEGORY_MAP[field.canonical] ?? UNGROUPED;
}

type FieldForm = {
  canonical: string;
  label: string;
  dataType: string;
  dictKey: string;
  required: string;
  sort: string;
};

const emptyForm = (): FieldForm => ({
  canonical: "",
  label: "",
  dataType: "text",
  dictKey: "",
  required: "NO",
  sort: "",
});

export interface CageFieldPageProps {
  onBack?: () => void;
}

export default function CageFieldPage({ onBack }: CageFieldPageProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { dictKey } = useParams<{ dictKey: string }>();
  const dictLabel = (dictKey || "cage").trim() || "cage";

  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<FieldForm>(emptyForm());

  const goBack = () => (onBack ? onBack() : navigate("/console/admin/cage-shelves/forms"));

  const fieldsQuery = useQuery({
    queryKey: ["cage-info", "fields"],
    queryFn: fetchCageInfoFields,
  });

  const fields = fieldsQuery.data ?? [];

  const q = keyword.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return fields;
    return fields.filter(
      (f) =>
        (f.canonical || "").toLowerCase().includes(q) ||
        (f.label || "").toLowerCase().includes(q) ||
        (f.dictKey || "").toLowerCase().includes(q),
    );
  }, [fields, q]);

  const folders = useMemo((): FolderTreeGroup<{ id: string; field: CageInfoField }>[] => {
    const byCat = new Map<string, CageInfoField[]>();
    for (const f of filtered) {
      const cat = categoryOf(f);
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
    if (order.length === 0) {
      return [
        {
          key: UNGROUPED,
          label: UNGROUPED,
          mutable: false,
          items: [],
        },
      ];
    }
    return order.map((cat) => ({
      key: cat,
      label: cat,
      mutable: false,
      items: (byCat.get(cat) ?? []).map((f) => ({ id: String(f.id), field: f })),
    }));
  }, [filtered]);

  const selected = useMemo(
    () => fields.find((f) => f.id === selectedId) ?? null,
    [fields, selectedId],
  );

  const isSynced = !!selected?.syncSource;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["cage-info", "fields"] });
  };

  const createMut = useMutation({
    mutationFn: (body: {
      canonical: string;
      label: string;
      dataType: string;
      dictKey?: string;
      required: string;
    }) => createCageInfoField(body),
    onSuccess: (f) => {
      toast.success("已新建字段");
      setCreateOpen(false);
      setForm(emptyForm());
      invalidate();
      setSelectedId(f.id);
    },
    onError: (e: Error) => toast.error(e.message || "新建失败"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: CageInfoFieldPayload }) =>
      updateCageInfoField(id, patch),
    onSuccess: () => {
      toast.success("已保存字段");
      setEditOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCageInfoField(id),
    onSuccess: () => {
      toast.success("已删除字段");
      setSelectedId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败", { duration: 6000 }),
  });

  const publishMut = useMutation({
    mutationFn: () => publishCageInfoFields(),
    onSuccess: (r) => {
      toast.success(`已发布 ${r.affected} 个字段`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "发布失败"),
  });

  const openCreate = () => {
    setForm(emptyForm());
    setCreateOpen(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setForm({
      canonical: selected.canonical,
      label: selected.label ?? "",
      dataType: selected.dataType ?? "text",
      dictKey: selected.dictKey ?? "",
      required: selected.required ?? "NO",
      sort: selected.sort != null ? String(selected.sort) : "",
    });
    setEditOpen(true);
  };

  const submitCreate = () => {
    if (!form.canonical.trim()) {
      toast.error("规范名（canonical）不能为空");
      return;
    }
    if (!form.label.trim()) {
      toast.error("显示名不能为空");
      return;
    }
    createMut.mutate({
      canonical: form.canonical.trim(),
      label: form.label.trim(),
      dataType: form.dataType,
      dictKey: form.dictKey.trim() || undefined,
      required: form.required,
    });
  };

  const submitEdit = () => {
    if (!selected) return;
    if (!form.label.trim()) {
      toast.error("显示名不能为空");
      return;
    }
    updateMut.mutate({
      id: selected.id,
      patch: {
        label: form.label.trim(),
        dataType: form.dataType,
        dictKey: form.dictKey.trim() || null,
        required: form.required,
        sort: form.sort.trim() === "" ? null : Number(form.sort),
      },
    });
  };

  const confirmDelete = async () => {
    if (!selected) return;
    if (isSynced) {
      toast.error("系统同步字段不可删除");
      return;
    }
    if (!(await appConfirm(`确定删除字段「${selected.label || selected.canonical}」？`))) return;
    deleteMut.mutate(selected.id);
  };

  const confirmPublish = async () => {
    if (!(await appConfirm("发布全部字段？未发布的自定义字段与种子字段都会标记为已发布。"))) return;
    publishMut.mutate();
  };

  const row = (label: string, input: ReactNode) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <label style={{ fontSize: 13, color: "var(--muted)", width: 88, flexShrink: 0, paddingTop: 8 }}>{label}</label>
      <div style={{ flex: 1 }}>{input}</div>
    </div>
  );

  const metaCell = (label: string, value: ReactNode, opts?: { mono?: boolean; wrap?: boolean }) => (
    <div className="aup-wb-meta-cell">
      <label>{label}</label>
      <div
        className={`val${opts?.mono ? " mono" : ""}${opts?.wrap ? " wrap" : ""}`}
        title={typeof value === "string" ? value : undefined}
      >
        {value || "—"}
      </div>
    </div>
  );

  const publishedCount = useMemo(() => fields.filter((f) => f.published).length, [fields]);

  const countText = (
    <>
      共 {filtered.length} 个字段 · 已发布 {publishedCount}
      {q ? ` · 筛选「${keyword.trim()}」` : ""}
    </>
  );

  const aside = (
    <FolderTreeManager<{ id: string; field: CageInfoField }>
      folders={folders}
      selectedItemId={selectedId != null ? String(selectedId) : null}
      onSelectItem={(id) => setSelectedId(Number(id))}
      loading={fieldsQuery.isLoading}
      canMaintain
      ungroupedKey={UNGROUPED}
      labels={{
        createItem: "＋ 新建字段",
        folderCreateItemLabel: "新增字段",
        emptyFolder: "暂无字段",
        emptyFolderAction: "新建字段",
      }}
      folderActions={() => ["createItem"]}
      itemActions={() => []}
      onCreateItem={() => openCreate()}
      headerHint="字段按规范名自动归入固定分类；系统同步字段（有 ARO 来源）不可删除。"
      emptyState={
        <div style={{ padding: 28, textAlign: "center" }}>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 8, lineHeight: 1.55 }}>
            {q ? "无匹配字段" : "尚无字段，点击下方新建。"}
          </div>
          {!q && (
            <button type="button" className="btn primary small" onClick={openCreate}>
              ＋ 新建字段
            </button>
          )}
        </div>
      }
      renderItem={(item) => {
        const f = item.field;
        return (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lbl">{f.label || f.canonical}</div>
              <div className="meta" style={{ marginTop: 2, fontFamily: "ui-monospace, monospace" }}>
                {f.canonical}
              </div>
            </div>
            {f.published ? (
              <span className="aup-wb-chip" style={{ background: "#e8f7ee", color: "#16a34a" }}>
                已发布
              </span>
            ) : (
              <span className="aup-wb-chip muted">未发布</span>
            )}
          </>
        );
      }}
    />
  );

  const main = (
    <>
      {!selected && <div className="aup-wb-empty">从左侧选一个字段查看详情</div>}

      {selected && (
        <div className="aup-wb-panel">
          <div className="aup-wb-panel-hd">
            <span className="title">{selected.label || selected.canonical}</span>
            <span className="aup-wb-chip" style={{ fontFamily: "ui-monospace, monospace" }}>
              {selected.canonical}
            </span>
            {selected.published ? (
              <span className="aup-wb-chip" style={{ background: "#e8f7ee", color: "#16a34a" }}>
                已发布
              </span>
            ) : (
              <span className="aup-wb-chip muted">未发布</span>
            )}
            {isSynced && <span className="aup-wb-chip muted">系统同步</span>}
            <div style={{ flex: 1 }} />
            <button type="button" className="btn small ghost" onClick={openEdit}>
              ✎ 编辑
            </button>
            <button
              type="button"
              className="btn small danger"
              disabled={deleteMut.isPending || isSynced}
              title={isSynced ? "系统同步字段不可删除" : "删除该字段"}
              onClick={() => void confirmDelete()}
            >
              删除
            </button>
          </div>

          <div className="aup-wb-meta-grid">
            {metaCell("规范名", selected.canonical, { mono: true })}
            {metaCell("显示名", selected.label)}
            {metaCell("数据类型", typeLabel(selected.dataType))}
            {metaCell("码表键", selected.dictKey || "—", { mono: true })}
            {metaCell("必填", requiredLabel(selected.required))}
            {metaCell("排序", selected.sort != null ? String(selected.sort) : "—", { mono: true })}
            {metaCell("角色", selected.role || "—", { mono: true })}
            {metaCell("发布", selected.published ? "已发布" : "未发布")}
            {metaCell("同步来源", selected.syncSource || "—", { wrap: true, mono: true })}
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            字段字典表 <code>cage_info_field</code> · 字段套 <code>{dictLabel}</code>。编辑仅改 label / dataType / dictKey / required / sort；canonical 与同步来源不可改。
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* 顶栏：返回 + 标题 */}
      <div className="shrink-0 flex items-center gap-2">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-0.5 text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)] transition"
        >
          <ChevronLeft className="h-3.5 w-3.5" />表单管理
        </button>
        <span className="text-[var(--twin-hairline)]">|</span>
        <h2 className="text-base font-bold text-[var(--twin-ink)]">字段配置</h2>
      </div>

      {/* 工作台（自包含 aup-wb 外壳） */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)", height: "100%" }}>
          <div className="aup-wb">
            <div className="aup-wb-toolbar">
              <button type="button" className="btn ghost small" onClick={goBack} style={{ flexShrink: 0 }}>
                ← 返回
              </button>
              <input
                className="input"
                placeholder="搜索规范名 / 显示名 / 码表键…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              {keyword.trim() && (
                <button type="button" className="btn ghost small" onClick={() => setKeyword("")}>
                  清除
                </button>
              )}
              <button type="button" className="btn ghost small" onClick={openCreate}>
                ＋ 新建字段
              </button>
              <button
                type="button"
                className="btn small primary"
                disabled={publishMut.isPending}
                onClick={() => void confirmPublish()}
              >
                发布
              </button>
              <span className="aup-wb-count">{countText}</span>
            </div>

            <div className="aup-wb-split aup-wb-split--wide-aside">
              <aside className="aup-wb-aside">{aside}</aside>
              <div className="aup-wb-main">{main}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 新建弹层 */}
      {createOpen && (
        <div className="aup-modal-mask" onClick={() => setCreateOpen(false)}>
          <div className="aup-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3>新建字段</h3>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              新建为自定义字段（无 ARO 同步来源，可增删改），默认未发布。
            </p>
            {row(
              "规范名",
              <input
                className="input"
                placeholder="如 remark_extra（canonical，唯一）"
                value={form.canonical}
                onChange={(e) => setForm({ ...form, canonical: e.target.value })}
              />,
            )}
            {row(
              "显示名",
              <input
                className="input"
                placeholder="中文显示名"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />,
            )}
            {row(
              "数据类型",
              <select className="select" value={form.dataType} onChange={(e) => setForm({ ...form, dataType: e.target.value })}>
                {DATA_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>,
            )}
            {row(
              "码表键",
              <input
                className="input"
                placeholder="可选，如 gender / rent_type"
                value={form.dictKey}
                onChange={(e) => setForm({ ...form, dictKey: e.target.value })}
              />,
            )}
            {row(
              "必填",
              <select className="select" value={form.required} onChange={(e) => setForm({ ...form, required: e.target.value })}>
                {REQUIRED_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>,
            )}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setCreateOpen(false)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!form.canonical.trim() || !form.label.trim() || createMut.isPending}
                onClick={submitCreate}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑弹层 */}
      {editOpen && selected && (
        <div className="aup-modal-mask" onClick={() => setEditOpen(false)}>
          <div className="aup-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3>编辑字段</h3>
            {row("规范名", <input className="input" value={form.canonical} disabled />)}
            {row(
              "显示名",
              <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />,
            )}
            {row(
              "数据类型",
              <select className="select" value={form.dataType} onChange={(e) => setForm({ ...form, dataType: e.target.value })}>
                {DATA_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>,
            )}
            {row(
              "码表键",
              <input
                className="input"
                placeholder="可选，留空表示无码表"
                value={form.dictKey}
                onChange={(e) => setForm({ ...form, dictKey: e.target.value })}
              />,
            )}
            {row(
              "必填",
              <select className="select" value={form.required} onChange={(e) => setForm({ ...form, required: e.target.value })}>
                {REQUIRED_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>,
            )}
            {row(
              "排序",
              <input
                className="input"
                placeholder="数值，留空为 null"
                value={form.sort}
                onChange={(e) => setForm({ ...form, sort: e.target.value })}
              />,
            )}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setEditOpen(false)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!form.label.trim() || updateMut.isPending}
                onClick={submitEdit}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
