import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUpdateContent } from "@/api/hooks/usePortalContent";
import { usePageVersions } from "./usePageVersions";
import type { PortalContentView } from "@/api/domains/portalContent.api";

interface StatItem { label: string; value: string; unit: string }
interface SectionItem { heading: string; body: string }

function parseExt(row: PortalContentView): Record<string, unknown> {
  try {
    return typeof row.extensionJson === "string"
      ? JSON.parse(row.extensionJson)
      : (row.extensionJson as Record<string, unknown>) || {};
  } catch { return {}; }
}

export default function AboutPageEditor() {
  const nav = useNavigate();
  const { versions, published, isFetching, createDraft, publishVersion, deleteVersion, createMut } = usePageVersions("about");
  const updateMut = useUpdateContent();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = versions.find((v) => v.id === selectedId) ?? published ?? null;

  // 编辑状态
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [stats, setStats] = useState<StatItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);

  // 当选中的版本变化时同步表单
  useEffect(() => {
    if (!selected) return;
    setTitle(selected.title);
    setSummary(selected.summary || "");
    const ext = parseExt(selected);
    setStats((ext.stats as StatItem[]) || [
      { label: "建筑面积", value: "17,602", unit: "m²" },
      { label: "设计笼位", value: "5.2", unit: "万笼" },
      { label: "基因编辑品系", value: "2,122", unit: "个" },
      { label: "服务课题组", value: "302", unit: "个" },
    ]);
    setSections((ext.sections as SectionItem[]) || [
      { heading: "依托平台", body: "依托胚胎生物技术平台，保有2,122个基因编辑动物品系。坚持临床科研一体化，服务302个课题组及13家附属医院。" },
      { heading: "国际认证", body: "全国高校唯一同时拥有CNAS和AAALAC国际认可的实验动物设施。建设有20多个实验动物研究平台。" },
      { heading: "服务范围", body: "普通动物饲养品种包括犬、猴、猪、兔、仓鼠、豚鼠、小鼠、大鼠。特殊实验动物品种包括裸鼹鼠、地松鼠等。" },
    ]);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自动选第一个版本
  useEffect(() => {
    if (selectedId == null && versions.length > 0) {
      setSelectedId(published?.id ?? versions[0].id);
    }
  }, [versions, published, selectedId]);

  const saveDraft = useCallback(() => {
    if (!selected) return;
    const ext = { page_key: "about", stats, sections };
    const bodyHtml = sections.map((s) => `<h2>${s.heading}</h2><p>${s.body}</p>`).join("");
    if (selected.status === "DRAFT") {
      updateMut.mutate({
        id: selected.id,
        body: { title, summary: summary || null, contentHtml: bodyHtml, extensionJson: ext },
      });
    } else {
      createDraft(selected, (newId) => setSelectedId(newId));
    }
  }, [selected, title, summary, stats, sections]); // eslint-disable-line react-hooks/exhaustive-deps

  const publish = useCallback(() => {
    if (!selected) return;
    // 先保存再发布
    const ext = { page_key: "about", stats, sections };
    const bodyHtml = sections.map((s) => `<h2>${s.heading}</h2><p>${s.body}</p>`).join("");
    updateMut.mutate({
      id: selected.id,
      body: { title, summary: summary || null, contentHtml: bodyHtml, extensionJson: ext, status: "PUBLISHED" },
    }, {
      onSuccess: () => { publishVersion(selected.id); },
    });
  }, [selected, title, summary, stats, sections]); // eslint-disable-line react-hooks/exhaustive-deps

  const card: React.CSSProperties = {
    background: "white", border: "1px solid #e8e4df", borderRadius: 14,
    padding: "22px 24px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "#8b7355",
    textTransform: "uppercase", letterSpacing: "0.04em",
  };
  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", border: "1px solid #d4c9b8", borderRadius: 8,
    fontSize: 13, color: "#333", background: "#fafaf9", outline: "none",
    fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };
  const pending = createMut.isPending || updateMut.isPending;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24, background: "#f5f3f0" }}>
      <div style={{ maxWidth: 1060, margin: "0 auto", display: "flex", gap: 20 }}>
        {/* 左侧：版本列表 */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <div style={{ ...card, position: "sticky", top: 24 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "#333" }}>📋 版本列表</h3>
            {isFetching && <p style={{ fontSize: 11, color: "#b0a89a" }}>加载中…</p>}
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedId(v.id)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "8px 10px", marginBottom: 4,
                  borderRadius: 8, border: selectedId === v.id ? "2px solid #d97706" : "1px solid transparent",
                  background: selectedId === v.id ? "#fef3c7" : "transparent",
                  cursor: "pointer", fontSize: 11, color: "#333",
                }}
              >
                <span style={{ fontWeight: 600 }}>{v.status === "PUBLISHED" ? "✅ 已发布" : "📝 草稿"}</span>
                <br />
                <span style={{ fontSize: 10, color: "#b0a89a" }}>#{v.id} · {v.updatedAt?.substring(0, 10) || ""}</span>
              </button>
            ))}
            {selected && (
              <button
                onClick={() => { createDraft(selected, (newId) => setSelectedId(newId)); }}
                disabled={pending}
                style={{ marginTop: 10, width: "100%", padding: "7px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px dashed #d97706", background: "white", color: "#d97706", opacity: pending ? 0.5 : 1 }}
              >
                + 新建版本
              </button>
            )}
            <Link to="/content-manager/pages" style={{ display: "block", marginTop: 8, fontSize: 10, color: "#b0a89a", textDecoration: "none" }}>← 返回列表</Link>
          </div>
        </div>

        {/* 右侧：编辑区 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "#b0a89a", marginBottom: 16 }}>
            <Link to="/content-manager/pages" style={{ color: "#8b7355", textDecoration: "none" }}>页面管理</Link>
            <span> › 编辑关于我们</span>
            {selected && <span style={{ marginLeft: 8, fontSize: 10, color: selected.status === "PUBLISHED" ? "#22c55e" : "#f59e0b" }}>#{selected.id} · {selected.status === "PUBLISHED" ? "已发布" : "草稿"}</span>}
          </div>

          {!selected ? (
            <div style={card}><p style={{ color: "#b0a89a", textAlign: "center", padding: 40 }}>暂无版本，请先创建一个</p></div>
          ) : (
            <>
              {/* 基础信息 */}
              <div style={card}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>📄 关于我们 — 基础信息</h3>
                <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={labelStyle}>标题</span>
                    <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={labelStyle}>摘要 / Hero 副标题</span>
                    <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 50 }} value={summary} onChange={(e) => setSummary(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* 统计数字 */}
              <div style={card}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>📊 统计数字</h3>
                {stats.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <input style={{ ...inputStyle, flex: 2 }} placeholder="标签" value={s.label} onChange={(e) => { const n = [...stats]; n[i] = { ...n[i], label: e.target.value }; setStats(n); }} />
                    <input style={{ ...inputStyle, flex: 1 }} placeholder="数值" value={s.value} onChange={(e) => { const n = [...stats]; n[i] = { ...n[i], value: e.target.value }; setStats(n); }} />
                    <input style={{ ...inputStyle, flex: 1, maxWidth: 80 }} placeholder="单位" value={s.unit} onChange={(e) => { const n = [...stats]; n[i] = { ...n[i], unit: e.target.value }; setStats(n); }} />
                    <button style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #d4c9b8", background: "white", fontSize: 11, cursor: "pointer", color: "#999" }} onClick={() => setStats(stats.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
                <button style={{ fontSize: 11, color: "#d97706", fontWeight: 600, cursor: "pointer", background: "none", border: "none", marginTop: 4 }} onClick={() => setStats([...stats, { label: "", value: "", unit: "" }])}>+ 添加统计项</button>
              </div>

              {/* 内容分段 */}
              <div style={card}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>📝 内容分段</h3>
                {sections.map((sec, i) => (
                  <div key={i} style={{ marginBottom: 12, padding: "12px 16px", background: "#fafaf9", borderRadius: 10, border: "1px solid #e8e4df" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#8b7355", flex: 1 }}>分段 {i + 1}</span>
                      <button style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #d4c9b8", background: "white", fontSize: 11, cursor: "pointer", color: "#999" }} onClick={() => setSections(sections.filter((_, j) => j !== i))}>删除</button>
                    </div>
                    <input style={{ ...inputStyle, marginBottom: 6 }} placeholder="分段标题" value={sec.heading} onChange={(e) => { const n = [...sections]; n[i] = { ...n[i], heading: e.target.value }; setSections(n); }} />
                    <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} placeholder="分段正文" value={sec.body} onChange={(e) => { const n = [...sections]; n[i] = { ...n[i], body: e.target.value }; setSections(n); }} />
                  </div>
                ))}
                <button style={{ fontSize: 11, color: "#d97706", fontWeight: 600, cursor: "pointer", background: "none", border: "none", marginTop: 4 }} onClick={() => setSections([...sections, { heading: "", body: "" }])}>+ 添加分段</button>
              </div>

              {/* 操作栏 */}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
                {selected.status === "DRAFT" && (
                  <button onClick={() => deleteVersion(selected.id)}
                    style={{ padding: "9px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "white", color: "#dc2626", border: "1px solid #dc2626" }}>
                    删除版本
                  </button>
                )}
                <button onClick={saveDraft} disabled={pending}
                  style={{ padding: "9px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "white", color: "#d97706", border: "1px solid #d97706", opacity: pending ? 0.5 : 1 }}>
                  {pending ? "保存中…" : "保存草稿"}
                </button>
                <button onClick={publish} disabled={pending}
                  style={{ padding: "9px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: "#22c55e", color: "white", opacity: pending ? 0.5 : 1 }}>
                  {pending ? "发布中…" : "✅ 发布此版本"}
                </button>
              </div>
              <div style={{ height: 40 }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
