import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { createTeam, type TeamSummary, type TeamVisibility } from "@/api/domains/team.api";
import { useTeams } from "./hooks/useTeams";
import "@/features/aup/aup.css";

const PAGE_SIZE = 20;

function fmt(s?: string) {
  return s ? s.replace("T", " ").slice(0, 16) : "—";
}

function visibilityLabel(v: string) {
  return v === "PRIVATE" ? "私有" : "公开";
}

function statusMeta(s?: string) {
  const u = (s ?? "").toUpperCase();
  if (u === "ACTIVE" || u === "NORMAL") return { text: "正常", bg: "#e8f7ee", color: "#16a34a" };
  if (u === "DISSOLVED") return { text: "已解散", bg: "#f1f5f9", color: "#64748b" };
  return { text: s || "—", bg: "#eef1f6", color: "#8a94a6" };
}

function CreateTeamModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<TeamVisibility>("PUBLIC");
  const [maxMembers, setMaxMembers] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      createTeam({
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
        maxMembers: maxMembers.trim() ? Number(maxMembers.trim()) : undefined,
      }),
    onSuccess: (team) => {
      toast.success("团队已创建");
      onCreated(team.id);
    },
    onError: (e: Error) => toast.error(e.message || "创建失败"),
  });

  return (
    <div className="aup-modal-mask" onClick={onClose}>
      <div className="aup-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3>新建团队</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 13 }}>
            名称
            <input
              className="input"
              style={{ width: "100%", marginTop: 4 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="团队名称"
            />
          </label>
          <label style={{ fontSize: 13 }}>
            简介
            <textarea
              className="textarea"
              style={{ width: "100%", marginTop: 4 }}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="团队简介（可选）"
            />
          </label>
          <label style={{ fontSize: 13 }}>
            可见性
            <select
              className="select"
              style={{ width: "100%", marginTop: 4 }}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as TeamVisibility)}
            >
              <option value="PUBLIC">公开</option>
              <option value="PRIVATE">私有</option>
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            最大人数（可选）
            <input
              className="input"
              style={{ width: "100%", marginTop: 4 }}
              type="number"
              min={1}
              value={maxMembers}
              onChange={(e) => setMaxMembers(e.target.value)}
              placeholder="不填则不限制"
            />
          </label>
        </div>
        <div className="aup-modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!name.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? "创建中…" : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const goBack = useGoBack("/content-manager/content");

  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [applied, setApplied] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useTeams(page, PAGE_SIZE, applied);
  const rows: TeamSummary[] = data?.list ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="aup-app aup-app--workbench">
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={goBack}>
              ← 返回
            </button>
            <h1>团队管理</h1>
            <span className="aup-wb-count">共 {total} 个团队</span>
          </div>
          <div className="aup-wb-actions">
            <button type="button" className="btn primary small" onClick={() => setCreateOpen(true)}>
              ＋ 新建团队
            </button>
          </div>
        </div>

        <div className="aup-wb-toolbar">
          <input
            className="input"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setApplied(keyword.trim());
                setPage(1);
              }
            }}
            placeholder="搜索团队名称"
          />
          <button type="button" className="btn ghost small" onClick={() => { setApplied(keyword.trim()); setPage(1); }}>
            搜索
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {isLoading ? (
            <div className="aup-wb-empty">加载中…</div>
          ) : rows.length === 0 ? (
            <div className="aup-wb-empty">暂无团队，点「＋ 新建团队」创建第一个团队</div>
          ) : (
            <table className="list-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>简介</th>
                  <th>可见性</th>
                  <th>状态</th>
                  <th>成员数</th>
                  <th>创建者</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const st = statusMeta(t.status);
                  return (
                    <tr
                      key={t.id}
                      className="row"
                      onClick={() => navigate(`/content-manager/nhp-team/${t.id}`)}
                    >
                      <td className="proj-name">{t.name}</td>
                      <td style={{ color: "var(--muted)", maxWidth: 320 }}>{t.description || "—"}</td>
                      <td>{visibilityLabel(t.visibility)}</td>
                      <td>
                        <span className="status-badge" style={{ background: st.bg, color: st.color }}>
                          {st.text}
                        </span>
                      </td>
                      <td>{t.memberCount}</td>
                      <td>{t.ownerName || "—"}</td>
                      <td style={{ color: "var(--muted)" }}>{fmt(t.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 10, justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </button>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {page} / {totalPages}
            </span>
            <button
              type="button"
              className="btn ghost small"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {createOpen && (
        <CreateTeamModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            void qc.invalidateQueries({ queryKey: ["team", "list"] });
            navigate(`/content-manager/nhp-team/${id}`);
          }}
        />
      )}
    </div>
  );
}
