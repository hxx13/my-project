/**
 * NHP 项目管理（表单实例外壳）：以「项目」（crf_transplant，供体+受体对）为顶层文件夹。
 * 入口：/#/nhp-admin/records
 * 一个项目 = 供体 + 受体两个对象 + 它们的表单实例；点开查看进度与历史表单。
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import ContentManagerWorkbenchLayout from "@/layouts/ContentManagerWorkbenchLayout";
import {
  createNhpRecord,
  deleteNhpProject,
  fetchNhpProjects,
  fetchNhpRecords,
  fetchNhpSubjects,
  type NhpProject,
  type NhpSubject,
} from "../../api/nhpRecord.api";
import { lifecycleStageLabel } from "../../api/nhpSubjectBoard.api";
import { fetchNhpTemplates, fillableFormId, isFillablePublished, type NhpTemplateListItem } from "../../api/nhpTemplate.api";
import { animalTypeLabel } from "../../utils/nhpSubjectLabels";
import { nhpNavState } from "../../utils/nhpAdminNav";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appConfirm } from "@/lib/appDialog";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import "@/features/aup/aup.css";
import "../../nhp.css";

type ViewMode = "card" | "list";

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

  const projectsQuery = useQuery({ queryKey: ["nhp", "projects"], queryFn: () => fetchNhpProjects() });
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

  const records = recordsQuery.data?.items ?? [];
  const memberIdsOf = (p: NhpProject): Set<number> => {
    const s = new Set<number>();
    if (p.donor?.id) s.add(p.donor.id);
    if (p.recipient?.id) s.add(p.recipient.id);
    return s;
  };
  const recordCountByProject = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of records) {
      const sid = row.record.subjectId;
      for (const p of projectsQuery.data ?? []) {
        if (memberIdsOf(p).has(sid)) {
          map.set(p.id, (map.get(p.id) ?? 0) + 1);
          break;
        }
      }
    }
    return map;
  }, [records, projectsQuery.data]);

  const projects = useMemo(() => {
    const list = projectsQuery.data ?? [];
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((p) => {
      const hay = [p.donor?.subjectCode, p.recipient?.subjectCode, p.txCode ?? "", p.donor?.breed, p.recipient?.species]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qq);
    });
  }, [projectsQuery.data, q]);

  const openSubjectRecords = (subjectId: number) => {
    navigate(`/nhp-admin/records/${subjectId}`, { state: nhpNavState(location) });
  };

  const openProject = (projectId: number) => {
    navigate(`/nhp-admin/records/project/${projectId}`, { state: nhpNavState(location) });
  };

  const deleteProjectMut = useMutation({
    mutationFn: (id: number) => deleteNhpProject(id),
    onSuccess: () => {
      toast.success("已删除项目");
      void queryClient.invalidateQueries({ queryKey: ["nhp", "projects"] });
      void queryClient.invalidateQueries({ queryKey: ["nhp", "records"] });
    },
    onError: (e: Error) => toast.error(e.message || "删除失败", { duration: 6000 }),
  });

  const onDeleteProject = async (p: NhpProject) => {
    if (!(await appConfirm(`确定删除项目「${p.projectName || p.txCode || `#${p.id}`}」？`))) return;
    deleteProjectMut.mutate(p.id);
  };

  const onCreateRecord = async () => {
    const sid = Number(pickSubjectId);
    const tpl = templates.find((t) => t.formKey === pickFormKey);
    const formId = tpl ? fillableFormId(tpl) : undefined;
    if (!sid || !tpl || formId == null) {
      toast.error("请选择动物与已发布模板");
      return;
    }
    setCreating(true);
    try {
      const r = await createNhpRecord(sid, formId);
      await queryClient.invalidateQueries({ queryKey: ["nhp", "records-all"] });
      toast.success(`已创建「${tpl.title || tpl.formKey}」实例`);
      navigate(`/nhp-admin/entry/${r.id}`, { state: nhpNavState(location) });
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
      searchPlaceholder="项目 / 供体 / 受体 / 品种 / 物种"
      searchValue={q}
      onSearchChange={setQ}
      toolbarExtra={toolbarExtra}
      countText={`${projects.length} 个项目`}
      split={false}
      main={
        <>
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

          {projectsQuery.isPending || recordsQuery.isPending ? (
            <div className="aup-wb-empty">加载项目…</div>
          ) : projects.length === 0 ? (
            <div className="aup-wb-empty">
              暂无项目。
              <Link to="/nhp-admin/entry" style={{ marginLeft: 8, color: "var(--primary)" }}>
                前往填报入口登记项目
              </Link>
            </div>
          ) : view === "card" ? (
            <div className="nhp-record-folder-grid">
              {projects.map((p) => (
                <div key={p.id} className="aup-doc-stack" style={{ cursor: "default" }}>
                  <div className="aup-doc">
                    <div className="aup-doc-hd">
                      <span className="aup-doc-title">{p.projectName || `项目 #${p.id}`}</span>
                      <span className="aup-doc-no">{p.txCode ?? "待取号"}</span>
                    </div>
                    <div className="aup-doc-body">
                      <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                        <div>
                          <span style={{ color: "var(--muted)" }}>阶段 </span>
                          {lifecycleStageLabel(p.lifecycleStage ?? undefined)}
                        </div>
                        <div>
                          <span style={{ color: "var(--muted)" }}>供体 </span>
                          {p.donor ? p.donor.subjectCode : "—"}
                        </div>
                        <div>
                          <span style={{ color: "var(--muted)" }}>受体 </span>
                          {p.recipient ? p.recipient.subjectCode : "—"}
                        </div>
                        <div>
                          <span style={{ color: "var(--muted)" }}>手术日 </span>
                          {p.txDate ?? "术前"}
                        </div>
                        <div>
                          <span style={{ color: "var(--muted)" }}>创建人 </span>
                          {p.createdBy ?? "—"}
                        </div>
                        <div>
                          <span style={{ color: "var(--muted)" }}>创建时间 </span>
                          {p.createdAt ? formatDateTimeAsiaShanghaiShort(p.createdAt) : "—"}
                        </div>
                      </div>
                    </div>
                    <div className="aup-doc-foot">
                      <div className="aup-doc-acts">
                        <span className="aup-wb-chip muted">{recordCountByProject.get(p.id) ?? 0} 条实例</span>
                      </div>
                      <div className="aup-doc-acts" style={{ gap: 6 }}>
                        <button type="button" className="btn primary small" onClick={() => openProject(p.id)}>
                          项目详情
                        </button>
                        {p.donor && (
                          <button type="button" className="btn ghost small" onClick={() => openSubjectRecords(p.donor!.id)}>
                            供体实例
                          </button>
                        )}
                        {p.recipient && (
                          <button type="button" className="btn ghost small" onClick={() => openSubjectRecords(p.recipient!.id)}>
                            受体实例
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn ghost small"
                          style={{ color: "#dc2626" }}
                          onClick={() => onDeleteProject(p)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <table className="list-table">
              <thead>
                <tr>
                  <th>项目</th>
                  <th>阶段</th>
                  <th>供体</th>
                  <th>受体</th>
                  <th>手术日</th>
                  <th>创建人</th>
                  <th>创建时间</th>
                  <th>实例数</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="row">
                    <td>
                      <strong>#{p.id}</strong> {p.txCode ?? "待取号"}
                    </td>
                    <td>{lifecycleStageLabel(p.lifecycleStage ?? undefined)}</td>
                    <td>{p.donor?.subjectCode ?? "—"}</td>
                    <td>{p.recipient?.subjectCode ?? "—"}</td>
                    <td>{p.txDate ?? "术前"}</td>
                    <td>{p.createdBy ?? "—"}</td>
                    <td>{p.createdAt ? formatDateTimeAsiaShanghaiShort(p.createdAt) : "—"}</td>
                    <td>{recordCountByProject.get(p.id) ?? 0}</td>
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
