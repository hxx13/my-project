import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  archiveAupTemplate,
  copyAupTemplate,
  createAupTemplate,
  deleteAupTemplate,
  fetchAupDefaultSeed,
  fetchAupTemplates,
  publishAupTemplate,
  updateAupTemplate,
  updateAupTemplateMeta,
} from "../../api/aup.api";
import "../../aup.css";

/** 状态标签文案 */
function statusLabel(status: string): string {
  switch (status) {
    case "PUBLISHED":
      return "已发布";
    case "ARCHIVED":
      return "已归档";
    default:
      return "草稿";
  }
}

/**
 * 计划书模板版本列表管理页。
 * 统一管理所有版本：改名 / 描述 / 复制 / 删除 / 一键导入内置 / 进入编辑。
 */
export default function AupTemplateListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const templatesQuery = useQuery({ queryKey: ["aup", "templates"], queryFn: fetchAupTemplates });
  const templates = (templatesQuery.data ?? []).sort((a, b) => b.updatedAt?.localeCompare(a.updatedAt ?? "") ?? 0);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["aup", "templates"] });

  const copyMutation = useMutation({
    mutationFn: (id: number) => copyAupTemplate(id),
    onSuccess: () => {
      toast.success("已复制为草稿副本");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "复制失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAupTemplate(id),
    onSuccess: () => {
      toast.success("已删除");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const publishMutation = useMutation({
    mutationFn: (id: number) => publishAupTemplate(id),
    onSuccess: () => {
      toast.success("已发布");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "发布失败"),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => archiveAupTemplate(id),
    onSuccess: () => {
      toast.success("已归档");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "归档失败"),
  });

  const metaMutation = useMutation({
    mutationFn: ({ id, name, description }: { id: number; name: string; description?: string }) =>
      updateAupTemplateMeta(id, { name, description }),
    onSuccess: () => {
      toast.success("已保存");
      setEditingId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const importSeedMutation = useMutation({
    mutationFn: async () => {
      const seed = await fetchAupDefaultSeed();
      const brief = await createAupTemplate({ formKey: "aup", name: seed.name || "AUP 计划书模板" });
      return updateAupTemplate(brief.id, {
        name: seed.name || "AUP 计划书模板",
        description: seed.description,
        sections: seed.sections ?? [],
      });
    },
    onSuccess: () => {
      toast.success("已从内置模板创建版本");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "导入失败"),
  });

  const startEdit = (id: number, name: string, description?: string) => {
    setEditingId(id);
    setNameDraft(name);
    setDescDraft(description ?? "");
  };

  const saveEdit = (id: number) => {
    metaMutation.mutate({ id, name: nameDraft.trim() || "未命名", description: descDraft });
  };

  return (
    <div className="aup-app" style={{ padding: "24px" }}>
      <div className="page-hd">
        <div>
          <h1>计划书模板管理</h1>
          <div className="sub">统一管理模板版本：改名 / 描述 / 复制 / 删除，进入编辑页调整结构与发布</div>
        </div>
        <button
          className="btn primary"
          onClick={() => importSeedMutation.mutate()}
          disabled={importSeedMutation.isPending}
        >
          {importSeedMutation.isPending ? "导入中…" : "＋ 导入内置模板"}
        </button>
      </div>

      {templatesQuery.isLoading ? (
        <div className="aup-empty">加载中…</div>
      ) : templates.length === 0 ? (
        <div className="aup-empty">
          暂无模板版本，点击右上角「导入内置模板」一键生成
        </div>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th style={{ width: 240 }}>模板名称</th>
              <th style={{ maxWidth: 300 }}>描述</th>
              <th style={{ width: 90 }}>状态</th>
              <th style={{ width: 200, whiteSpace: "nowrap" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>
                  {editingId === t.id ? (
                    <input
                      className="input"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={() => saveEdit(t.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(t.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <div
                      className="proj-name"
                      style={{ cursor: "pointer" }}
                      onClick={() => startEdit(t.id, t.name, t.description)}
                      title="点击编辑名称/描述"
                    >
                      {t.name || "未命名"}
                    </div>
                  )}
                </td>
                <td style={{ maxWidth: 300 }}>
                  {editingId === t.id ? (
                    <textarea
                      className="textarea"
                      value={descDraft}
                      rows={2}
                      onChange={(e) => setDescDraft(e.target.value)}
                      onBlur={() => saveEdit(t.id)}
                      placeholder="模板描述（可选，显示给填写人，支持富文本 HTML）"
                    />
                  ) : (
                    <div
                      style={{ color: "var(--muted)", fontSize: 13, wordBreak: "break-word", lineHeight: 1.5, maxWidth: 300 }}
                      onClick={() => startEdit(t.id, t.name, t.description)}
                    >
                      {t.description || "—"}
                    </div>
                  )}
                </td>
                <td>
                  <span className={"status-badge " + (t.status === "PUBLISHED" ? "approved" : t.status === "DRAFT" ? "draft" : "terminated")}>
                    {statusLabel(t.status)}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
                    <button className="btn ghost small" onClick={() => navigate(`/content-manager/aup-template/edit/${t.id}`)}>
                      {t.status === "DRAFT" ? "编辑 ▸" : "查看 ▸"}
                    </button>
                    {t.status === "DRAFT" && (
                      <button
                        className="btn primary small"
                        onClick={() => {
                          if (window.confirm("发布后将冻结该草稿并使其对填写人生效，上一发布版本将归档。确认发布？")) publishMutation.mutate(t.id);
                        }}
                        disabled={publishMutation.isPending}
                      >
                        发布
                      </button>
                    )}
                    {t.status === "PUBLISHED" && (
                      <button
                        className="btn ghost small"
                        onClick={() => {
                          if (window.confirm("归档后该版本将不再对填写人生效。确认归档？")) archiveMutation.mutate(t.id);
                        }}
                        disabled={archiveMutation.isPending}
                      >
                        归档
                      </button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="btn ghost small">更多 ▾</button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => copyMutation.mutate(t.id)} disabled={copyMutation.isPending}>
                          复制
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            if (window.confirm("删除该模板版本？其内容将被永久清除，且不可恢复。")) deleteMutation.mutate(t.id);
                          }}
                          disabled={deleteMutation.isPending || t.status === "PUBLISHED"}
                          className="text-red-600 focus:text-red-600"
                        >
                          {t.status === "PUBLISHED" ? "删除（需先归档）" : "删除"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
