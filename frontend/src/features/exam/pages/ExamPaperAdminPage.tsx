import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { fetchFormPage, fetchWordTemplates } from "@/features/report-form/api/reportForm.api";
import { PdfPreviewDialog } from "@/components/common/PdfPreviewDialog";
import { Download, FileText, Loader2, Plus, Save, Search, Trash2, Undo2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  createExamFolder,
  createExamPaper,
  deleteExamFolder,
  deleteExamPaper,
  fetchExamFolders,
  fetchExamPaper,
  fetchExamPapers,
  fetchExamSeeds,
  fetchQualificationBinding,
  fetchQualificationPreview,
  importExamSeeds,
  moveExamPaperToFolder,
  publishExamPaper,
  renameExamFolder,
  unpublishExamPaper,
  saveExamPaper,
  saveQualificationBinding,
  type ExamPaperSummary,
  type ExamSeed,
} from "../api/examPaper.api";
import { useTemplateEditor } from "../store/useTemplateEditor";
import { buildFieldCatalog, nextFieldKey } from "../store/editorUtils";
import { typeLabelOf, typeMetaOf } from "../schema/typeRegistry";
import type { FieldType, FormField } from "../schema/formTemplate";
import SectionTree from "../editor/SectionTree";
import TypeMenu from "../editor/TypeMenu";
import FieldEditorPanel from "../editor/FieldEditorPanel";
import ExamFormField from "../components/ExamFormField";
import FolderTreeManager, { type FolderAction, type FolderTreeGroup } from "@/features/form-shared/FolderTreeManager";
import { fetchExamSubmissions } from "../api/examSubmission.api";
import "@/features/aup/aup.css";

function statusBadge(status: string) {
  const published = status === "PUBLISHED";
  return (
    <span className={cn("text-[11px] px-2 py-0.5 rounded font-medium", published ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
      {published ? "已发布" : "草稿"}
    </span>
  );
}

const UNGROUPED_KEY = "__ungrouped__";

const FOLDER_LABELS = {
  createFolder: "＋ 新建文件夹",
  createItem: "＋ 新建试卷",
  renameFolder: "编辑名称",
  deleteFolder: "删除",
  moveItem: "移动",
  emptyFolder: "空文件夹",
  emptyFolderAction: "新建试卷",
  moveModalTitle: "移动试卷到…",
  moveModalHint: "选择目标文件夹",
  folderCreateItemLabel: "＋试卷",
};

export default function ExamPaperAdminPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<0 | 1 | 2 | 3>(0);
  const [keyword, setKeyword] = useState("");

  const [currentId, setCurrentId] = useState<number | null>(null);
  const [currentCode, setCurrentCode] = useState("");
  const [title, setTitle] = useState("");
  const [qualifyScore, setQualifyScore] = useState<number>(80);
  const [totalTime, setTotalTime] = useState<number | null>(null);
  const [loadingPaper, setLoadingPaper] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const [seedOpen, setSeedOpen] = useState(false);
  const [seeds, setSeeds] = useState<ExamSeed[]>([]);
  const [seedsLoading, setSeedsLoading] = useState(false);
  const [seedSelected, setSeedSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const {
    sections,
    selectedFieldKey,
    selectedSectionCode,
    load,
    selectField,
    selectSection,
    addSection,
    removeSection,
    addField,
    updateField,
    removeField,
  } = useTemplateEditor();

  const { data: pd, isLoading: pl } = useQuery({
    queryKey: ["exam-papers", keyword],
    queryFn: () => fetchExamPapers({ page: 1, pageSize: 1000, keyword }),
    placeholderData: (prev) => prev,
  });

  const papers = pd?.list ?? [];

  const foldersQuery = useQuery({
    queryKey: ["exam-paper-folders"],
    queryFn: fetchExamFolders,
  });
  const folders = foldersQuery.data ?? [];

  const { data: submissions, isLoading: submissionsLoading } = useQuery({
    queryKey: ["exam-submissions"],
    queryFn: () => fetchExamSubmissions(),
  });
  const { data: allPapersData } = useQuery({
    queryKey: ["exam-papers", "all"],
    queryFn: () => fetchExamPapers({ page: 1, pageSize: 1000 }),
  });
  const allPapers = allPapersData?.list ?? [];

  const selectedField = useMemo(
    () => sections.flatMap((s) => s.fields ?? []).find((f) => f.fieldKey === selectedFieldKey) ?? null,
    [sections, selectedFieldKey],
  );
  const fieldCatalog = useMemo(() => buildFieldCatalog(sections), [sections]);

  const totalScore = useMemo(() => {
    let sum = 0;
    for (const s of sections) {
      for (const f of s.fields ?? []) {
        const sc = f.type === "choice" ? f.config?.score : undefined;
        if (sc != null) sum += sc;
      }
    }
    return sum;
  }, [sections]);

  const openPaper = async (p: ExamPaperSummary) => {
    try {
      setLoadingPaper(true);
      const d = await fetchExamPaper(p.id);
      load(d.sections);
      setCurrentId(p.id);
      setCurrentCode(p.code);
      setTitle(d.title);
      setQualifyScore(d.qualifyScore ?? 80);
      setTotalTime(d.totalTime ?? null);
    } catch (e: any) {
      toast.error(e?.message || "加载失败");
    } finally {
      setLoadingPaper(false);
    }
  };

  const handleNew = async () => {
    const code = await appPrompt("试卷编码（唯一）", "", { placeholder: "如 EXAM-001" });
    if (code == null || !code.trim()) return;
    const t = await appPrompt("试卷标题", "", { placeholder: "如 上岗考核试卷" });
    if (t == null || !t.trim()) return;
    try {
      const d = await createExamPaper({ code: code.trim(), title: t.trim() });
      toast.success("已创建");
      qc.invalidateQueries({ queryKey: ["exam-papers"] });
      load(d.sections);
      setCurrentId(d.id);
      setCurrentCode(d.code);
      setTitle(d.title);
      setQualifyScore(80);
      setTotalTime(null);
    } catch (e: any) {
      toast.error(e?.message || "创建失败");
    }
  };

  const handleCreateFolder = async () => {
    const name = (await appPrompt("新建文件夹", "", { placeholder: "如 上岗考核" }))?.trim();
    if (!name) return;
    try {
      await createExamFolder(name);
      toast.success("已创建文件夹");
      qc.invalidateQueries({ queryKey: ["exam-paper-folders"] });
    } catch (e: any) {
      toast.error(e?.message || "创建文件夹失败");
    }
  };

  const handleRenameFolder = async (folderKey: string) => {
    const folder = folders.find((f) => String(f.id) === folderKey);
    if (!folder) return;
    const name = (await appPrompt("重命名文件夹", folder.name))?.trim();
    if (!name || name === folder.name) return;
    try {
      await renameExamFolder(folder.id, name);
      toast.success("已重命名");
      qc.invalidateQueries({ queryKey: ["exam-paper-folders"] });
    } catch (e: any) {
      toast.error(e?.message || "重命名失败");
    }
  };

  const handleDeleteFolder = async (folderKey: string) => {
    const folder = folders.find((f) => String(f.id) === folderKey);
    if (!folder) return;
    const count = papers.filter((p) => p.folderId === folder.id).length;
    if (!(await appConfirm(`删除文件夹「${folder.name}」？其下 ${count} 份试卷将移入「未分类」。`, { danger: true }))) return;
    try {
      await deleteExamFolder(folder.id);
      toast.success("已删除文件夹");
      qc.invalidateQueries({ queryKey: ["exam-paper-folders"] });
      qc.invalidateQueries({ queryKey: ["exam-papers"] });
    } catch (e: any) {
      toast.error(e?.message || "删除失败");
    }
  };

  const handleMovePaper = async (itemId: string, toFolderKey: string) => {
    const folderId = toFolderKey === UNGROUPED_KEY ? null : Number(toFolderKey);
    try {
      await moveExamPaperToFolder(Number(itemId), folderId);
      toast.success("已移动");
      qc.invalidateQueries({ queryKey: ["exam-papers"] });
    } catch (e: any) {
      toast.error(e?.message || "移动失败");
    }
  };

  const handleCreateInFolder = async (folderKey: string) => {
    const code = (await appPrompt("试卷编码（唯一）", "", { placeholder: "如 EXAM-001" }))?.trim();
    if (!code) return;
    const title = (await appPrompt("试卷标题", "", { placeholder: "如 上岗考核试卷" }))?.trim();
    if (!title) return;
    try {
      const d = await createExamPaper({ code, title });
      if (folderKey !== UNGROUPED_KEY) {
        await moveExamPaperToFolder(d.id, Number(folderKey));
      }
      toast.success("已创建");
      qc.invalidateQueries({ queryKey: ["exam-papers"] });
      load(d.sections);
      setCurrentId(d.id);
      setCurrentCode(d.code);
      setTitle(d.title);
      setQualifyScore(80);
      setTotalTime(null);
    } catch (e: any) {
      toast.error(e?.message || "创建失败");
    }
  };

  const folderTreeGroups = useMemo((): FolderTreeGroup<{ id: string; paper: ExamPaperSummary }>[] => {
    const groups: FolderTreeGroup<{ id: string; paper: ExamPaperSummary }>[] = folders.map((f) => ({
      key: String(f.id),
      label: f.name,
      mutable: true,
      items: papers.filter((p) => p.folderId === f.id).map((p) => ({ id: String(p.id), paper: p })),
    }));
    groups.push({
      key: UNGROUPED_KEY,
      label: "未分类",
      mutable: false,
      items: papers.filter((p) => p.folderId == null).map((p) => ({ id: String(p.id), paper: p })),
    });
    return groups;
  }, [folders, papers]);

  const handleSelectItem = (id: string) => {
    const p = papers.find((x) => String(x.id) === id);
    if (p) void openPaper(p);
  };

  const handleSave = async () => {
    if (currentId == null) return;
    try {
      await saveExamPaper(currentId, { title, sections, qualifyScore, totalTime });
      toast.success("已保存");
      qc.invalidateQueries({ queryKey: ["exam-papers"] });
    } catch (e: any) {
      toast.error(e?.message || "保存失败");
    }
  };

  const handleAddSection = async () => {
    const label = await appPrompt("大题标题", "", { placeholder: "如 基本信息" });
    if (label == null || !label.trim()) return;
    const code = `S${sections.length + 1}`;
    addSection(code, label.trim());
    selectSection(code);
  };

  const handleRemoveSection = async (code: string) => {
    if (!(await appConfirm("删除该大题及其下所有题目？", { danger: true }))) return;
    removeSection(code);
  };

  const handleAddField = (type: FieldType) => {
    const code = selectedSectionCode ?? sections[0]?.code;
    if (!code) return;
    const sec = sections.find((s) => s.code === code);
    const existing = (sec?.fields ?? []).map((f) => f.fieldKey);
    const fieldKey = nextFieldKey(code, existing, typeLabelOf(type));
    const meta = typeMetaOf(type);
    const field: FormField = {
      fieldKey,
      label: typeLabelOf(type),
      type,
      config: meta?.defaultConfig ? { ...meta.defaultConfig } : undefined,
    };
    addField(code, field);
    setAddMenuOpen(false);
    selectField(fieldKey);
  };

  const handlePublish = async (id: number) => {
    try {
      await publishExamPaper(id);
      toast.success("已发布");
      qc.invalidateQueries({ queryKey: ["exam-papers"] });
    } catch (e: any) {
      toast.error(e?.message || "发布失败");
    }
  };

  const handleUnpublish = async (id: number) => {
    try {
      await unpublishExamPaper(id);
      toast.success("已取消发布");
      qc.invalidateQueries({ queryKey: ["exam-papers"] });
    } catch (e: any) {
      toast.error(e?.message || "取消发布失败");
    }
  };

  const handleDelete = async (p: ExamPaperSummary) => {
    if (!(await appConfirm(`删除试卷「${p.title}」？`, { danger: true }))) return;
    try {
      await deleteExamPaper(p.id);
      toast.success("已删除");
      if (currentId === p.id) {
        setCurrentId(null);
        load([]);
        setTitle("");
        setCurrentCode("");
      }
      qc.invalidateQueries({ queryKey: ["exam-papers"] });
    } catch (e: any) {
      toast.error(e?.message || "删除失败");
    }
  };

  const importableSeeds = seeds.filter((s) => !s.imported);
  const selectedImportable = importableSeeds.filter((s) => seedSelected.has(s.code));

  const openSeedDialog = async () => {
    setSeedOpen(true);
    setSeedsLoading(true);
    setSeedSelected(new Set());
    try {
      setSeeds(await fetchExamSeeds());
    } catch (e: any) {
      toast.error(e?.message || "加载种子试卷失败");
    } finally {
      setSeedsLoading(false);
    }
  };

  const toggleSeed = (code: string) => {
    setSeedSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleImportSeeds = async () => {
    const codes = selectedImportable.map((s) => s.code);
    if (codes.length === 0) return;
    setImporting(true);
    try {
      const d = await importExamSeeds(codes);
      toast.success(`已导入 ${d.imported} 份种子试卷`);
      qc.invalidateQueries({ queryKey: ["exam-papers"] });
      setSeedOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const tabBtn = (active: boolean, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-[var(--app-color-accent)] text-[var(--app-color-accent-foreground)] shadow-sm"
          : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]",
      )}
    >
      {label}
    </button>
  );

  // ── 配置题目 tab ──
  const editorPreview = () => {
    const sel = sections.find((s) => s.code === selectedSectionCode) ?? sections[0];
    if (!sel) return <div className="aup-empty">暂无大题，点左侧「＋ 新增大题」开始</div>;
    const fields = sel.fields ?? [];
    return (
      <div className="aup-app" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>
          <span className="aup-code-badge">{sel.code}</span> {sel.label || "未命名大题"}
        </div>
        {fields.length === 0 && <div className="aup-muted">暂无题目，点上方「＋ 添加题目」</div>}
        {fields.map((f) => (
          <div
            key={f.fieldKey}
            onClick={() => selectField(f.fieldKey)}
            style={{
              border: "1px solid var(--bd)",
              borderRadius: 8,
              padding: 12,
              marginBottom: 8,
              cursor: "pointer",
              background: selectedFieldKey === f.fieldKey ? "var(--pw)" : "var(--card)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{f.label || f.fieldKey}</span>
              <span style={{ fontSize: 11, color: "var(--mu)" }}>
                {typeLabelOf(f.type)}
                {f.required ? " · 必填" : ""}
              </span>
            </div>
            <ExamFormField field={f} readOnly />
          </div>
        ))}
      </div>
    );
  };

  const configTab = (
    <div className="flex h-full gap-3 min-h-0">
      {/* 左：试卷文件夹树 */}
      <div className="w-64 shrink-0 flex flex-col rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">
        <div className="shrink-0 p-2 border-b border-[var(--app-color-border-default)]">
          <div className="flex items-center gap-1.5 h-8 rounded border border-[var(--app-color-border-default)] px-2">
            <Search className="h-3.5 w-3.5 text-[var(--twin-mute)] shrink-0" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索编码/标题"
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="aup-app" style={{ minHeight: "auto", background: "transparent" }}>
            <FolderTreeManager
              folders={folderTreeGroups}
              selectedItemId={currentId == null ? null : String(currentId)}
              onSelectItem={handleSelectItem}
              loading={pl || foldersQuery.isLoading}
              canMaintain
              ungroupedKey={UNGROUPED_KEY}
              labels={FOLDER_LABELS}
              getItemLabel={(item) => item.paper.title}
              folderActions={(folderKey): FolderAction[] =>
                folderKey === UNGROUPED_KEY ? ["createItem"] : ["createItem", "rename", "delete"]
              }
              itemActions={() => ["moveItem"]}
              onCreateFolder={handleCreateFolder}
              onCreateItem={(fk) => void handleCreateInFolder(fk)}
              onRenameFolder={(fk) => void handleRenameFolder(fk)}
              onDeleteFolder={(fk) => void handleDeleteFolder(fk)}
              onMoveItem={(itemId, _from, to) => void handleMovePaper(itemId, to)}
              renderItem={(item) => {
                const p = item.paper;
                return (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
                      <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]" />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                    </div>
                    <div style={{ marginTop: 2, paddingLeft: 20, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--twin-mute)" }}>
                      <span style={{ fontFamily: "ui-monospace, monospace" }}>{p.code}</span>
                      {statusBadge(p.status)}
                    </div>
                  </div>
                );
              }}
            />
          </div>
        </div>
      </div>

      {/* 右：编辑器 */}
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">
        {currentId == null ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 text-sm text-[var(--app-color-text-tertiary)]">
            <FileText className="h-8 w-8" />
            <span>选择左侧试卷或点「新建试卷」开始配置</span>
          </div>
        ) : loadingPaper ? (
          <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-[var(--app-color-text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin mr-2" />加载中…</div>
        ) : (
          <div className="aup flex-1 min-h-0">
            <div className="aup-topbar">
              <span className="aup-code-badge">{currentCode}</span>
              <input
                className="aup-input"
                style={{ maxWidth: 320 }}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="试卷标题"
              />
              <label style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 12, fontSize: 12, color: "var(--mu)", whiteSpace: "nowrap" }}>
                及格分
                <input
                  className="aup-input"
                  type="number"
                  min={0}
                  style={{ width: 64 }}
                  value={qualifyScore ?? 80}
                  onChange={(e) => setQualifyScore(e.target.value ? Number(e.target.value) : 80)}
                />
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 8, fontSize: 12, color: "var(--mu)", whiteSpace: "nowrap" }}>
                时限(分)
                <input
                  className="aup-input"
                  type="number"
                  min={0}
                  style={{ width: 64 }}
                  value={totalTime ?? ""}
                  placeholder="不限"
                  onChange={(e) => setTotalTime(e.target.value ? Number(e.target.value) : null)}
                />
              </label>
              <span style={{ marginLeft: 12, fontSize: 12, color: "var(--mu)", whiteSpace: "nowrap" }}>总分 {totalScore}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="aup-btn primary"
                  disabled={sections.length === 0}
                  onClick={() => setAddMenuOpen(true)}
                >
                  ＋ 添加题目
                </button>
                <button type="button" className="aup-btn ghost" onClick={handleSave}><Save size={13} />保存</button>
              </div>
            </div>
            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
              <SectionTree
                sections={sections}
                selectedFieldKey={selectedFieldKey}
                onSelectField={selectField}
                onSelectSection={selectSection}
                onAddSection={handleAddSection}
                onRemoveSection={handleRemoveSection}
              />
              {editorPreview()}
            </div>
            {addMenuOpen && <TypeMenu onPick={handleAddField} onClose={() => setAddMenuOpen(false)} />}
            {selectedField && (
              <div className="aup-drawer-mask" onClick={() => selectField(null)}>
                <FieldEditorPanel
                  field={selectedField}
                  fieldCatalog={fieldCatalog}
                  onChange={(patch) => updateField(selectedField.fieldKey, patch)}
                  onRemove={() => { removeField(selectedField.fieldKey); selectField(null); }}
                  onClose={() => selectField(null)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ── 发布题目 tab ──
  const publishTab = (
    <div className="flex flex-col h-full rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">
      <div className="flex-1 min-h-0 overflow-auto">
        {pl ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin mr-2" />加载中…</div>
        ) : papers.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">暂无试卷</div>
        ) : (
          <table className="w-full min-w-max text-left text-sm border-collapse twin-table">
            <thead className="border-b-2 border-[var(--app-color-border-strong)]">
              <tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold shadow-[var(--app-elevation-card)]">
                <th className="px-3 py-2">编码</th><th className="px-3 py-2">标题</th><th className="px-3 py-2">状态</th><th className="px-3 py-2 w-40">操作</th>
              </tr>
            </thead>
            <tbody>
              {papers.map((p) => (
                <tr key={p.id} className="border-b hover:bg-[var(--twin-canvas-soft)] transition-colors">
                  <td className="px-3 py-2.5 text-[var(--twin-mute)] font-mono text-xs">{p.code}</td>
                  <td className="px-3 py-2.5 font-medium text-[var(--app-color-text-primary)]">{p.title}</td>
                  <td className="px-3 py-2.5">{statusBadge(p.status)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {p.status === "PUBLISHED" ? (
                        <AdminButton type="button" tone="secondary" size="sm" onClick={() => handleUnpublish(p.id)}><Undo2 className="h-3.5 w-3.5 mr-1" />取消发布</AdminButton>
                      ) : (
                        <>
                          <AdminButton type="button" tone="primary" size="sm" onClick={() => handlePublish(p.id)}><Upload className="h-3.5 w-3.5 mr-1" />发布</AdminButton>
                          <AdminButton type="button" tone="destructive" size="sm" onClick={() => handleDelete(p)}><Trash2 className="h-3.5 w-3.5 mr-1" />删除</AdminButton>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  // ── 成绩管理 tab（人 × 试卷透视）──
  const scoreRows = useMemo(() => {
    const people = new Map<string, { name: string; job: string }>();
    const byPerson = new Map<string, Map<number, { score: number | null; qualify: number }>>();
    (submissions ?? []).forEach((s) => {
      if (!people.has(s.personId)) people.set(s.personId, { name: s.personName || s.personId, job: s.jobNumber || "" });
      const m = byPerson.get(s.personId) ?? new Map<number, { score: number | null; qualify: number }>();
      m.set(s.paperId, { score: s.totalScore ?? null, qualify: s.qualifyYn ?? 0 });
      byPerson.set(s.personId, m);
    });
    const papers = allPapers ?? [];
    return [...people.entries()].map(([personId, info]) => {
      const scores = byPerson.get(personId) ?? new Map();
      const cells = papers.map((p) => scores.get(p.id) ?? { score: null, qualify: 0 });
      return { personId, name: info.name, job: info.job, cells };
    });
  }, [submissions, allPapers]);

  const scoresTab = (
    <div className="flex flex-col h-full rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">
      <div className="shrink-0 px-3 py-2 border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-tertiary)]">
        共 {scoreRows.length} 人 · {allPapers.length} 套试卷
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {submissionsLoading ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin mr-2" />加载中…</div>
        ) : scoreRows.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">暂无答题记录</div>
        ) : (
          <table className="w-full min-w-max text-left text-sm border-collapse twin-table">
            <thead className="border-b-2 border-[var(--app-color-border-strong)]">
              <tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold">
                <th className="px-3 py-2">姓名</th><th className="px-3 py-2">编号</th>
                {allPapers.map((p) => <th key={p.id} className="px-3 py-2 whitespace-nowrap">{p.title}</th>)}
              </tr>
            </thead>
            <tbody>
              {scoreRows.map((r) => (
                <tr key={r.personId} className="border-b hover:bg-[var(--twin-canvas-soft)] transition-colors">
                  <td className="px-3 py-2.5 font-medium text-[var(--app-color-text-primary)]">{r.name}</td>
                  <td className="px-3 py-2.5 text-[var(--twin-mute)] font-mono text-xs">{r.job || "—"}</td>
                  {r.cells.map((c, i) => (
                    <td key={i} className="px-3 py-2.5">
                      {c.score == null ? (
                        <span className="text-[var(--twin-mute)]">—</span>
                      ) : (
                        <span className={cn("font-medium", c.qualify === 1 ? "text-emerald-600" : "text-rose-600")}>{c.score}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  // ── 健康报告 tab ──
  const navigate = useNavigate();
  const [bindingFormId, setBindingFormId] = useState<number | null>(null);
  const [bindingWtId, setBindingWtId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: binding } = useQuery({
    queryKey: ["qualification-binding"],
    queryFn: fetchQualificationBinding,
  });
  const { data: forms = [] } = useQuery({
    queryKey: ["report-forms", "all"],
    queryFn: () => fetchFormPage(1, 100),
  });
  const effectiveFormId = bindingFormId ?? binding?.formId ?? null;
  const { data: wordTemplates = [] } = useQuery({
    queryKey: ["word-templates", effectiveFormId],
    queryFn: () => fetchWordTemplates(effectiveFormId!),
    enabled: effectiveFormId != null,
  });
  const effectiveWtId =
    bindingWtId ?? (effectiveFormId === binding?.formId ? binding?.wordTemplateId : null) ?? wordTemplates[0]?.id ?? null;

  const saveBinding = async () => {
    if (effectiveFormId == null) { toast.error("请先选择表单"); return; }
    try {
      await saveQualificationBinding({ formId: effectiveFormId, wordTemplateId: effectiveWtId });
      toast.success("已保存");
      qc.invalidateQueries({ queryKey: ["qualification-binding"] });
    } catch (e: any) { toast.error(e?.message || "保存失败"); }
  };

  const healthTab = (
    <AdminFormCard title="健康报告配置" fill>
      {forms.length === 0 ? (
        <div className="py-8 text-center text-sm text-neutral-400">
          还没有报表。先去「填报报表管理」用「Word 创建」上传健康报告模板，再回来这里选。
        </div>
      ) : (
        <div className="space-y-4 max-w-xl">
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--app-color-text-secondary)]">表单</label>
            <select
              className="w-full rounded border border-[var(--app-color-border-default)] px-2 py-1.5 text-sm"
              value={effectiveFormId ?? ""}
              onChange={(e) => { setBindingFormId(e.target.value ? Number(e.target.value) : null); setBindingWtId(null); }}
            >
              <option value="">选择表单…</option>
              {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--app-color-text-secondary)]">Word 模板（决定页眉页脚）</label>
            <select
              className="w-full rounded border border-[var(--app-color-border-default)] px-2 py-1.5 text-sm"
              value={effectiveWtId ?? ""}
              onChange={(e) => setBindingWtId(e.target.value || null)}
              disabled={effectiveFormId == null}
            >
              <option value="">第一份模板</option>
              {wordTemplates.map((t) => <option key={t.id} value={t.id}>{t.name || t.id}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <AdminButton type="button" tone="primary" size="sm" onClick={saveBinding}>保存绑定</AdminButton>
            {effectiveFormId != null && (
              <AdminButton type="button" tone="secondary" size="sm"
                onClick={() => navigate(`/console/admin/report-form/${effectiveFormId}/design`)}>
                去设计字段
              </AdminButton>
            )}
            {effectiveFormId != null && effectiveWtId != null && (
              <AdminButton type="button" tone="secondary" size="sm" onClick={() => setPreviewOpen(true)}>预览</AdminButton>
            )}
          </div>
          <p className="text-xs text-[var(--app-color-text-tertiary)]">
            预览渲染的是空白数据版式；真实数据版式在学生提交后生成。
          </p>
        </div>
      )}
      {previewOpen && effectiveFormId != null && (
        <PdfPreviewDialog
          title="健康报告预览"
          fetchPdf={() => fetchQualificationPreview({ formId: effectiveFormId, wordTemplateId: effectiveWtId })}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </AdminFormCard>
  );

  return (
    <AdminPageShell>
      <div className="flex flex-col h-[calc(100dvh-var(--admin-chrome-offset))]">
        <AdminFormCard className="shrink-0 mb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {tabBtn(tab === 0, "配置题目", () => setTab(0))}
              {tabBtn(tab === 1, "发布题目", () => setTab(1))}
              {tabBtn(tab === 2, "成绩管理", () => setTab(2))}
              {tabBtn(tab === 3, "健康报告", () => setTab(3))}
            </div>
            <div className="flex items-center gap-2">
              <AdminButton type="button" tone="secondary" size="sm" onClick={handleNew}><Plus className="h-4 w-4 mr-1" />新建试卷</AdminButton>
              <AdminButton type="button" tone="secondary" size="sm" onClick={openSeedDialog}><Download className="h-4 w-4 mr-1" />导入种子试卷</AdminButton>
              {currentId != null && <AdminButton type="button" tone="primary" size="sm" onClick={handleSave}><Save className="h-4 w-4 mr-1" />保存</AdminButton>}
            </div>
          </div>
        </AdminFormCard>
        <div className="flex-1 min-h-0">{tab === 0 ? configTab : tab === 1 ? publishTab : tab === 2 ? scoresTab : healthTab}</div>
      </div>

      <Dialog open={seedOpen} onOpenChange={(v) => { if (!v) setSeedOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>导入种子试卷</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {seedsLoading ? (
              <div className="flex min-h-[120px] items-center justify-center text-xs text-[var(--app-color-text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin mr-1" />加载中…</div>
            ) : seeds.length === 0 ? (
              <div className="flex min-h-[120px] items-center justify-center text-xs text-[var(--app-color-text-tertiary)]">暂无可用种子试卷</div>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs text-[var(--app-color-text-tertiary)]">{importableSeeds.length} 份可导入</span>
                  <div className="flex items-center gap-2">
                    <button type="button" className="text-xs text-[var(--app-color-accent)]" onClick={() => setSeedSelected(new Set(importableSeeds.map((s) => s.code)))}>全选</button>
                    <button type="button" className="text-xs text-[var(--app-color-text-secondary)]" onClick={() => setSeedSelected(new Set())}>清空</button>
                  </div>
                </div>
                {seeds.map((s) => {
                  const checked = s.imported || seedSelected.has(s.code);
                  return (
                    <label
                      key={s.code}
                      className={cn(
                        "flex items-center gap-2 rounded px-2 py-2 hover:bg-[var(--app-color-surface-hover)]",
                        s.imported ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                      )}
                    >
                      <input
                        type="checkbox"
                        disabled={s.imported}
                        checked={checked}
                        onChange={() => toggleSeed(s.code)}
                        className="h-4 w-4 accent-[var(--app-color-accent)]"
                      />
                      <span className="flex-1 truncate text-sm text-[var(--app-color-text-primary)]">{s.title}</span>
                      <span className="whitespace-nowrap text-xs text-[var(--twin-mute)]">{s.questionCount} 题</span>
                      {s.imported && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">已导入</span>}
                    </label>
                  );
                })}
              </>
            )}
          </div>
          <DialogFooter>
            <AdminButton type="button" tone="secondary" size="sm" onClick={() => setSeedOpen(false)}>取消</AdminButton>
            <AdminButton type="button" tone="primary" size="sm" onClick={handleImportSeeds} disabled={importing || selectedImportable.length === 0}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
              {importing ? "导入中…" : selectedImportable.length > 0 ? `导入 (${selectedImportable.length})` : "导入"}
            </AdminButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageShell>
  );
}
