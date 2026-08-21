/**
 * NHP 数据采集入口（缓冲前）：选/登记研究对象 → 选模板或续填实例 → 进入实例缓冲页。
 * 门户 /#/nhp/fill 与管理端 /#/content-manager/nhp-entry（无 id）共用。
 * 门户不链到 content-manager；登记在此完成，不在动物管理页。
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import {
  createNhpRecord,
  createNhpSubject,
  fetchNhpRecords,
  fetchNhpSubjects,
  type NhpRecordListItem,
  type NhpSubject,
} from "../api/nhpRecord.api";
import { fetchNhpTemplates, fillableFormId, isFillablePublished, type NhpTemplateListItem } from "../api/nhpTemplate.api";
import { animalTypeLabel } from "../utils/nhpSubjectLabels";
import "@/features/aup/aup.css";
import "../nhp.css";

function isUsableFillTemplate(t: NhpTemplateListItem): boolean {
  return isFillablePublished(t);
}

function templateOptionLabel(t: NhpTemplateListItem): string {
  const kind = (t.kind || "").toUpperCase() === "ATOM" ? "原子" : "组合";
  const ver = t.publishedVersion ?? t.version ?? 1;
  const draftNote =
    t.hasPublished && (t.status || "").toUpperCase() !== "PUBLISHED" && (t.status || "").toUpperCase() !== "FROZEN"
      ? "（头为草稿·开填用已发布版）"
      : "";
  return `${t.title || t.formKey} · ${kind} · v${ver}${draftNote}`;
}

function statusLabel(status?: string | null): string {
  const s = (status || "").toUpperCase();
  if (s === "LOCKED") return "已锁定";
  if (s === "COMPLETE") return "已完成";
  if (s === "DRAFT") return "草稿";
  return status || "—";
}

type GateStep = "subject" | "instance";
type SubjectMode = "choose" | "pick" | "register";

type Props = {
  mode?: "portal" | "adminPreview";
};

export default function NhpFillEntryGate({ mode = "portal" }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSubjectId = searchParams.get("subjectId");
  const preFormKey = searchParams.get("formKey") || "";
  const isAdmin = mode === "adminPreview";

  const fillPath = (id: number) =>
    isAdmin ? `/content-manager/nhp-entry/${id}` : `/nhp/fill/${id}`;
  /** 门户优先 history；管理端 nhp-entry 走 returnTo/壳内回退，勿硬编码 `/` */
  const leaveGate = useGoBack(isAdmin ? "/content-manager/nhp-hub" : "/", {
    preferHistory: !isAdmin,
  });

  const [step, setStep] = useState<GateStep>("subject");
  const [subjectMode, setSubjectMode] = useState<SubjectMode>("choose");
  const [subjects, setSubjects] = useState<NhpSubject[]>([]);
  const [subjectsTotal, setSubjectsTotal] = useState(0);
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "DONOR" | "RECIPIENT">("ALL");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<NhpSubject | null>(null);
  const [records, setRecords] = useState<NhpRecordListItem[]>([]);
  const [templates, setTemplates] = useState<NhpTemplateListItem[]>([]);
  const [pickFormKey, setPickFormKey] = useState(preFormKey);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(Boolean(preFormKey));

  const [regType, setRegType] = useState("RECIPIENT");
  const [regCode, setRegCode] = useState("");
  const [regCenter, setRegCenter] = useState("");
  const [regSex, setRegSex] = useState("");
  const [regExternalId, setRegExternalId] = useState("");
  const [regMicrochip, setRegMicrochip] = useState("");
  const [regSpecies, setRegSpecies] = useState("");
  const [regBreed, setRegBreed] = useState("");
  const [registering, setRegistering] = useState(false);

  const loadSubjects = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetchNhpSubjects({
        subjectType: typeFilter === "ALL" ? undefined : typeFilter,
        q: qApplied || undefined,
        page: 1,
        size: 50,
      });
      setSubjects(res.items ?? []);
      setSubjectsTotal(res.total ?? 0);
    } catch (e) {
      toast.error((e as Error).message || "加载研究对象失败");
      setSubjects([]);
      setSubjectsTotal(0);
    } finally {
      setBusy(false);
    }
  }, [typeFilter, qApplied]);

  useEffect(() => {
    if (subjectMode === "pick" || preSubjectId) void loadSubjects();
  }, [loadSubjects, subjectMode, preSubjectId]);

  useEffect(() => {
    void Promise.all([
      fetchNhpTemplates("COMPOSITE").catch(() => [] as NhpTemplateListItem[]),
      fetchNhpTemplates("ATOM").catch(() => [] as NhpTemplateListItem[]),
    ])
      .then(([composites, atoms]) => {
        const usable = [...composites, ...atoms]
          .filter(isUsableFillTemplate)
          .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
        setTemplates(usable);
        setPickFormKey((prev) => {
          if (prev && usable.some((t) => t.formKey === prev)) return prev;
          if (preFormKey && usable.some((t) => t.formKey === preFormKey)) return preFormKey;
          return usable[0]?.formKey ?? "";
        });
      })
      .catch((e: Error) => toast.error(e.message || "加载模板失败"));
  }, [preFormKey]);

  useEffect(() => {
    const sid = preSubjectId ? Number(preSubjectId) : 0;
    if (!sid) return;
    if (subjects.length === 0) {
      void loadSubjects();
      return;
    }
    const hit = subjects.find((s) => s.id === sid);
    if (hit) {
      setSelected(hit);
      setSubjectMode("pick");
      setStep("instance");
    }
  }, [preSubjectId, subjects, loadSubjects]);

  useEffect(() => {
    if (!selected) {
      setRecords([]);
      return;
    }
    void fetchNhpRecords({ subjectId: selected.id, page: 1, size: 50 })
      .then((res) => setRecords(res.items ?? []))
      .catch((e: Error) => {
        toast.error(e.message || "加载实例失败");
        setRecords([]);
      });
  }, [selected]);

  const pickAnimal = (s: NhpSubject) => {
    setSelected(s);
    setStep("instance");
    setShowCreate(Boolean(preFormKey) || false);
  };

  const resetToSubjectChoose = () => {
    setStep("subject");
    setSubjectMode("choose");
    setSelected(null);
    setShowCreate(false);
  };

  const onRegister = async () => {
    const code = regCode.trim();
    if (!code) {
      toast.error("请填写研究对象编号");
      return;
    }
    setRegistering(true);
    try {
      const s = await createNhpSubject({
        subjectType: regType,
        subjectCode: code,
        centerCode: regCenter.trim() || undefined,
        sex: regSex || undefined,
        externalId: regExternalId.trim() || undefined,
        microchipId: regMicrochip.trim() || undefined,
        species: regType === "RECIPIENT" ? regSpecies.trim() || undefined : undefined,
        breed: regType === "DONOR" ? regBreed.trim() || undefined : undefined,
      });
      toast.success(`已登记 ${s.subjectCode}`);
      setSelected(s);
      setStep("instance");
      setShowCreate(true);
      setRegCode("");
      setRegCenter("");
      setRegSex("");
      setRegExternalId("");
      setRegMicrochip("");
      setRegSpecies("");
      setRegBreed("");
    } catch (e) {
      toast.error((e as Error).message || "登记失败");
    } finally {
      setRegistering(false);
    }
  };

  const onCreateInstance = async () => {
    if (!selected) return;
    const tpl = templates.find((t) => t.formKey === pickFormKey);
    const formId = tpl ? fillableFormId(tpl) : undefined;
    if (!tpl || formId == null) {
      toast.error("请选择已发布的原子或组合模板");
      return;
    }
    setCreating(true);
    try {
      const r = await createNhpRecord(selected.id, formId);
      toast.success(`已创建填写实例 #${r.id}`);
      navigate(fillPath(r.id));
    } catch (e) {
      toast.error((e as Error).message || "创建实例失败");
    } finally {
      setCreating(false);
    }
  };

  const segBtn = (on: boolean) => ({
    padding: "6px 12px",
    fontSize: 12,
    border: "none" as const,
    cursor: "pointer" as const,
    background: on ? "var(--primary-weak)" : "transparent",
    color: on ? "var(--primary)" : "var(--slate)",
    fontWeight: on ? 600 : 500,
  });

  const processActive = step === "subject" ? 1 : 2;

  /** 多步门：先退步，仅在第 1 步（选入口）时离页 */
  const onChromeBack = () => {
    if (step === "instance") {
      resetToSubjectChoose();
      return;
    }
    if (subjectMode === "pick" || subjectMode === "register") {
      setSubjectMode("choose");
      return;
    }
    leaveGate();
  };

  return (
    <div className="aup-landing-wrap">
      <div className="aup-landing nhp-fill-gate">
      <button type="button" className="btn ghost small aup-landing-back" onClick={onChromeBack}>
        ← 返回
      </button>
      <h2>NHP 数据采集</h2>
      <div className="aup-landing-desc" style={{ textAlign: "center", marginBottom: 16 }}>
        {step === "subject"
          ? "确定研究对象后，再选择填写实例。"
          : `当前对象：${selected?.subjectCode ?? "—"}（${animalTypeLabel(selected?.subjectType)}）`}
      </div>

      <ol className="nhp-fill-process" aria-label="采集流程">
        <li className={processActive === 1 ? "on" : processActive > 1 ? "done" : ""}>
          <span className="n">1</span>
          <span className="t">选择 / 登记对象</span>
        </li>
        <li className={processActive === 2 ? "on" : ""}>
          <span className="n">2</span>
          <span className="t">选择模板 / 实例</span>
        </li>
        <li>
          <span className="n">3</span>
          <span className="t">开始填写</span>
        </li>
      </ol>

      {step === "subject" && subjectMode === "choose" && (
        <div className="nhp-fill-gate-choices">
          <button type="button" className="nhp-fill-gate-choice" onClick={() => setSubjectMode("register")}>
            <strong>登记新研究对象</strong>
            <span>供体或受体 · 自定义编号</span>
          </button>
          <button
            type="button"
            className="nhp-fill-gate-choice"
            onClick={() => {
              setSubjectMode("pick");
              void loadSubjects();
            }}
          >
            <strong>选择已有对象</strong>
            <span>检索并继续采集</span>
          </button>
        </div>
      )}

      {step === "subject" && subjectMode === "register" && (
        <div className="nhp-fill-gate-panel">
          <div className="nhp-fill-gate-panel-hd">
            <span>登记新研究对象</span>
            <button type="button" className="btn ghost small" onClick={() => setSubjectMode("choose")}>
              返回
            </button>
          </div>
          <div className="nhp-fill-gate-form">
            <select className="input" value={regType} onChange={(e) => setRegType(e.target.value)}>
              <option value="RECIPIENT">受体动物</option>
              <option value="DONOR">供体动物</option>
            </select>
            <input
              className="input"
              value={regCode}
              onChange={(e) => setRegCode(e.target.value)}
              placeholder="研究对象编号（必填）"
            />
            <input
              className="input"
              value={regCenter}
              onChange={(e) => setRegCenter(e.target.value)}
              placeholder="中心码（可选）"
            />
            <select className="input" value={regSex} onChange={(e) => setRegSex(e.target.value)}>
              <option value="">性别</option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
            <input
              className="input"
              value={regExternalId}
              onChange={(e) => setRegExternalId(e.target.value)}
              placeholder="院内 / 原编号"
            />
            <input
              className="input"
              value={regMicrochip}
              onChange={(e) => setRegMicrochip(e.target.value)}
              placeholder="芯片号"
            />
            {regType === "DONOR" ? (
              <input
                className="input"
                value={regBreed}
                onChange={(e) => setRegBreed(e.target.value)}
                placeholder="品种 / 品系"
              />
            ) : (
              <input
                className="input"
                value={regSpecies}
                onChange={(e) => setRegSpecies(e.target.value)}
                placeholder="物种"
              />
            )}
          </div>
          <button
            type="button"
            className="btn primary"
            style={{ width: "100%", marginTop: 12 }}
            disabled={registering || !regCode.trim()}
            onClick={() => void onRegister()}
          >
            {registering ? "登记中…" : "登记并继续"}
          </button>
        </div>
      )}

      {step === "subject" && subjectMode === "pick" && (
        <div className="nhp-fill-gate-panel">
          <div className="nhp-fill-gate-panel-hd">
            <span>选择已有对象</span>
            <button type="button" className="btn ghost small" onClick={() => setSubjectMode("choose")}>
              返回
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <div
              style={{
                display: "inline-flex",
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              {(["ALL", "DONOR", "RECIPIENT"] as const).map((t) => (
                <button key={t} type="button" style={segBtn(typeFilter === t)} onClick={() => setTypeFilter(t)}>
                  {t === "ALL" ? "全部" : t === "DONOR" ? "供体" : "受体"}
                </button>
              ))}
            </div>
            <input
              className="input"
              style={{ width: 200 }}
              placeholder="编号 / 原号 / 芯片"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setQApplied(q.trim())}
            />
            <button type="button" className="btn ghost small" disabled={busy} onClick={() => setQApplied(q.trim())}>
              搜索
            </button>
          </div>

          {busy && subjects.length === 0 ? (
            <div className="aup-empty">加载中…</div>
          ) : subjects.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--slate)", lineHeight: 1.7, textAlign: "center", padding: "12px 0" }}>
              暂无匹配对象。可返回登记新研究对象。
              <div style={{ marginTop: 12 }}>
                <button type="button" className="btn primary small" onClick={() => setSubjectMode("register")}>
                  登记新研究对象
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>共 {subjectsTotal} 条</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {subjects.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="btn ghost"
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      lineHeight: 1.45,
                      border: "1px solid var(--border)",
                    }}
                    onClick={() => pickAnimal(s)}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {s.subjectCode}
                      <span style={{ marginLeft: 8, fontWeight: 500, fontSize: 12, color: "var(--slate)" }}>
                        {animalTypeLabel(s.subjectType)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                      {[s.externalId && `原号 ${s.externalId}`, s.microchipId && `芯片 ${s.microchipId}`, s.species, s.breed]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {step === "instance" && selected && (
        <div style={{ textAlign: "left" }}>
          <div className="nhp-fill-gate-subject-bar">
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>研究对象</div>
              <div style={{ fontWeight: 700 }}>
                {selected.subjectCode}
                <span style={{ marginLeft: 8, fontWeight: 500, fontSize: 12 }}>
                  {animalTypeLabel(selected.subjectType)}
                </span>
              </div>
            </div>
            <button type="button" className="btn ghost small" onClick={resetToSubjectChoose}>
              重选对象
            </button>
          </div>

          {records.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>已有填写实例</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {records.map((row) => {
                  const r = row.record;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className="btn ghost"
                      style={{
                        textAlign: "left",
                        padding: "12px 14px",
                        border: "1px solid var(--border)",
                        lineHeight: 1.45,
                      }}
                      onClick={() => navigate(fillPath(r.id))}
                    >
                      <div style={{ fontWeight: 700 }}>
                        {row.formName || row.formCode || `模板 #${r.formId}`}
                        <span style={{ marginLeft: 8, fontWeight: 500, fontSize: 12, color: "var(--slate)" }}>
                          {statusLabel(r.status)}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>实例 #{r.id}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {!showCreate ? (
            <button type="button" className="btn primary" style={{ width: "100%" }} onClick={() => setShowCreate(true)}>
              {records.length > 0 ? "新建填写实例" : "选择模板并新建实例"}
            </button>
          ) : (
            <div className="nhp-fill-gate-panel" style={{ marginTop: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>新建填写实例</div>
              <select
                className="input"
                style={{ width: "100%", marginBottom: 10 }}
                value={pickFormKey}
                onChange={(e) => setPickFormKey(e.target.value)}
              >
                {templates.length === 0 && <option value="">暂无已发布原子/组合模板</option>}
                {templates.map((t) => (
                  <option key={`${t.kind}-${t.formKey}`} value={t.formKey}>
                    {templateOptionLabel(t)}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn primary"
                  disabled={creating || !pickFormKey}
                  onClick={() => void onCreateInstance()}
                >
                  {creating ? "创建中…" : "创建并进入缓冲页"}
                </button>
                <button type="button" className="btn ghost" onClick={() => setShowCreate(false)}>
                  取消
                </button>
              </div>
              {templates.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0", lineHeight: 1.6 }}>
                  尚无已发布模板。可发布单个原子为独立表单，或组合后发布；若列表头是草稿但已有发布版，刷新后应可见。
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div style={{ marginTop: 20, fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
          <Link to="/content-manager/nhp-subjects" className="nhp-admin-preview-link">
            动物管理
          </Link>
          {" · "}
          <Link to="/content-manager/nhp-records" className="nhp-admin-preview-link">
            实例管理
          </Link>
        </div>
      )}
      </div>
    </div>
  );
}
