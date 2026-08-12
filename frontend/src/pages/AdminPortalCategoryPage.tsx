import { useState } from "react";
import { fetchAdminCategories, createCategory, updateCategory, deleteCategory, type PortalCategory } from "@/api/domains/portalContent.api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { portalContentQueryKeys } from "@/api/hooks/queryKeys";
import toast from "react-hot-toast";
import { Plus, Trash2, Check, X } from "lucide-react";

const SCOPE_LABELS: Record<string, string> = {
  NEWS: "科研文章", NOTICE: "通知公告", MODEL_RESOURCE: "模型资源", ALL: "通用",
};

export default function AdminPortalCategoryPage() {
  const qc = useQueryClient();
  const { data: categories = [], isFetching } = useQuery({
    queryKey: portalContentQueryKeys.categories("admin"),
    queryFn: fetchAdminCategories,
  });

  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState("MODEL_RESOURCE");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editScope, setEditScope] = useState("");

  const createMut = useMutation({
    mutationFn: createCategory,
    onSuccess: () => { qc.invalidateQueries({ queryKey: portalContentQueryKeys.all }); setNewName(""); toast.success("分类已创建"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof updateCategory>[1] }) => updateCategory(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: portalContentQueryKeys.all }); setEditingId(null); toast.success("已保存"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => { qc.invalidateQueries({ queryKey: portalContentQueryKeys.all }); toast.success("已删除"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "14px 24px", display: "flex", alignItems: "center", gap: 12, background: "white", borderBottom: "1px solid #e8e4df", flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>📂 分类管理</span>
        <span style={{ color: "#b0a89a", fontSize: 11 }}>共 {categories.length} 个分类</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {/* 新建行 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
          <input style={{ padding: "7px 12px", border: "1px solid #d4c9b8", borderRadius: 8, fontSize: 12, width: 200, outline: "none" }}
            placeholder="分类名称" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newName.trim() && createMut.mutate({ name: newName.trim(), scope: newScope })} />
          <select style={{ padding: "7px 10px", border: "1px solid #d4c9b8", borderRadius: 8, fontSize: 12, background: "white" }}
            value={newScope} onChange={(e) => setNewScope(e.target.value)}>
            <option value="MODEL_RESOURCE">模型资源</option>
            <option value="NEWS">科研文章</option>
            <option value="NOTICE">通知公告</option>
            <option value="ALL">通用</option>
          </select>
          <button onClick={() => newName.trim() && createMut.mutate({ name: newName.trim(), scope: newScope })}
            style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#d97706", color: "white", border: "none", cursor: "pointer" }}>
            <Plus className="size-3.5 inline mr-1" />新建
          </button>
        </div>

        {/* 分类列表 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {categories.map((cat) => (
            <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "white", border: "1px solid #e8e4df", borderRadius: 10, padding: "10px 14px" }}>
              {editingId === cat.id ? (
                <>
                  <input style={{ padding: "5px 10px", border: "1px solid #d4c9b8", borderRadius: 6, fontSize: 12, flex: 1, outline: "none" }}
                    value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                  <select style={{ padding: "5px 8px", border: "1px solid #d4c9b8", borderRadius: 6, fontSize: 12 }} value={editScope} onChange={(e) => setEditScope(e.target.value)}>
                    <option value="MODEL_RESOURCE">模型资源</option><option value="NEWS">科研文章</option><option value="NOTICE">通知公告</option><option value="ALL">通用</option>
                  </select>
                  <button onClick={() => updateMut.mutate({ id: cat.id, body: { name: editName, scope: editScope } })}
                    style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: "#22c55e", color: "white", cursor: "pointer", fontSize: 12 }}><Check className="size-3.5" /></button>
                  <button onClick={() => setEditingId(null)}
                    style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #d4c9b8", background: "white", cursor: "pointer", fontSize: 12 }}><X className="size-3.5" /></button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{cat.name}</span>
                  <span style={{ fontSize: 10, color: "#b0a89a", background: "#f0ece6", padding: "2px 8px", borderRadius: 99 }}>{SCOPE_LABELS[cat.scope] || cat.scope}</span>
                  <button onClick={() => { setEditingId(cat.id); setEditName(cat.name); setEditScope(cat.scope); }}
                    style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #d4c9b8", background: "white", cursor: "pointer", color: "#666" }}>编辑</button>
                  <button onClick={() => { if (confirm(`删除"${cat.name}"？`)) deleteMut.mutate(cat.id); }}
                    style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #d4c9b8", background: "white", cursor: "pointer", color: "#dc2626" }}><Trash2 className="size-3" /></button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
