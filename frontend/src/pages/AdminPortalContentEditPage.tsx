import { useState, useRef, useEffect } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { useCreateContent, useUpdateContent, useAdminContent } from "@/api/hooks/usePortalContent";
import { fetchPublicCategories, type PortalCategory, type ContentType, type ContentStatus } from "@/api/domains/portalContent.api";
import { toDateTimeLocalValue } from "@/utils/beijingTime";
import toast from "react-hot-toast";

/** 表单里的中文档位 ↔ 接口枚举（下拉框沿用中文值，列表页 tab 走枚举） */
const TYPE_LABEL: Record<string, string> = { NEWS: "科研文章", NOTICE: "通知公告", MODEL_RESOURCE: "模型资源", PAGE: "页面" };
const TYPE_CODE: Record<string, ContentType> = { 科研文章: "NEWS", 通知公告: "NOTICE", 模型资源: "MODEL_RESOURCE", 页面: "PAGE" };
/** 分类作用域：页面类型没有自己的分类，借用模型资源那套 */
const TYPE_SCOPE: Record<ContentType, string> = { NEWS: "NEWS", NOTICE: "NOTICE", MODEL_RESOURCE: "MODEL_RESOURCE", PAGE: "MODEL_RESOURCE" };

export default function AdminPortalContentEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  // 从列表页的 tab 带过来（`?type=NOTICE`）：新建时直接落在那一档，不用再选一遍内容类型
  const [searchParams] = useSearchParams();
  const initialType = TYPE_LABEL[searchParams.get("type") ?? ""] ?? "科研文章";

  const [contentType, setContentType] = useState(initialType);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("草稿");
  const [publishedAt, setPublishedAt] = useState("");
  const [summary, setSummary] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [strainId, setStrainId] = useState("");
  const [strainBg, setStrainBg] = useState("");
  const [modMethod, setModMethod] = useState("");
  const [fertility, setFertility] = useState("可育");
  const [housing, setHousing] = useState("");
  const [commonName, setCommonName] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [priority, setPriority] = useState("routine");
  const [links, setLinks] = useState<{ url: string; label: string }[]>([]);

  const showExt = contentType === "模型资源";
  const titleLabel = isNew ? "新建内容" : `编辑${contentType} #${id}`;
  const typeCode = TYPE_CODE[contentType] ?? "NEWS";
  /** 保存/取消回到列表页时带上当前档位，落地就是原来那个 tab */
  const backToList = `/content-manager/content?type=${typeCode}`;
  const navigate = useNavigate();

  // 从 API 加载分类
  const [allCategories, setAllCategories] = useState<PortalCategory[]>([]);
  useEffect(() => { fetchPublicCategories().then(setAllCategories).catch(() => {}); }, []);
  const scopeFilter = TYPE_SCOPE[typeCode];
  const catOptions = allCategories.filter((c) => c.scope === scopeFilter || c.scope === "ALL");

  // 加载已有数据
  const editId = isNew ? undefined : Number(id);
  const { data: existing } = useAdminContent(editId ?? 0);
  useEffect(() => {
    if (!existing) return;
    setContentType(TYPE_LABEL[existing.contentType] ?? "页面");
    setTitle(existing.title);
    setCategory(existing.categoryId ? String(existing.categoryId) : "");
    setStatus(existing.status === "PUBLISHED" ? "已发布" : existing.status === "DRAFT" ? "草稿" : "已归档");
    setPublishedAt(toDateTimeLocalValue(existing.publishedAt));
    setSummary(existing.summary || "");
    setBodyHtml(existing.contentHtml || "");
    setCoverUrl(existing.coverUrl || "");
    let ext: Record<string, unknown> = {};
    try {
      ext = typeof existing.extensionJson === 'string'
        ? JSON.parse(existing.extensionJson)
        : (existing.extensionJson as Record<string, unknown>) || {};
    } catch {
      ext = {};
    }
    setStrainId((ext.strainId as string) || "");
    setStrainBg((ext.strainBg as string) || "");
    setModMethod((ext.modMethod as string) || "");
    setFertility((ext.fertility as string) || "");
    setHousing((ext.housing as string) || "");
    setCommonName((ext.commonName as string) || "");
    setSortOrder(existing.sortOrder ?? 0);
    setPriority((ext.priority as string) || "routine");
    if (Array.isArray(ext.links)) setLinks(ext.links as Array<{ url: string; label: string }>);
  }, [existing]);

  // 变更 hooks
  const createMut = useCreateContent();
  const updateMut = useUpdateContent();

  const buildBody = (targetStatus: string) => ({
    contentType: typeCode,
    categoryId: category ? Number(category) : null,
    title,
    summary: summary || null,
    coverUrl: coverUrl || null,
    contentHtml: bodyHtml || null,
    status: (targetStatus === "已发布" ? "PUBLISHED" : targetStatus === "草稿" ? "DRAFT" : "ARCHIVED") as ContentStatus,
    publishedAt: publishedAt || null,
    extensionJson: showExt
      ? { strainId, strainBg, modMethod, fertility, housing, commonName, links }
      : contentType === "通知公告"
        ? { priority }
        : undefined,
    sortOrder,
  });

  const save = (targetStatus: string) => {
    const body = buildBody(targetStatus);
    if (isNew) {
      createMut.mutate(body as Parameters<typeof createMut.mutate>[0], {
        onSuccess: () => navigate(backToList),
      });
    } else {
      updateMut.mutate({ id: editId!, body }, {
        onSuccess: () => navigate(backToList),
      });
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadSingleImage(file);
      setCoverUrl(result.url);
      toast.success("封面上传成功");
    } catch (err) {
      toast.error("上传失败");
    } finally {
      setUploading(false);
    }
  };

  const card: React.CSSProperties = {
    background: "white", border: "1px solid #e8e4df", borderRadius: 14,
    padding: "22px 24px", marginBottom: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
  };
  const cardH3: React.CSSProperties = {
    fontSize: 14, fontWeight: 700, marginBottom: 16,
    display: "flex", alignItems: "center", gap: 8,
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
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
  const fg = (flex = 1): React.CSSProperties => ({ display: "flex", flexDirection: "column", gap: 4, flex });
  const row: React.CSSProperties = { display: "flex", gap: 16, marginBottom: 14 };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24, background: "#f5f3f0" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* 面包屑 */}
        <div style={{ fontSize: 12, color: "#b0a89a", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
          <Link to={backToList} style={{ color: "#8b7355", textDecoration: "none" }}>门户内容管理</Link>
          <span>›</span>
          <span>{titleLabel}</span>
        </div>

        {/* ===== 基础信息（所有类型共享） ===== */}
        <div style={card}>
          <h3 style={cardH3}><span style={{ fontSize: 16 }}>📋</span> 基础信息</h3>
          <div style={row}>
            <div style={fg()}>
              <span style={labelStyle}><span style={{ color: "#dc2626" }}>*</span> 内容类型</span>
              <select style={selectStyle} value={contentType} onChange={(e) => setContentType(e.target.value)}>
                <option>科研文章</option><option>通知公告</option><option>模型资源</option><option>页面</option>
              </select>
            </div>
            <div style={fg()}>
              <span style={labelStyle}><span style={{ color: "#dc2626" }}>*</span> 标题</span>
              <input style={inputStyle} placeholder="输入标题" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>

          {/* 科研文章 + 通知公告：分类选择 */}
          {(contentType === "科研文章" || contentType === "通知公告") && (
            <div style={row}>
              <div style={fg()}>
                <span style={labelStyle}>所属分类</span>
                <select style={selectStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {(catOptions.length > 0 ? catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>) : <option>加载中…</option>)}
                </select>
              </div>
              <div style={fg()}>
                <span style={labelStyle}>状态</span>
                <select style={selectStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option>已发布</option><option>草稿</option><option>已归档</option>
                </select>
              </div>
              <div style={fg()}>
                <span style={labelStyle}>发布时间</span>
                <input type="datetime-local" style={inputStyle} value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
              </div>
            </div>
          )}

          {/* 通知公告专属：优先级 */}
          {contentType === "通知公告" && (
            <div style={row}>
              <div style={fg()}>
                <span style={labelStyle}>优先级</span>
                <select style={selectStyle} value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="routine">常规</option><option value="notice">通知</option><option value="important">重要</option>
                </select>
              </div>
            </div>
          )}

          {/* 模型资源：分类 + 状态 + 权重 */}
          {contentType === "模型资源" && (
            <div style={row}>
              <div style={fg()}>
                <span style={labelStyle}>所属分类</span>
                <select style={selectStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {(catOptions.length > 0 ? catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>) : <option>加载中…</option>)}
                </select>
              </div>
              <div style={fg()}>
                <span style={labelStyle}>状态</span>
                <select style={selectStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option>已发布</option><option>草稿</option><option>已归档</option>
                </select>
              </div>
              <div style={fg()}>
                <span style={labelStyle}>首页排序权重</span>
                <input type="number" style={inputStyle} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} placeholder="越大越靠前" />
              </div>
            </div>
          )}

          {/* 页面：仅状态 */}
          {contentType === "页面" && (
            <div style={row}>
              <div style={fg()}>
                <span style={labelStyle}>状态</span>
                <select style={selectStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option>已发布</option><option>草稿</option>
                </select>
              </div>
            </div>
          )}

          {/* 非页面类型：摘要字段 */}
          {contentType !== "页面" && (
            <div style={{ display: "flex", gap: 16 }}>
              <div style={fg()}>
                <span style={labelStyle}>摘要 / 副标题</span>
                <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} placeholder="列表页展示的摘要文字" value={summary} onChange={(e) => setSummary(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* ===== 封面图（科研文章 + 模型资源） ===== */}
        {(contentType === "科研文章" || contentType === "模型资源") ? (
          <div style={card}>
            <h3 style={cardH3}><span style={{ fontSize: 16 }}>🖼️</span> 封面图</h3>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleCoverUpload} style={{ display: "none" }} />
            {coverUrl ? (
              <div style={{ position: "relative" }}>
                <img src={coverUrl} alt="封面" style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 12 }} />
                <button onClick={() => setCoverUrl("")} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", color: "white", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            ) : (
              <div onClick={() => fileRef.current?.click()}
                style={{ border: "2px dashed #d4c9b8", borderRadius: 12, padding: 28, textAlign: "center", cursor: "pointer", background: "#fafaf9", opacity: uploading ? 0.5 : 1 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>{uploading ? "⏳" : "🖼️"}</div>
                <div style={{ fontSize: 12, color: "#8b7355" }}>{uploading ? "上传中…" : "点击上传或拖拽图片到此处"}</div>
                <div style={{ fontSize: 10, color: "#b0a89a", marginTop: 4 }}>建议尺寸 1200×630px，支持 JPG/PNG/WebP，最大 5MB</div>
              </div>
            )}
          </div>
        ) : null}

        {/* ===== 正文编辑器（所有类型） ===== */}
        <div style={card}>
          <h3 style={cardH3}><span style={{ fontSize: 16 }}>📝</span> 正文</h3>
          <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
        </div>

        {/* ===== 扩展字段（仅模型资源） ===== */}
        {contentType === "模型资源" ? (
          <div style={card}>
            <h3 style={cardH3}><span style={{ fontSize: 16 }}>🧬</span> 扩展字段 — 仅模型资源</h3>
            <div style={{ borderLeft: "3px solid #ede9fe", background: "#faf9fe", borderRadius: "0 10px 10px 0", padding: "16px 20px", marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#6d28d9", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>品系专属信息</div>
              <div style={row}>
                <div style={fg()}><span style={labelStyle}>品系编号</span><input style={inputStyle} placeholder="如 SHSMU-M-00018" value={strainId} onChange={(e) => setStrainId(e.target.value)} /></div>
                <div style={fg()}><span style={labelStyle}>遗传背景</span><input style={inputStyle} placeholder="如 NOD/SCID" value={strainBg} onChange={(e) => setStrainBg(e.target.value)} /></div>
                <div style={fg()}><span style={labelStyle}>修饰方式</span><input style={inputStyle} placeholder="如 CRISPR/Cas9 KO" value={modMethod} onChange={(e) => setModMethod(e.target.value)} /></div>
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={fg()}><span style={labelStyle}>纯合子育性</span><select style={selectStyle} value={fertility} onChange={(e) => setFertility(e.target.value)}><option>可育</option><option>不育</option><option>未知</option></select></div>
                <div style={fg()}><span style={labelStyle}>饲养环境</span><input style={inputStyle} placeholder="如 SPF 级" value={housing} onChange={(e) => setHousing(e.target.value)} /></div>
                <div style={fg()}><span style={labelStyle}>常用名</span><input style={inputStyle} placeholder="如 NSG 小鼠" value={commonName} onChange={(e) => setCommonName(e.target.value)} /></div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <span style={labelStyle}>百科外链</span>
              <div style={{ marginTop: 8 }}>
                {links.map((link, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <input style={inputStyle} placeholder="链接 URL" value={link.url} onChange={(e) => { const n = [...links]; n[i] = { ...n[i], url: e.target.value }; setLinks(n); }} />
                    <input style={{ ...inputStyle, maxWidth: 160 }} placeholder="链接显示文字" value={link.label} onChange={(e) => { const n = [...links]; n[i] = { ...n[i], label: e.target.value }; setLinks(n); }} />
                    <button style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #d4c9b8", background: "white", fontSize: 11, cursor: "pointer", color: "#666" }} onClick={() => setLinks(links.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
                <button style={{ fontSize: 11, color: "#d97706", fontWeight: 600, cursor: "pointer", background: "none", border: "none", marginTop: 4 }} onClick={() => setLinks([...links, { url: "", label: "" }])}>+ 添加外链</button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ===== 操作栏 ===== */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
          <Link to={backToList} style={{ padding: "9px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "white", color: "#666", border: "1px solid #d4c9b8", textDecoration: "none" }}>取消</Link>
          <button onClick={() => save("草稿")} disabled={createMut.isPending || updateMut.isPending}
            style={{ padding: "9px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "white", color: "#d97706", border: "1px solid #d97706", opacity: (createMut.isPending || updateMut.isPending) ? 0.5 : 1 }}>
            {createMut.isPending || updateMut.isPending ? "保存中…" : "保存草稿"}
          </button>
          <button onClick={() => save("已发布")} disabled={createMut.isPending || updateMut.isPending}
            style={{ padding: "9px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: "#d97706", color: "white", opacity: (createMut.isPending || updateMut.isPending) ? 0.5 : 1 }}>
            {createMut.isPending || updateMut.isPending ? "发布中…" : "发布"}
          </button>
        </div>

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
