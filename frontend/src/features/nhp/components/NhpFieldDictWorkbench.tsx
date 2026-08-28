/**
 * NHP 字段字典套（数据域套）列表工作台：猪 / 猴 / 自定义互不覆盖；点进某套再管理字段。
 *
 * 自包含工作台：自带工作区外壳（返回/搜索/工具栏 + 卡片列表 + 弹窗），
 * 可嵌入 ContentManagerWorkbenchLayout 风格的内容管理壳，也可嵌入后台控制台页壳。
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  copyNhpFieldDictionary,
  createNhpFieldDictionary,
  deleteNhpFieldDictionary,
  fetchNhpFieldDictionaries,
  formatPigReimportToast,
  reimportPigDictionary,
  updateNhpFieldDictionary,
  type NhpFieldDictionary,
} from "../api/nhpFieldDictionary.api";
import { nhpNavState, nhpPathOf, sanitizeNhpReturnTo } from "../utils/nhpAdminNav";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import "@/features/aup/aup.css";
import "../nhp.css";

export interface NhpFieldDictWorkbenchProps {
  /** 工作台返回按钮回调；缺省时回退到内容管理默认返回逻辑（returnTo → nhp-template） */
  onBack?: () => void;
}

export default function NhpFieldDictWorkbench({ onBack }: NhpFieldDictWorkbenchProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [dictKey, setDictKey] = useState("");
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("猴");
  const [description, setDescription] = useState("");
  const [editTarget, setEditTarget] = useState<NhpFieldDictionary | null>(null);
  const [editName, setEditName] = useState("");
  const [editSpecies, setEditSpecies] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const listQuery = useQuery({
    queryKey: ["nhp", "field-dictionaries"],
    queryFn: fetchNhpFieldDictionaries,
  });

  const invalidateList = () => {
    void qc.invalidateQueries({ queryKey: ["nhp", "field-dictionaries"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createNhpFieldDictionary({
        dictKey: dictKey.trim(),
        name: name.trim() || dictKey.trim(),
        species: species.trim() || undefined,
        description: description.trim() || undefined,
      }),
    onSuccess: (d) => {
      toast.success(`已创建数据域套 ${d.dictKey}`);
      invalidateList();
      setCreateOpen(false);
      setDictKey("");
      setName("");
      navigate(`/content-manager/nhp-field/${d.dictKey}`, { state: nhpNavState(location) });
    },
    onError: (e: Error) => toast.error(e.message || "创建失败"),
  });

  const editMutation = useMutation({
    mutationFn: () => {
      if (!editTarget) throw new Error("未选择数据域套");
      const n = editName.trim();
      if (!n) throw new Error("显示名不能为空");
      // 始终带上 species / description（可空串），以便清空说明或种属
      return updateNhpFieldDictionary(editTarget.dictKey, {
        name: n,
        species: editSpecies.trim(),
        description: editDescription.trim(),
      });
    },
    onSuccess: (d) => {
      toast.success(`已更新「${d.name}」`);
      setEditTarget(null);
      invalidateList();
      void qc.invalidateQueries({ queryKey: ["nhp", "field-dictionaries", d.dictKey] });
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ key, cascade }: { key: string; cascade: boolean }) =>
      deleteNhpFieldDictionary(key, cascade),
    onSuccess: (r) => {
      const parts = [
        `已软删数据域套 ${r.dictKey || ""}`.trim(),
        (r.softDeletedFields ?? 0) > 0 ? `字段 ${r.softDeletedFields}` : null,
        (r.softDeletedAtoms ?? 0) > 0 ? `原子 ${r.softDeletedAtoms}` : null,
      ].filter(Boolean);
      toast.success(parts.join(" · "));
      if (r.seedHint) toast(r.seedHint, { duration: 7000 });
      invalidateList();
      void qc.invalidateQueries({ queryKey: ["nhp", "fields"] });
      void qc.invalidateQueries({ queryKey: ["nhp", "templates"] });
      void qc.invalidateQueries({ queryKey: ["nhp", "field-structure"] });
    },
  });

  const reimportPigMutation = useMutation({
    mutationFn: () => reimportPigDictionary(),
    onSuccess: (d) => {
      toast.success(formatPigReimportToast(d));
      invalidateList();
      void qc.invalidateQueries({ queryKey: ["nhp", "field-structure"] });
      void qc.invalidateQueries({ queryKey: ["nhp", "fields"] });
      void qc.invalidateQueries({ queryKey: ["nhp", "templates"] });
    },
    onError: (e: Error) => toast.error(e.message || "重导入失败"),
  });

  const copyMutation = useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) =>
      copyNhpFieldDictionary({ sourceDictKey: source, targetDictKey: target }),
    onSuccess: (d) => {
      toast.success(`已复制数据域套 ${d.dictKey}（含大纲与字段）`);
      invalidateList();
      void qc.invalidateQueries({ queryKey: ["nhp", "fields"] });
    },
    onError: (e: Error) => toast.error(e.message || "复制失败", { duration: 6000 }),
  });

  const handleCopy = async (d: NhpFieldDictionary) => {
    const target = (await appPrompt("复制到（目标 dictKey，如 pig-v2）", ""))?.trim();
    if (!target) return;
    if (target === d.dictKey) {
      toast.error("目标键不能与源相同");
      return;
    }
    copyMutation.mutate({ source: d.dictKey, target });
  };

  const openEdit = (d: NhpFieldDictionary) => {
    setCreateOpen(false);
    setEditTarget(d);
    setEditName(d.name || "");
    setEditSpecies(d.species || "");
    setEditDescription(d.description || "");
  };

  const closeEdit = () => {
    if (editMutation.isPending) return;
    setEditTarget(null);
  };

  const editRow = (label: string, input: ReactNode, hint?: string) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <label style={{ fontSize: 13, color: "var(--muted)", width: 88, flexShrink: 0, paddingTop: 8 }}>{label}</label>
      <div style={{ flex: 1 }}>
        {input}
        {hint ? (
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>{hint}</div>
        ) : null}
      </div>
    </div>
  );

  const confirmDelete = async (d: NhpFieldDictionary) => {
    const isPig = d.dictKey === "pig";
    const seedTip = isPig
      ? "\n\n【猪套种子】仅软删，不硬删行；之后可用「重导入内置猪字典」或新建同键复活。"
      : d.dictKey === "monkey"
        ? "\n\n【默认猴套壳】仅软删；重启灌种或新建同键可复活空壳。"
        : "";
    if (
      !(await appConfirm(
        `确定软删数据域套「${d.name || d.dictKey}」（${d.dictKey}）？\n` +
          `字段约 ${d.fieldCount ?? 0} 个。有字段/原子时会再确认级联。` +
          seedTip,
      ))
    ) {
      return;
    }
    try {
      await deleteMutation.mutateAsync({ key: d.dictKey, cascade: false });
    } catch (e) {
      const msg = (e as Error).message || "删除失败";
      if (msg.includes("FROZEN") || msg.includes("冻结")) {
        toast.error(msg, { duration: 7000 });
        return;
      }
      if (msg.includes("cascade") || msg.includes("字段") || msg.includes("原子")) {
        if (
          !(await appConfirm(
            `${msg}\n\n是否级联软删该套下字段与原子模板？组合模板请自行清理。此操作可经同键新建/重导入部分恢复。`,
          ))
        ) {
          return;
        }
        try {
          await deleteMutation.mutateAsync({ key: d.dictKey, cascade: true });
        } catch (e2) {
          toast.error((e2 as Error).message || "级联删除失败", { duration: 7000 });
        }
      } else {
        toast.error(msg, { duration: 7000 });
      }
    }
  };

  const rows = listQuery.data ?? [];
  const q = keyword.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return rows;
    return rows.filter(
      (d) =>
        d.dictKey.toLowerCase().includes(q) ||
        (d.name ?? "").toLowerCase().includes(q) ||
        (d.species ?? "").toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q),
    );
  }, [rows, q]);

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    const rt = sanitizeNhpReturnTo(
      (location.state as { returnTo?: unknown } | null)?.returnTo,
      nhpPathOf(location),
    );
    if (rt) {
      navigate(rt, { replace: true });
      return;
    }
    navigate("/content-manager/nhp-template", { replace: true });
  };

  const toolbarExtra = (
    <>
      <button
        type="button"
        className="btn ghost small"
        disabled={reimportPigMutation.isPending}
        onClick={async () => {
          if (
            await appConfirm(
              "【恢复默认 · 第 1–2 层】将内置种子字段同步进猪字典套：重建域/子模块大纲、冻结字段，并检测补生成缺失域原子。\n\n" +
                "不含 45 个细粒度原子草稿与题目模板（第 3–4 层）——请到「表单发布」页导入。\n\n" +
                "已有字段会计入更新/冻结（不是失败）；不改猴套与码表基线。继续？",
            )
          ) {
            reimportPigMutation.mutate();
          }
        }}
      >
        {reimportPigMutation.isPending ? "导入中…" : "恢复默认字段"}
      </button>
      <button
        type="button"
        className="btn ghost small"
        onClick={() => {
          setEditTarget(null);
          setCreateOpen((v) => !v);
        }}
      >
        ＋ 新建数据域套
      </button>
      <Link
        to="/content-manager/nhp-codelist"
        state={nhpNavState(location)}
        className="btn ghost small"
        style={{ textDecoration: "none" }}
      >
        码表
      </Link>
    </>
  );

  const main = (
    <>
      {createOpen && (
        <div className="nhp-toolbar-panel">
          <div className="nhp-toolbar-panel-title">新建数据域套</div>
          <p className="nhp-toolbar-panel-desc">
            创建空壳（如猴套）：结构为空，请进入后自建「套内数据域」/子模块/字段。不会自动带入猪套 D1–D10。
          </p>
          <div className="nhp-toolbar-panel-row">
            <label>
              稳定键 dictKey
              <input
                className="input"
                style={{ width: 140 }}
                value={dictKey}
                onChange={(e) => setDictKey(e.target.value)}
                placeholder="monkey / pig-v2"
              />
            </label>
            <label>
              显示名称
              <input
                className="input"
                style={{ width: 200 }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="猴字段字典"
              />
            </label>
            <label>
              种属
              <input
                className="input"
                style={{ width: 100 }}
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                placeholder="猪 / 猴"
              />
            </label>
            <label>
              说明
              <input
                className="input"
                style={{ width: 240 }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="可选"
              />
            </label>
            <button
              type="button"
              className="btn primary"
              disabled={createMutation.isPending || !dictKey.trim()}
              onClick={() => createMutation.mutate()}
            >
              创建并打开
            </button>
            <button type="button" className="btn ghost" onClick={() => setCreateOpen(false)}>
              取消
            </button>
          </div>
        </div>
      )}

      {listQuery.isLoading ? (
        <div className="aup-empty">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="aup-empty">
          {q ? "无匹配数据域套" : "暂无数据域套。请新建，或重启后端以灌入默认猪/猴壳。"}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
          {filtered.map((d: NhpFieldDictionary) => (
            <div className="aup-doc-stack" key={d.dictKey}>
              <div className="aup-doc">
                <div className="aup-doc-hd">
                  <span className="aup-doc-title">{d.species || "数据域套"}</span>
                  <span className="aup-doc-no">v{d.version ?? 1}</span>
                </div>
                <div className="aup-doc-body">
                  <div className="aup-f">
                    <div className="aup-f-k">名称</div>
                    <div className="aup-f-v">{d.name}</div>
                  </div>
                  <div className="aup-f">
                    <div className="aup-f-k">dictKey</div>
                    <div className="aup-f-v" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                      {d.dictKey}
                    </div>
                  </div>
                  <div className="aup-f">
                    <div className="aup-f-k">字段数</div>
                    <div className="aup-f-v">{d.fieldCount ?? 0}</div>
                  </div>
                  <div className="aup-f">
                    <div className="aup-f-k">说明</div>
                    <div className="aup-f-v" style={{ fontSize: 12, lineHeight: 1.5 }}>
                      {d.description?.trim() ? d.description : "—"}
                    </div>
                  </div>
                  <div className="aup-f">
                    <div className="aup-f-k">更新</div>
                    <div className="aup-f-v">
                      {d.updatedAt ? formatDateTimeAsiaShanghaiShort(d.updatedAt) : "—"}
                    </div>
                  </div>
                </div>
                <div className="aup-doc-foot">
                  <div className="aup-doc-acts" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button
                      type="button"
                      className="btn primary small"
                      onClick={() =>
                        navigate(`/content-manager/nhp-field/${d.dictKey}`, { state: nhpNavState(location) })
                      }
                    >
                      管理结构与字段 ▸
                    </button>
                    <button type="button" className="btn ghost small" onClick={() => openEdit(d)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      disabled={copyMutation.isPending}
                      onClick={() => void handleCopy(d)}
                      title="复制该数据域套（含大纲与字段）到新 dictKey"
                    >
                      复制
                    </button>
                    <button
                      type="button"
                      className="btn small danger"
                      disabled={deleteMutation.isPending}
                      onClick={() => void confirmDelete(d)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-toolbar">
          <button type="button" className="btn ghost small" onClick={handleBack} style={{ flexShrink: 0 }}>
            ← 返回
          </button>
          <input
            className="input"
            placeholder="搜索 dictKey / 名称 / 种属…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {keyword.trim() && (
            <button type="button" className="btn ghost small" onClick={() => setKeyword("")}>
              清除
            </button>
          )}
          {toolbarExtra}
          <span className="aup-wb-count">共 {filtered.length} 套数据域</span>
        </div>
        <div className="aup-wb-main aup-wb-main--full">{main}</div>
      </div>

      {editTarget && (
        <div className="aup-modal-mask" onClick={closeEdit}>
          <div className="aup-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h3>编辑数据域套</h3>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              可改名称、种属标签与说明。字段数、更新时间只读；dictKey 为稳定身份键，本页不可改。
            </p>
            {editRow(
              "dictKey",
              <div
                className="input"
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 12,
                  background: "var(--bg, #f8fafc)",
                  color: "var(--muted)",
                  cursor: "default",
                }}
              >
                {editTarget.dictKey}
              </div>,
              "身份键只读；改键需另行迁移。",
            )}
            {editRow(
              "名称",
              <input
                className="input"
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="如 猪异种移植字段字典"
              />,
            )}
            {editRow(
              "种属",
              <input
                className="input"
                value={editSpecies}
                onChange={(e) => setEditSpecies(e.target.value)}
                placeholder="猪 / 猴 / 其它"
              />,
              "卡片标题栏标签，可留空。",
            )}
            {editRow(
              "说明",
              <textarea
                className="input"
                rows={4}
                style={{ width: "100%", resize: "vertical", fontSize: 13, lineHeight: 1.5 }}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="可选：用途、默认字典说明等"
              />,
            )}
            {editRow(
              "字段数",
              <div style={{ paddingTop: 8, fontSize: 13, color: "var(--muted)" }}>
                {editTarget.fieldCount ?? 0}（只读）
              </div>,
            )}
            {editRow(
              "更新",
              <div style={{ paddingTop: 8, fontSize: 13, color: "var(--muted)" }}>
                {editTarget.updatedAt ? formatDateTimeAsiaShanghaiShort(editTarget.updatedAt) : "—"}
                （只读）
              </div>,
            )}
            <div className="aup-modal-actions">
              <button type="button" className="btn ghost" disabled={editMutation.isPending} onClick={closeEdit}>
                取消
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={editMutation.isPending || !editName.trim()}
                onClick={() => editMutation.mutate()}
              >
                {editMutation.isPending ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
