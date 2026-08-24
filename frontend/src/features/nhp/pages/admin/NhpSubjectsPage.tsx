/**
 * NHP 研究对象记录：以供体/受体为中心的数据中心。
 * 入口：/#/content-manager/nhp-subjects
 * 每只对象一张卡，聚合其身份信息（由 D1/D2 入组表单回填）+ 所属项目 + 表单实例数。
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import {
  deleteNhpSubject,
  fetchNhpProjects,
  fetchNhpRecords,
  fetchNhpSubjects,
  type NhpSubject,
} from "../../api/nhpRecord.api";
import { animalTypeLabel, animalTypeLongLabel } from "../../utils/nhpSubjectLabels";
import { lifecycleStageLabel } from "../../api/nhpSubjectBoard.api";
import { nhpNavState } from "../../utils/nhpAdminNav";
import { appConfirm } from "@/lib/appDialog";
import "@/features/aup/aup.css";
import "../../nhp.css";

type TypeFilter = "ALL" | "DONOR" | "RECIPIENT";

function sexLabel(s?: string): string {
  if (!s) return "—";
  const u = s.toUpperCase();
  if (u === "M" || u === "MALE") return "♂";
  if (u === "F" || u === "FEMALE") return "♀";
  return s;
}

function identitySummary(s: NhpSubject): string {
  const parts: string[] = [];
  if (s.breed) parts.push(s.breed);
  if (s.farmCode) parts.push(`基地 ${s.farmCode}`);
  if (s.species) parts.push(s.species);
  if (s.externalId) parts.push(`原号 ${s.externalId}`);
  if (s.microchipId) parts.push(`芯片 ${s.microchipId}`);
  return parts.length ? parts.join(" · ") : "—";
}

export default function NhpSubjectsPage() {
  const location = useLocation();
  const goBack = useGoBack("/nhp/overview");

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [q, setQ] = useState("");
  const [subjects, setSubjects] = useState<NhpSubject[]>([]);
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof fetchNhpProjects>>>([]);
  const [records, setRecords] = useState<Awaited<ReturnType<typeof fetchNhpRecords>>["items"]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const [ss, ps, rs] = await Promise.all([
        fetchNhpSubjects({ page: 1, size: 500 }),
        fetchNhpProjects(),
        fetchNhpRecords({ page: 1, size: 500 }),
      ]);
      setSubjects(ss.items ?? []);
      setProjects(ps);
      setRecords(rs.items ?? []);
    } catch (e) {
      toast.error((e as Error).message || "加载研究对象失败");
      setSubjects([]);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (s: NhpSubject) => {
    const ok = await appConfirm(`删除研究对象 ${s.subjectCode}？将软删除（有填写实例时级联删除）。`);
    if (!ok) return;
    try {
      await deleteNhpSubject(s.id, true);
      toast.success(`已删除 ${s.subjectCode}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message || "删除失败");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const projectBySubjectId = useMemo(() => {
    const map = new Map<number, { id: number; lifecycleStage?: string | null; txCode?: string | null }>();
    for (const p of projects) {
      const meta = { id: p.id, lifecycleStage: p.lifecycleStage, txCode: p.txCode };
      if (p.donor?.id) map.set(p.donor.id, meta);
      if (p.recipient?.id) map.set(p.recipient.id, meta);
    }
    return map;
  }, [projects]);

  const recordCountBySubject = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of records) {
      const sid = row.record.subjectId;
      map.set(sid, (map.get(sid) ?? 0) + 1);
    }
    return map;
  }, [records]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return subjects.filter((s) => {
      if (typeFilter !== "ALL" && s.subjectType !== typeFilter) return false;
      if (!qq) return true;
      const hay = [s.subjectCode, s.breed, s.farmCode, s.species, s.externalId, s.microchipId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qq);
    });
  }, [subjects, typeFilter, q]);

  return (
    <div className="aup-app aup-app--full">
      <div className="nhp-template-top-panel">
        <button type="button" className="btn ghost small" onClick={goBack}>
          ← 返回
        </button>
        <div className="nhp-template-tabs" role="tablist" aria-label="对象类型">
          {(["ALL", "DONOR", "RECIPIENT"] as TypeFilter[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              className={`nhp-template-tab${typeFilter === t ? " on" : ""}`}
              onClick={() => setTypeFilter(t)}
            >
              {t === "ALL" ? "全部" : animalTypeLabel(t)}
            </button>
          ))}
        </div>
        <span className="aup-wb-count">共 {filtered.length} 个对象</span>
        <div className="nhp-template-toolbar-actions">
          <input
            className="input"
            style={{ width: 200 }}
            placeholder="编号 / 品种 / 基地 / 物种"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" className="btn ghost small" disabled={busy} onClick={() => void load()}>
            刷新
          </button>
          <Link to="/content-manager/nhp-entry" className="btn primary small" style={{ textDecoration: "none" }} state={nhpNavState(location)}>
            登记项目
          </Link>
          <Link to="/content-manager/nhp-records" className="btn ghost small" style={{ textDecoration: "none" }} state={nhpNavState(location)}>
            项目管理
          </Link>
        </div>
      </div>

      {busy && subjects.length === 0 ? (
        <div className="aup-empty">加载中…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>暂无研究对象</div>
          <div style={{ fontSize: 13, color: "var(--muted)", maxWidth: 420, margin: "0 auto 16px", lineHeight: 1.7 }}>
            请在填报入口「登记项目」——一次登记创建供体 + 受体两个对象，再依次填写入组表单。
          </div>
          <Link to="/content-manager/nhp-entry" className="btn primary small" style={{ textDecoration: "none" }}>
            前往登记项目
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {filtered.map((s) => {
            const proj = projectBySubjectId.get(s.id);
            const pending = (s.subjectCode ?? "").startsWith("PEND-");
            return (
              <div className="aup-doc" key={s.id}>
                <div className="aup-doc-hd">
                  <span className="aup-doc-title">{animalTypeLongLabel(s.subjectType)}</span>
                  <span className="aup-doc-no">{sexLabel(s.sex)}</span>
                </div>
                <div className="aup-doc-body">
                  <div className="aup-f">
                    <div className="aup-f-k">编号</div>
                    <div className="aup-f-v" style={{ fontFamily: "ui-monospace, monospace" }}>
                      {pending ? <span style={{ color: "#d97706" }}>{s.subjectCode}（待登记）</span> : s.subjectCode}
                    </div>
                  </div>
                  <div className="aup-f">
                    <div className="aup-f-k">身份信息</div>
                    <div className="aup-f-v" style={{ fontSize: 12 }}>{identitySummary(s)}</div>
                  </div>
                  <div className="aup-f">
                    <div className="aup-f-k">所属项目</div>
                    <div className="aup-f-v">
                      {proj ? (
                        <span>
                          项目 #{proj.id} {proj.txCode ?? ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                  <div className="aup-f">
                    <div className="aup-f-k">阶段</div>
                    <div className="aup-f-v">{lifecycleStageLabel(proj?.lifecycleStage ?? undefined)}</div>
                  </div>
                </div>
                <div className="aup-doc-foot">
                  <div className="aup-doc-acts" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <span className="aup-wb-chip muted">{recordCountBySubject.get(s.id) ?? 0} 条实例</span>
                    <Link
                      to={`/content-manager/nhp-entry?subjectId=${s.id}`}
                      className="btn small primary"
                      style={{ textDecoration: "none" }}
                      state={nhpNavState(location)}
                    >
                      开填
                    </Link>
                    <Link
                      to={`/content-manager/nhp-records/${s.id}`}
                      className="btn ghost small"
                      style={{ textDecoration: "none" }}
                      state={nhpNavState(location)}
                    >
                      看实例
                    </Link>
                    <button
                      type="button"
                      className="btn ghost small"
                      style={{ color: "#b91c1c" }}
                      onClick={() => void onDelete(s)}
                    >
                      删除
                    </button>
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
