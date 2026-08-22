/**
 * NHP 数据采集入口（缓冲前）：选/登记研究对象 → 查看手术进度与可填表单 → 进入填写工作台。
 * 门户 /#/nhp/fill 与管理端 /#/content-manager/nhp-entry（无 id）共用。
 * 深链 ?formKey=&recordId= 由 NhpFillWorkbench 处理；?subjectId= 自动选中对象。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import {
  createNhpSubject,
  fetchNhpRecords,
  fetchNhpSubjects,
  type NhpSubject,
} from "../api/nhpRecord.api";
import { fetchNhpSubjectBoard } from "../api/nhpSubjectBoard.api";
import NhpSurgeryTabs from "./NhpSurgeryTabs";
import NhpSurgeryProgress from "./NhpSurgeryProgress";
import NhpSurgeryFormLauncher from "./NhpSurgeryFormLauncher";
import { useNhpActiveSurgery } from "../hooks/useNhpActiveSurgery";
import { surgeryContextFromCard, surgeryKeyOf } from "../utils/nhpSurgeryContext";
import { animalTypeLabel } from "../utils/nhpSubjectLabels";
import "@/features/aup/aup.css";
import "../nhp.css";

type GateStep = "subject" | "workspace";
type SubjectMode = "choose" | "pick" | "register";

type Props = {
  mode?: "portal" | "adminPreview";
};

export default function NhpFillEntryGate({ mode = "portal" }: Props) {
  const [searchParams] = useSearchParams();
  const preSubjectId = searchParams.get("subjectId");
  const preFormKey = searchParams.get("formKey") || "";
  const isAdmin = mode === "adminPreview";

  const leaveGate = useGoBack(isAdmin ? "/nhp/overview" : "/", { preferHistory: !isAdmin });

  const [step, setStep] = useState<GateStep>("subject");
  const [subjectMode, setSubjectMode] = useState<SubjectMode>("choose");
  const [subjects, setSubjects] = useState<NhpSubject[]>([]);
  const [subjectsTotal, setSubjectsTotal] = useState(0);
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "DONOR" | "RECIPIENT">("ALL");
  const [busy, setBusy] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<NhpSubject | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(Boolean(preFormKey));

  const [regType, setRegType] = useState("RECIPIENT");
  const [regCode, setRegCode] = useState("");
  const [regCenter, setRegCenter] = useState("");
  const [regSex, setRegSex] = useState("");
  const [regExternalId, setRegExternalId] = useState("");
  const [regMicrochip, setRegMicrochip] = useState("");
  const [regSpecies, setRegSpecies] = useState("");
  const [regBreed, setRegBreed] = useState("");
  const [registering, setRegistering] = useState(false);

  const boardQuery = useQuery({ queryKey: ["nhp", "subject-board"], queryFn: () => fetchNhpSubjectBoard() });
  const surgeries = useMemo(() => (boardQuery.data ?? []).map(surgeryContextFromCard), [boardQuery.data]);
  const { active, activeKey, setActiveKey, setActiveBySubjectId } = useNhpActiveSurgery(surgeries);

  const workspaceSubjectId = selectedSubject?.id ?? active?.subjectId;

  const recordsQuery = useQuery({
    queryKey: ["nhp", "fill-records", workspaceSubjectId],
    queryFn: () => fetchNhpRecords({ subjectId: workspaceSubjectId!, page: 1, size: 100 }),
    enabled: step === "workspace" && workspaceSubjectId != null && workspaceSubjectId > 0,
  });

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
    const sid = preSubjectId ? Number(preSubjectId) : 0;
    if (!sid) return;
    if (subjects.length === 0) {
      void loadSubjects();
      return;
    }
    const hit = subjects.find((s) => s.id === sid);
    if (hit) {
      setSelectedSubject(hit);
      setActiveBySubjectId(hit.id);
      setSubjectMode("pick");
      setStep("workspace");
    }
  }, [preSubjectId, subjects, loadSubjects, setActiveBySubjectId]);

  useEffect(() => {
    if (step !== "workspace" || selectedSubject || surgeries.length === 0) return;
    if (active) {
      setSelectedSubject({
        id: active.subjectId,
        studyId: 0,
        subjectType: active.subjectType,
        subjectCode: active.subjectCode,
        status: "ACTIVE",
        species: active.species,
        sex: active.sex,
      });
    }
  }, [step, selectedSubject, surgeries, active]);

  const pickAnimal = (s: NhpSubject) => {
    setSelectedSubject(s);
    setActiveBySubjectId(s.id);
    setStep("workspace");
    setShowAdvanced(Boolean(preFormKey));
  };

  const resetToSubjectChoose = () => {
    setStep("subject");
    setSubjectMode("choose");
    setSelectedSubject(null);
    setShowAdvanced(false);
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
      setSelectedSubject(s);
      setActiveKey(surgeryKeyOf(s.id));
      setStep("workspace");
      setShowAdvanced(true);
      setRegCode("");
      setRegCenter("");
      setRegSex("");
      setRegExternalId("");
      setRegMicrochip("");
      setRegSpecies("");
      setRegBreed("");
      void boardQuery.refetch();
    } catch (e) {
      toast.error((e as Error).message || "登记失败");
    } finally {
      setRegistering(false);
    }
  };

  const workspaceSurgery = useMemo(() => {
    if (!workspaceSubjectId) return null;
    const fromBoard = surgeries.find((s) => s.subjectId === workspaceSubjectId);
    if (fromBoard) return fromBoard;
    if (!selectedSubject) return null;
    return {
      key: surgeryKeyOf(selectedSubject.id),
      subjectId: selectedSubject.id,
      subjectCode: selectedSubject.subjectCode,
      subjectType: selectedSubject.subjectType,
      label: selectedSubject.subjectCode,
      subtitle: animalTypeLabel(selectedSubject.subjectType),
    };
  }, [workspaceSubjectId, surgeries, selectedSubject]);

  const onSurgeryTabSelect = (key: string) => {
    setActiveKey(key);
    const hit = surgeries.find((s) => s.key === key);
    if (hit) {
      setSelectedSubject({
        id: hit.subjectId,
        studyId: 0,
        subjectType: hit.subjectType,
        subjectCode: hit.subjectCode,
        status: "ACTIVE",
        species: hit.species,
        sex: hit.sex,
      });
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

  const onChromeBack = () => {
    if (step === "workspace") {
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
      <div className="aup-landing nhp-fill-gate" style={{ maxWidth: 920, textAlign: "left" }}>
        <button type="button" className="btn ghost small aup-landing-back" onClick={onChromeBack}>
          ← 返回
        </button>
        <h2 style={{ textAlign: "center" }}>NHP 数据采集</h2>
        <div className="aup-landing-desc" style={{ textAlign: "center", marginBottom: 16 }}>
          {step === "subject"
            ? "确定研究对象后，查看手术进度与当前可填表单。"
            : `当前对象：${selectedSubject?.subjectCode ?? workspaceSurgery?.subjectCode ?? "—"}`}
        </div>

        <ol className="nhp-fill-process" aria-label="采集流程">
          <li className={processActive === 1 ? "on" : processActive > 1 ? "done" : ""}>
            <span className="n">1</span>
            <span className="t">选择 / 登记对象</span>
          </li>
          <li className={processActive === 2 ? "on" : ""}>
            <span className="n">2</span>
            <span className="t">进度与可填表单</span>
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
            {surgeries.length > 0 && (
              <button
                type="button"
                className="nhp-fill-gate-choice"
                onClick={() => {
                  if (active) {
                    setSelectedSubject({
                      id: active.subjectId,
                      studyId: 0,
                      subjectType: active.subjectType,
                      subjectCode: active.subjectCode,
                      status: "ACTIVE",
                    });
                  }
                  setStep("workspace");
                }}
              >
                <strong>继续上次手术</strong>
                <span>{active?.label ?? "自动恢复上次选择"}</span>
              </button>
            )}
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
              <input className="input" value={regCode} onChange={(e) => setRegCode(e.target.value)} placeholder="研究对象编号（必填）" />
              <input className="input" value={regCenter} onChange={(e) => setRegCenter(e.target.value)} placeholder="中心码（可选）" />
              <select className="input" value={regSex} onChange={(e) => setRegSex(e.target.value)}>
                <option value="">性别</option>
                <option value="M">M</option>
                <option value="F">F</option>
              </select>
              <input className="input" value={regExternalId} onChange={(e) => setRegExternalId(e.target.value)} placeholder="院内 / 原编号" />
              <input className="input" value={regMicrochip} onChange={(e) => setRegMicrochip(e.target.value)} placeholder="芯片号" />
              {regType === "DONOR" ? (
                <input className="input" value={regBreed} onChange={(e) => setRegBreed(e.target.value)} placeholder="品种 / 品系" />
              ) : (
                <input className="input" value={regSpecies} onChange={(e) => setRegSpecies(e.target.value)} placeholder="物种" />
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
              <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
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
              <div style={{ fontSize: 13, color: "var(--slate)", textAlign: "center", padding: "12px 0" }}>
                暂无匹配对象。
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {subjects.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="btn ghost"
                    style={{ textAlign: "left", padding: "12px 14px", border: "1px solid var(--border)" }}
                    onClick={() => pickAnimal(s)}
                  >
                    <div style={{ fontWeight: 700 }}>{s.subjectCode}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{animalTypeLabel(s.subjectType)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "workspace" && workspaceSurgery && (
          <div>
            <div className="nhp-fill-gate-subject-bar">
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>研究对象</div>
                <div style={{ fontWeight: 700 }}>{workspaceSurgery.subjectCode}</div>
              </div>
              <button type="button" className="btn ghost small" onClick={resetToSubjectChoose}>
                重选对象
              </button>
            </div>

            {surgeries.length > 1 && (
              <NhpSurgeryTabs
                surgeries={surgeries}
                activeKey={activeKey}
                onSelect={onSurgeryTabSelect}
              />
            )}

            <NhpSurgeryProgress surgery={workspaceSurgery} compact={surgeries.length <= 1} />

            <div style={{ marginTop: 16 }}>
              {recordsQuery.isLoading ? (
                <div className="aup-empty">加载可填表单…</div>
              ) : (
                <NhpSurgeryFormLauncher
                  surgery={workspaceSurgery}
                  records={recordsQuery.data?.items ?? []}
                  mode={mode}
                  onCreated={() => void recordsQuery.refetch()}
                />
              )}
            </div>

            <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <button type="button" className="btn ghost small" onClick={() => setShowAdvanced((v) => !v)}>
                {showAdvanced ? "收起高级选项" : "高级：手动选模板建实例"}
              </button>
              {showAdvanced && preFormKey && (
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                  深链模板 <code>{preFormKey}</code> 已在上方可填列表中优先匹配；亦可从列表直接开填。
                </p>
              )}
            </div>
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
