import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useUpdateContent } from "@/api/hooks/usePortalContent";
import { usePageVersions } from "./usePageVersions";
import type { PortalContentView } from "@/api/domains/portalContent.api";

interface FaqItem { question: string; answer: string }

function parseExt(row: PortalContentView): Record<string, unknown> {
  try {
    return typeof row.extensionJson === "string"
      ? JSON.parse(row.extensionJson)
      : (row.extensionJson as Record<string, unknown>) || {};
  } catch { return {}; }
}

export default function FAQPageEditor() {
  const { versions, published, isFetching, createDraft, publishVersion, deleteVersion, createMut } = usePageVersions("faq");
  const updateMut = useUpdateContent();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = versions.find((v) => v.id === selectedId) ?? published ?? null;

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [faqs, setFaqs] = useState<FaqItem[]>([]);

  useEffect(() => {
    if (!selected) return;
    setTitle(selected.title);
    setSummary(selected.summary || "");
    const ext = parseExt(selected);
    if (Array.isArray(ext.faqs) && ext.faqs.length > 0) {
      setFaqs(ext.faqs as FaqItem[]);
    } else {
      // fallback: 从 contentHtml 解析
      const re = /<h3>(.*?)<\/h3>\s*<p>(.*?)<\/p>/gi;
      const parsed: FaqItem[] = [];
      let m;
      while ((m = re.exec(selected.contentHtml || "")) !== null) {
        parsed.push({ question: m[1], answer: m[2] });
      }
      setFaqs(parsed);
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedId == null && versions.length > 0) {
      setSelectedId(published?.id ?? versions[0].id);
    }
  }, [versions, published, selectedId]);

  const saveDraft = useCallback(() => {
    if (!selected) return;
    const ext = { page_key: "faq", faqs };
    const bodyHtml = faqs.map((f) => `<h3>${f.question}</h3><p>${f.answer}</p>`).join("");
    if (selected.status === "DRAFT") {
      updateMut.mutate({
        id: selected.id,
        body: { title, summary: summary || null, contentHtml: bodyHtml, extensionJson: ext },
      });
    } else {
      createDraft(selected, (newId) => setSelectedId(newId));
    }
  }, [selected, title, summary, faqs]); // eslint-disable-line react-hooks/exhaustive-deps

  const publish = useCallback(() => {
    if (!selected) return;
    const ext = { page_key: "faq", faqs };
    const bodyHtml = faqs.map((f) => `<h3>${f.question}</h3><p>${f.answer}</p>`).join("");
    updateMut.mutate({
      id: selected.id,
      body: { title, summary: summary || null, contentHtml: bodyHtml, extensionJson: ext, status: "PUBLISHED" },
    }, {
      onSuccess: () => { publishVersion(selected.id); },
    });
  }, [selected, title, summary, faqs]); // eslint-disable-line react-hooks/exhaustive-deps

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
            <span> › 编辑常见问题</span>
            {selected && <span style={{ marginLeft: 8, fontSize: 10, color: selected.status === "PUBLISHED" ? "#22c55e" : "#f59e0b" }}>#{selected.id} · {selected.status === "PUBLISHED" ? "已发布" : "草稿"}</span>}
          </div>

          {!selected ? (
            <div style={card}><p style={{ color: "#b0a89a", textAlign: "center", padding: 40 }}>暂无版本，请先创建一个</p></div>
          ) : (
            <>
              <div style={card}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>❓ 常见问题 — 基础信息</h3>
                <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={labelStyle}>标题</span>
                    <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={labelStyle}>副标题 / 描述</span>
                    <input style={inputStyle} value={summary} onChange={(e) => setSummary(e.target.value)} />
                  </div>
                </div>
              </div>

              <div style={card}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>📝 问答条目（{faqs.length} 条）</h3>
                {faqs.map((faq, i) => (
                  <div key={i} style={{ marginBottom: 10, padding: "12px 16px", background: "#fafaf9", borderRadius: 10, border: "1px solid #e8e4df" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#8b7355", flex: 1 }}>问答 {i + 1}</span>
                      {faqs.length > 1 && (
                        <button style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #d4c9b8", background: "white", fontSize: 11, cursor: "pointer", color: "#999" }} onClick={() => setFaqs(faqs.filter((_, j) => j !== i))}>删除</button>
                      )}
                    </div>
                    <input style={{ ...inputStyle, marginBottom: 6 }} placeholder="问题" value={faq.question} onChange={(e) => { const n = [...faqs]; n[i] = { ...n[i], question: e.target.value }; setFaqs(n); }} />
                    <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} placeholder="答案" value={faq.answer} onChange={(e) => { const n = [...faqs]; n[i] = { ...n[i], answer: e.target.value }; setFaqs(n); }} />
                  </div>
                ))}
                <button style={{ fontSize: 11, color: "#d97706", fontWeight: 600, cursor: "pointer", background: "none", border: "none", marginTop: 4 }} onClick={() => setFaqs([...faqs, { question: "", answer: "" }])}>+ 添加 FAQ</button>
              </div>

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
