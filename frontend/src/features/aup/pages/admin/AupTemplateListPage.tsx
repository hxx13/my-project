import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
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
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import { appConfirm } from "@/lib/appDialog";
import "../../aup.css";

gsap.registerPlugin(useGSAP);

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

/** 状态 → 印章（计划书式） */
function statusSeal(status: string): { lines: string[]; cls: string } {
  switch (status) {
    case "PUBLISHED":
      return { lines: ["已", "发布"], cls: "approved" };
    case "ARCHIVED":
      return { lines: ["已", "归档"], cls: "terminated" };
    default:
      return { lines: ["草稿"], cls: "draft" };
  }
}

/**
 * 计划书模板版本列表管理页（计划书式卡片）。
 * 统一管理所有版本：改名 / 描述 / 复制 / 删除 / 一键导入内置 / 进入编辑。
 */
export default function AupTemplateListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const templatesQuery = useQuery({ queryKey: ["aup", "templates"], queryFn: fetchAupTemplates });
  const templates = useMemo(
    () => (templatesQuery.data ?? []).sort((a, b) => b.updatedAt?.localeCompare(a.updatedAt ?? "") ?? 0),
    [templatesQuery.data]
  );

  const [editingId, setEditingId] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");

  const gridRef = useRef<HTMLDivElement>(null);

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

  useGSAP(
    () => {
      const cards = gridRef.current?.querySelectorAll(".aup-doc-stack");
      if (!cards || cards.length === 0) return;
      gsap.fromTo(
        cards,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.07, ease: "power2.out", overwrite: true }
      );
    },
    { scope: gridRef, dependencies: [templates] }
  );

  return (
    <div className="aup-app" style={{ padding: "24px", maxWidth: 1240, margin: "0 auto" }}>
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
        <div
          ref={gridRef}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 20, perspective: "1200px" }}
        >
          {templates.map((t) => {
            const seal = statusSeal(t.status);
            return (
              <div className="aup-doc-stack" key={t.id}>
                <div className="aup-doc">
                  <div className="aup-doc-hd">
                    <span className="aup-doc-title">实验动物使用计划书 · 模板</span>
                    <span className="aup-doc-no">v{t.version}</span>
                  </div>
                  <div className="aup-doc-body">
                    <div className="aup-f">
                      <div className="aup-f-k">模板名称</div>
                      {editingId === t.id ? (
                        <input
                          className="input"
                          style={{ padding: "6px 10px", fontSize: 13 }}
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
                          className="aup-f-v"
                          style={{ cursor: "pointer" }}
                          onClick={() => startEdit(t.id, t.name, t.description)}
                          title="点击编辑名称/描述"
                        >
                          {t.name || "未命名"}
                        </div>
                      )}
                    </div>
                    <div className="aup-f">
                      <div className="aup-f-k">模板描述</div>
                      {editingId === t.id ? (
                        <textarea
                          className="textarea"
                          style={{ padding: "8px 10px", fontSize: 13 }}
                          value={descDraft}
                          rows={3}
                          onChange={(e) => setDescDraft(e.target.value)}
                          onBlur={() => saveEdit(t.id)}
                          placeholder="模板描述（可选，显示给填写人，支持富文本 HTML）"
                        />
                      ) : (
                        <div
                          className="aup-f-v"
                          style={{ cursor: "pointer", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                          onClick={() => startEdit(t.id, t.name, t.description)}
                          title={t.description || ""}
                        >
                          {t.description || "—"}
                        </div>
                      )}
                    </div>
                    <div className="aup-f">
                      <div className="aup-f-k">最近更新</div>
                      <div className="aup-f-v">{t.updatedAt ? formatDateTimeAsiaShanghaiShort(t.updatedAt) : "—"}</div>
                    </div>
                  </div>
                  <div className="aup-doc-foot">
                    <div className="aup-doc-acts">
                      <button className="btn ghost small" onClick={() => navigate(`/content-manager/aup-template/edit/${t.id}`)}>
                        {t.status === "DRAFT" ? "编辑 ▸" : "查看 ▸"}
                      </button>
                      {t.status === "DRAFT" && (
                        <button
                          className="btn primary small"
                          onClick={async () => {
                            if (await appConfirm("发布后将冻结该草稿并使其对填写人生效，上一发布版本将归档。确认发布？")) publishMutation.mutate(t.id);
                          }}
                          disabled={publishMutation.isPending}
                        >
                          发布
                        </button>
                      )}
                      {t.status === "PUBLISHED" && (
                        <button
                          className="btn ghost small"
                          onClick={async () => {
                            if (await appConfirm("归档后该版本将不再对填写人生效。确认归档？")) archiveMutation.mutate(t.id);
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
                            onClick={async () => {
                              if (await appConfirm("删除该模板版本？该模板下同步(ARO)/演示(demo)的计划书将一并删除；若仍有本地填写的计划书将被拒绝。此操作不可恢复。")) deleteMutation.mutate(t.id);
                            }}
                            disabled={deleteMutation.isPending}
                            className="text-red-600 focus:text-red-600"
                          >
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="aup-doc-foot-right">
                      <div className={"aup-seal " + seal.cls}>
                        {seal.lines.map((l) => (
                          <span key={l}>{l}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
