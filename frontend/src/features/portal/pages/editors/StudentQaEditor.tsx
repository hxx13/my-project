import { useState, useEffect, useCallback, useMemo } from "react";
import { useAdminContents, useCreateContent, useUpdateContent } from "@/api/hooks/usePortalContent";
import type { PortalContentView } from "@/api/domains/portalContent.api";

interface QaItem { question: string; answer: string }
interface QaGroup { category: string; items: QaItem[] }

function parseExt(row: PortalContentView): Record<string, unknown> {
  try {
    return typeof row.extensionJson === "string"
      ? JSON.parse(row.extensionJson)
      : (row.extensionJson as Record<string, unknown>) || {};
  } catch { return {}; }
}

function toGroups(ext: Record<string, unknown>): QaGroup[] {
  if (Array.isArray(ext.groups)) {
    return (ext.groups as unknown[]).map((g) => {
      const gg = g as Record<string, unknown>;
      const items = Array.isArray(gg.items)
        ? (gg.items as unknown[]).map((it) => {
            const ii = it as Record<string, unknown>;
            return { question: String(ii.question ?? ""), answer: String(ii.answer ?? "") };
          })
        : [];
      return { category: String(gg.category ?? ""), items };
    });
  }
  return [];
}

function cloneGroup(g: QaGroup): QaGroup {
  return { category: g.category, items: g.items.map((it) => ({ ...it })) };
}

export default function StudentQaEditor() {
  const { data, isFetching } = useAdminContents({ type: "PAGE", size: 100 });
  const createMut = useCreateContent();
  const updateMut = useUpdateContent();

  const row = useMemo(() => {
    const list = (data?.data ?? []).filter((r) => {
      try {
        const ext = typeof r.extensionJson === "string" ? JSON.parse(r.extensionJson) : (r.extensionJson as Record<string, unknown> ?? {});
        return (ext as Record<string, unknown>)?.page_key === "student_faq";
      } catch { return false; }
    });
    list.sort((a, b) => {
      if (a.status === "PUBLISHED" && b.status !== "PUBLISHED") return -1;
      if (b.status === "PUBLISHED" && a.status !== "PUBLISHED") return 1;
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
    return list[0] ?? null;
  }, [data]);

  const [groups, setGroups] = useState<QaGroup[]>([]);

  /* 编辑弹窗状态 */
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftGroup, setDraftGroup] = useState<QaGroup>({ category: "", items: [] });

  useEffect(() => {
    if (row) {
      const g = toGroups(parseExt(row));
      setGroups(g);
    } else if (!isFetching) {
      setGroups([]);
    }
  }, [row?.id, isFetching]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => {
    setEditingIndex(null);
    setDraftGroup({ category: "", items: [{ question: "", answer: "" }] });
    setModalOpen(true);
  };

  const openEdit = (i: number) => {
    setEditingIndex(i);
    setDraftGroup(cloneGroup(groups[i]));
    setModalOpen(true);
  };

  const confirmModal = () => {
    if (editingIndex === null) {
      setGroups([...groups, draftGroup]);
    } else {
      const n = [...groups];
      n[editingIndex] = draftGroup;
      setGroups(n);
    }
    setModalOpen(false);
  };

  const removeGroup = (i: number) => setGroups(groups.filter((_, j) => j !== i));

  /* 弹窗内 draftGroup 编辑辅助 */
  const setDraftCategory = (v: string) => setDraftGroup({ ...draftGroup, category: v });
  const setDraftItem = (ii: number, patch: Partial<QaItem>) => {
    const items = draftGroup.items.map((it, j) => (j === ii ? { ...it, ...patch } : it));
    setDraftGroup({ ...draftGroup, items });
  };
  const addDraftItem = () => setDraftGroup({ ...draftGroup, items: [...draftGroup.items, { question: "", answer: "" }] });
  const removeDraftItem = (ii: number) => setDraftGroup({ ...draftGroup, items: draftGroup.items.filter((_, j) => j !== ii) });

  const save = useCallback(() => {
    const ext = { page_key: "student_faq", groups };
    if (row) {
      updateMut.mutate({
        id: row.id,
        body: { title: row.title || "学生Q&A", summary: "学生常见问题", extensionJson: ext, status: "PUBLISHED" },
      });
    } else {
      createMut.mutate({
        contentType: "PAGE",
        title: "学生Q&A",
        summary: "学生常见问题",
        extensionJson: ext,
        status: "PUBLISHED",
      });
    }
  }, [row, groups, createMut, updateMut]);

  const pending = createMut.isPending || updateMut.isPending;

  const th: React.CSSProperties = {
    padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8b7355",
    textTransform: "uppercase", letterSpacing: "0.05em",
  };
  const td: React.CSSProperties = {
    padding: "12px 14px", borderBottom: "1px solid #f0ece6", fontSize: 13, verticalAlign: "middle",
  };
  const actionBtn: React.CSSProperties = {
    fontSize: 11, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
    border: "1px solid #d4c9b8", background: "white", color: "#666", whiteSpace: "nowrap",
  };
  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", border: "1px solid #d4c9b8", borderRadius: 8,
    fontSize: 13, color: "#333", background: "#fafaf9", outline: "none",
    fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };

  if (isFetching && groups.length === 0) {
    return <div style={{ padding: 32, color: "#b0a89a", fontSize: 13 }}>加载中…</div>;
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24, background: "#f5f3f0" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1a1a1a", marginBottom: 4 }}>❓ 学生Q&A</h1>
            <p style={{ fontSize: 13, color: "#8b7355", margin: 0 }}>管理学生端「常见问题」内容，保存后学生端即可看到最新内容。</p>
          </div>
          <button onClick={openNew}
            style={{ padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", background: "#d97706", color: "white" }}>
            + 新建分组
          </button>
        </div>

        <div style={{ background: "white", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: "1px solid #e8e4df" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#fafaf9" }}>
              <tr style={{ borderBottom: "2px solid #e8e4df" }}>
                <th style={{ ...th, width: 200 }}>分组</th>
                <th style={{ ...th, width: 90 }}>问答数</th>
                <th style={{ ...th, width: 180 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontWeight: 600, color: "#1a1a1a" }}>{g.category || <span style={{ color: "#b0a89a" }}>未命名分组</span>}</td>
                  <td style={td}>{g.items.length} 条</td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={actionBtn} onClick={() => openEdit(i)}>编辑</button>
                      <button style={{ ...actionBtn, color: "#dc2626" }} onClick={() => removeGroup(i)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr><td colSpan={3} style={{ padding: 40, textAlign: "center", color: "#b0a89a", fontSize: 13 }}>暂无分组，点击右上角「+ 新建分组」开始</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 16 }}>
          <button onClick={save} disabled={pending}
            style={{ padding: "9px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: "#22c55e", color: "white", opacity: pending ? 0.5 : 1 }}>
            {pending ? "保存中…" : "✅ 保存并发布"}
          </button>
        </div>
      </div>

      {/* 编辑弹窗 */}
      {modalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
          <div style={{ background: "white", borderRadius: 14, width: "100%", maxWidth: 640, maxHeight: "85vh", overflowY: "auto", padding: "24px 26px", boxShadow: "0 20px 50px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 16 }}>{editingIndex === null ? "新建分组" : "编辑分组"}</h3>

            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#8b7355", display: "block", marginBottom: 4 }}>分组名称</span>
              <input style={inputStyle} placeholder="如：门禁与进出" value={draftGroup.category} onChange={(e) => setDraftCategory(e.target.value)} />
            </div>

            <div style={{ fontSize: 11, fontWeight: 600, color: "#8b7355", marginBottom: 8 }}>问答条目（{draftGroup.items.length} 条）</div>
            {draftGroup.items.map((item, ii) => (
              <div key={ii} style={{ marginBottom: 8, padding: "10px 12px", background: "#fafaf9", borderRadius: 8, border: "1px solid #e8e4df" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#b0a89a", flex: 1 }}>问答 {ii + 1}</span>
                  {draftGroup.items.length > 1 && (
                    <button style={{ ...actionBtn, color: "#dc2626" }} onClick={() => removeDraftItem(ii)}>删除</button>
                  )}
                </div>
                <input style={{ ...inputStyle, marginBottom: 6 }} placeholder="问题" value={item.question} onChange={(e) => setDraftItem(ii, { question: e.target.value })} />
                <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 56 }} placeholder="答案" value={item.answer} onChange={(e) => setDraftItem(ii, { answer: e.target.value })} />
              </div>
            ))}
            <button style={{ fontSize: 11, color: "#d97706", fontWeight: 600, cursor: "pointer", background: "none", border: "none", marginTop: 2 }} onClick={addDraftItem}>+ 添加问答</button>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setModalOpen(false)}
                style={{ padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "white", color: "#666", border: "1px solid #d4c9b8" }}>
                取消
              </button>
              <button onClick={confirmModal}
                style={{ padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", background: "#d97706", color: "white" }}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
