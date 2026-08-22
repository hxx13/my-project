/**
 * NHP 填写实例管理（后台）：以手术实例为文件夹，卡片/列表切换，详情页审计追溯。
 * 入口：/#/content-manager/nhp-records
 * 深链：?create=1&formKey=…&subjectId=…（管理端建实例）
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import ContentManagerWorkbenchLayout from "@/layouts/ContentManagerWorkbenchLayout";
import {
  createNhpRecord,
  fetchNhpRecords,
  fetchNhpSubjects,
  type NhpSubject,
} from "../../api/nhpRecord.api";
import { fetchNhpSubjectBoard, lifecycleStageLabel } from "../../api/nhpSubjectBoard.api";
import { fetchNhpTemplates, fillableFormId, isFillablePublished, type NhpTemplateListItem } from "../../api/nhpTemplate.api";
import { animalTypeLabel } from "../../utils/nhpSubjectLabels";
import { nhpNavState } from "../../utils/nhpAdminNav";
import { surgeryContextFromCard, surgeryContextsFromRecords } from "../../utils/nhpSurgeryContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import "@/features/aup/aup.css";
import "../../nhp.css";

type ViewMode = "card" | "list";

function isActiveRecord(row: { record: { status?: string | null } }): boolean {
  return (row.record.status ?? "").toUpperCase() !== "DELETED";
}

export default function NhpRecordsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useGoBack("/nhp/overview");
  const [searchParams] = useSearchParams();
  const wantCreate = searchParams.get("create") === "1";
  const formKeyParam = searchParams.get("formKey") || "";
  const filterSubjectId = searchParams.get("subjectId") ? Number(searchParams.get("subjectId")) : undefined;

  const [view, setView] = useState<ViewMode>("card");
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(wantCreate);
  const [subjects, setSubjects] = useState<NhpSubject[]>([]);
  const [templates, setTemplates] = useState<NhpTemplateListItem[]>([]);
  const [pickSubjectId, setPickSubjectId] = useState(filterSubjectId && filterSubjectId > 0 ? String(filterSubjectId) : "");
  const [pickFormKey, setPickFormKey] = useState(formKeyParam);
  const [creating, setCreating] = useState(false);

  const boardQuery = useQuery({ queryKey: ["nhp", "subject-board"], queryFn: () => fetchNhpSubjectBoard() });
  const recordsQuery = useQuery({
    queryKey: ["nhp", "records-all"],
    queryFn: () => fetchNhpRecords({ page: 1, size: 500 }),
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (wantCreate) setShowCreate(true);
    if (filterSubjectId && filterSubjectId > 0) setPickSubjectId(String(filterSubjectId));
    if (formKeyParam) setPickFormKey(formKeyParam);
  }, [wantCreate, filterSubjectId, formKeyParam]);

  useEffect(() => {
    void Promise.all([
      fetchNhpSubjects({ page: 1, size: 200 }).then((r) => setSubjects(r.items ?? [])),
      Promise.all([fetchNhpTemplates("COMPOSITE"), fetchNhpTemplates("ATOM")]).then(([c, a]) => {
        const usable = [...c, ...a].filter(isFillablePublished);
        setTemplates(usable);
        setPickFormKey((prev) => {
          if (prev && usable.some((t) => t.formKey === prev)) return prev;
          return usable[0]?.formKey ?? "";
        });
      }),
    ]).catch((e: Error) => toast.error(e.message || "加载选项失败"));
  }, []);

  const activeRecords = useMemo(
    () => (recordsQuery.data?.items ?? []).filter(isActiveRecord),
    [recordsQuery.data],
  );

  const recordCountBySubject = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of activeRecords) {
      const sid = row.record.subjectId;
      map.set(sid, (map.get(sid) ?? 0) + 1);
    }
    return map;
  }, [activeRecords]);

  const folders = useMemo(() => {
    const boardById = new Map((boardQuery.data ?? []).map((card) => [card.id, card]));
    const qq = q.trim().toLowerCase();
    // 文件夹仅来自有非 DELETED 实例的对象；board 仅用于补充阶段/时点等展示字段
    let list = surgeryContextsFromRecords(activeRecords).map((ctx) => {
      const card = boardById.get(ctx.subjectId);
      return card ? surgeryContextFromCard(card) : ctx;
    });
    if (!qq) return list;
    return list.filter(
      (f) =>
        f.subjectCode.toLowerCase().includes(qq) ||
        f.label.toLowerCase().includes(qq) ||
        (f.currentTp ?? "").toLowerCase().includes(qq),
    );
  }, [activeRecords, boardQuery.data, q]);

  const openDetail = (subjectId: number) => {
    navigate(`/content-manager/nhp-records/${subjectId}`, { state: nhpNavState(location) });
  };

  const onCreateRecord = async () => {
    const sid = Number(pickSubjectId);
    const tpl = templates.find((t) => t.formKey === pickFormKey);
    const formId = tpl ? fillableFormId(tpl) : undefined;
    if (!sid || formId == null) {
      toast.error("请选择动物与已发布模板");
      return;
    }
    setCreating(true);
    try {
      const r = await createNhpRecord(sid, formId);
      await queryClient.invalidateQueries({ queryKey: ["nhp", "records-all"] });
      toast.success(`已创建实例 #${r.id}`);
      navigate(`/content-manager/nhp-entry/${r.id}`, { state: nhpNavState(location) });
    } catch (e) {
      toast.error((e as Error).message || "创建失败");
    } finally {
      setCreating(false);
    }
  };

  const segBtn = (on: boolean) => ({
    padding: "6px 12px",
    fontSize: 12,
    border: "none",
    cursor: "pointer" as const,
    background: on ? "var(--primary-weak)" : "transparent",
    color: on ? "var(--primary)" : "var(--slate)",
    fontWeight: on ? 600 : 500,
  });

  const toolbarExtra = (
    <>
      <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
        <button type="button" style={segBtn(view === "card")} onClick={() => setView("card")}>
          ▦ 卡片
        </button>
        <button type="button" style={segBtn(view === "list")} onClick={() => setView("list")}>
          ☰ 列表
        </button>
      </div>
      <button type="button" className="btn ghost small" onClick={() => setShowCreate((v) => !v)}>
        管理端建实例
      </button>
      <Link to="/nhp/fill" className="btn primary small" style={{ textDecoration: "none" }}>
        门户填写
      </Link>
    </>
  );

  return (
    <ContentManagerWorkbenchLayout
      onBack={goBack}
      searchPlaceholder="手术编号 / 时点"
      searchValue={q}
      onSearchChange={setQ}
      toolbarExtra={toolbarExtra}
      countText={`${folders.length} 个手术实例`}
      split={false}
      main={
        <>
          <div style={{ marginBottom: 12 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>手术实例管理</h1>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              以手术实例为文件夹 · 进入详情查看进度时间线与历史表单 ·{" "}
              <Link to="/nhp/overview" style={{ color: "var(--primary)" }}>
                研究总览
              </Link>
            </div>
          </div>

          {showCreate && (
            <div
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "14px 16px",
                marginBottom: 16,
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700 }}>管理端建实例</span>
              <select className="input" style={{ width: 220 }} value={pickSubjectId} onChange={(e) => setPickSubjectId(e.target.value)}>
                <option value="">选择动物…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.subjectCode} · {animalTypeLabel(s.subjectType)}
                  </option>
                ))}
              </select>
              <select className="input" style={{ width: 280 }} value={pickFormKey} onChange={(e) => setPickFormKey(e.target.value)}>
                {templates.map((t) => (
                  <option key={t.formKey} value={t.formKey}>
                    {t.title || t.formKey}
                  </option>
                ))}
              </select>
              <button type="button" className="btn primary small" disabled={creating} onClick={() => void onCreateRecord()}>
                {creating ? "创建中…" : "创建"}
              </button>
              <button type="button" className="btn ghost small" onClick={() => setShowCreate(false)}>
                收起
              </button>
            </div>
          )}

          {recordsQuery.isPending || recordsQuery.isFetching ? (
            <div className="aup-wb-empty">加载手术实例…</div>
          ) : folders.length === 0 ? (
            <div className="aup-wb-empty">
              暂无手术实例。
              <Link to="/content-manager/nhp-entry" style={{ marginLeft: 8, color: "var(--primary)" }}>
                前往数据采集入口
              </Link>
            </div>
          ) : view === "card" ? (
            <div className="nhp-record-folder-grid">
              {folders.map((f) => (
                <button key={f.key} type="button" className="nhp-record-folder-card" onClick={() => openDetail(f.subjectId)}>
                  <div className="aup-doc-stack">
                    <div className="aup-doc">
                      <div className="aup-doc-hd">
                        <span className="aup-doc-title">手术实例</span>
                        <span className="aup-doc-no">{f.subjectCode}</span>
                      </div>
                      <div className="aup-doc-body">
                        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                          <div>
                            <span style={{ color: "var(--muted)" }}>类型 </span>
                            {animalTypeLabel(f.subjectType)}
                          </div>
                          <div>
                            <span style={{ color: "var(--muted)" }}>阶段 </span>
                            {lifecycleStageLabel(f.lifecycleStage)}
                          </div>
                          <div>
                            <span style={{ color: "var(--muted)" }}>时点 </span>
                            {f.currentTp ?? "—"}
                          </div>
                          <div>
                            <span style={{ color: "var(--muted)" }}>手术日 </span>
                            {f.txDate ?? "术前"}
                          </div>
                        </div>
                      </div>
                      <div className="aup-doc-foot">
                        <div className="aup-doc-acts">
                          <span className="aup-wb-chip muted">{recordCountBySubject.get(f.subjectId) ?? 0} 条实例</span>
                          {(f.todoCount ?? 0) > 0 && (
                            <span className="aup-wb-chip" style={{ background: "#fdeaea", color: "#dc2626" }}>
                              {f.todoCount} 待办
                            </span>
                          )}
                        </div>
                        <div className="aup-doc-foot-right" style={{ fontSize: 12, color: "var(--primary)", fontWeight: 700 }}>
                          查看详情 →
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <table className="list-table">
              <thead>
                <tr>
                  <th>手术实例</th>
                  <th>类型</th>
                  <th>阶段</th>
                  <th>时点</th>
                  <th>手术日</th>
                  <th>实例数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {folders.map((f) => (
                  <tr key={f.key} className="row">
                    <td>
                      <strong>{f.subjectCode}</strong>
                    </td>
                    <td>{animalTypeLabel(f.subjectType)}</td>
                    <td>{lifecycleStageLabel(f.lifecycleStage)}</td>
                    <td>{f.currentTp ?? "—"}</td>
                    <td>{f.txDate ?? "术前"}</td>
                    <td>{recordCountBySubject.get(f.subjectId) ?? 0}</td>
                    <td>
                      <button type="button" className="btn ghost small" style={{ padding: 0 }} onClick={() => openDetail(f.subjectId)}>
                        详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      }
    />
  );
}
