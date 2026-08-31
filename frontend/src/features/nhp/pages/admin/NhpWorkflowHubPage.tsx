/**
 * NHP CRF 流程前门：配置模板 → 填报入口登记/选对象开填；研究对象与表单实例为运维。
 * 入口：/#/nhp-admin/hub
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { fetchNhpRecords, fetchNhpSubjects } from "../../api/nhpRecord.api";
import { fetchNhpTemplates } from "../../api/nhpTemplate.api";
import { fetchNhpConcepts, seedNhpAll } from "../../api/nhpOps.api";
import { nhpNavState } from "../../utils/nhpAdminNav";
import toast from "react-hot-toast";
import "@/features/aup/aup.css";
import "../../nhp.css";

type Counts = {
  composites: number;
  published: number;
  atoms: number;
  subjects: number;
  drafts: number;
  records: number;
};

export default function NhpWorkflowHubPage() {
  const location = useLocation();
  const goBack = useGoBack("/nhp-admin/template");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [latestDraftId, setLatestDraftId] = useState<number | null>(null);
  const [conceptCount, setConceptCount] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchNhpTemplates("COMPOSITE").catch(() => []),
      fetchNhpTemplates("ATOM").catch(() => []),
      fetchNhpSubjects({ page: 1, size: 1 }).catch(() => ({ items: [], total: 0 })),
      fetchNhpRecords({ status: "DRAFT", page: 1, size: 1 }).catch(() => ({ items: [], total: 0 })),
      fetchNhpRecords({ page: 1, size: 1 }).catch(() => ({ items: [], total: 0 })),
      fetchNhpConcepts().catch(() => []),
    ]).then(([composites, atoms, subjects, drafts, all, concepts]) => {
      if (cancelled) return;
      const published = [...composites, ...atoms].filter((t) => {
        const s = (t.status || "").toUpperCase();
        return t.hasPublished || s === "PUBLISHED" || s === "FROZEN";
      }).length;
      setCounts({
        composites: composites.length,
        published,
        atoms: atoms.length,
        subjects: subjects.total ?? 0,
        drafts: drafts.total ?? 0,
        records: all.total ?? 0,
      });
      const first = drafts.items?.[0]?.record?.id;
      setLatestDraftId(first ?? null);
      setConceptCount(concepts.length);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSeed = async () => {
    setSeeding(true);
    try {
      const r = await seedNhpAll();
      const summary = Object.entries(r)
        .map(([k, v]) => `${k}=${v}`)
        .join(" · ");
      toast.success(summary ? `种子完成：${summary}` : "种子已执行（幂等）");
    } catch (e) {
      toast.error((e as Error).message || "种子失败");
    } finally {
      setSeeding(false);
    }
  };

  const next =
    !counts || counts.published === 0
      ? {
          label: "去发布原子/组合",
          to: "/nhp-admin/template",
          hint: "尚无已发布模板。可发布单个原子为独立表单，或组合后发布；列表头若是草稿但有「已发布」徽标仍可开填。",
        }
      : counts.subjects === 0
        ? { label: "登记研究对象", to: "/nhp/fill", hint: "在填报入口登记供体 / 受体（自定义编号），再选模板开填。研究对象页仅作维护。" }
        : counts.records === 0
          ? { label: "门户选对象开填", to: "/nhp/fill", hint: "填报入口：登记或选择对象 → 新建/续填实例 → 缓冲确认后填写。" }
          : latestDraftId
            ? {
                label: "继续门户填写",
                to: `/nhp/fill/${latestDraftId}`,
                hint: `有 ${counts.drafts} 份草稿；优先从门户续填。管理端也可打开同一实例审阅。`,
              }
            : {
                label: "门户填写入口",
                to: "/nhp/fill",
                hint: "从门户选动物，打开或新建实例。",
              };

  const steps = [
    {
      n: 1,
      title: "准备原子 → 发布（或组合后发布）",
      produce: "产出：已发布原子（独立表单）和/或已发布组合。域码≠填写顺序；不必 D1→D10 整包填完。",
      status:
        counts == null
          ? "…"
          : counts.published > 0
            ? `已发布 ${counts.published} · 原子 ${counts.atoms} · 组合 ${counts.composites}`
            : counts.composites > 0 || counts.atoms > 0
              ? `有原子 ${counts.atoms} / 组合 ${counts.composites}，待发布`
              : "尚未配置原子/组合",
      done: (counts?.published ?? 0) > 0,
      to: "/nhp-admin/template",
      cta: "打开 CRF 模板（原子/组合）",
    },
    {
      n: 2,
      title: "登记 / 选择研究对象",
      produce: "产出：研究用动物（供体 / 受体）+ 自定义编号；登记在填报入口完成",
      status: counts == null ? "…" : counts.subjects > 0 ? `${counts.subjects} 只动物` : "尚无动物",
      done: (counts?.subjects ?? 0) > 0,
      to: "/nhp/fill",
      cta: "填报入口",
      secondaryTo: "/nhp-admin/subjects",
      secondaryCta: "研究对象（维护）",
    },
    {
      n: 3,
      title: "选模板 / 实例并开填",
      produce: "产出：挂在对象上的填写实例（DRAFT）；一线在门户完成，管理端可代填审阅",
      status: counts == null ? "…" : counts.records > 0 ? `${counts.records} 个实例 · 草稿 ${counts.drafts}` : "尚无实例",
      done: (counts?.records ?? 0) > 0,
      to: "/nhp/fill",
      cta: "打开门户填写",
      secondaryTo: "/nhp-admin/records",
      secondaryCta: "表单实例",
    },
    {
      n: 4,
      title: "填写数据",
      produce: "产出：字段值 · 提交完成 · 可选锁定；左侧 TOC = 组合内各原子章节",
      status:
        latestDraftId != null
          ? `最近草稿 #${latestDraftId}`
          : counts == null
            ? "…"
            : counts.records > 0
              ? "从门户进入缓冲页再填写"
              : "需先有实例",
      done: false,
      to: latestDraftId != null ? `/nhp/fill/${latestDraftId}` : "/nhp/fill",
      cta: latestDraftId != null ? "继续最近草稿（门户）" : "从门户进入填写",
      primary: true,
    },
  ] as const;

  return (
    <div className="aup-app aup-app--full">
      <div className="aup-wb-hd" style={{ marginBottom: 20 }}>
        <div>
          <button type="button" className="btn ghost small" onClick={goBack} style={{ marginBottom: 8 }}>
            ← 返回
          </button>
          <h1>NHP 采集流程</h1>
          <div className="sub">
            配置：字段字典 → 原子/组合模板 → 发布。运行：填报入口登记或选择对象 → 开填。
            研究对象页仅维护列表，不承担登记。
          </div>
        </div>
        <div className="aup-wb-actions">
          <Link to={next.to} className="btn primary small" style={{ textDecoration: "none" }} state={nhpNavState(location)}>
            {next.label}
          </Link>
          <Link to="/nhp/fill" className="btn ghost small" style={{ textDecoration: "none" }}>
            门户填写
          </Link>
          <Link to="/nhp-admin/records" className="btn ghost small" style={{ textDecoration: "none" }} state={nhpNavState(location)}>
            表单实例
          </Link>
          <button type="button" className="btn ghost small" disabled={seeding} onClick={() => void onSeed()}>
            {seeding ? "种子中…" : "执行种子"}
          </button>
        </div>
      </div>

      {conceptCount != null && (
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
          概念库已接入：{conceptCount} 个指标（/api/nhp/query/concepts）· 导入批次见 API `/nhp/imports/batches`
        </div>
      )}

      <div
        className="card"
        style={{
          marginBottom: 20,
          background: "var(--primary-weak)",
          borderColor: "transparent",
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 13, lineHeight: 1.65, color: "var(--slate)", maxWidth: 560 }}>
          <b style={{ color: "var(--text)", display: "block", marginBottom: 4 }}>当前建议下一步</b>
          {next.hint}
        </div>
        <Link to={next.to} className="btn primary" style={{ textDecoration: "none" }}>
          {next.label} →
        </Link>
      </div>

      <ol className="nhp-hub-steps">
        {steps.map((s) => (
          <li key={s.n} className={"nhp-hub-step" + (s.done ? " done" : "") + ("primary" in s && s.primary ? " focus" : "")}>
            <div className="nhp-hub-step-n">{s.done ? "✓" : s.n}</div>
            <div className="nhp-hub-step-body">
              <div className="nhp-hub-step-title-row">
                <h2>{s.title}</h2>
                <span className={"nhp-hub-step-status" + (s.done ? " on" : "")}>{s.status}</span>
              </div>
              <p className="nhp-hub-step-produce">{s.produce}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link
                  to={s.to}
                  className={"btn small" + ("primary" in s && s.primary ? " primary" : " ghost")}
                  style={{ textDecoration: "none", alignSelf: "flex-start" }}
                >
                  {s.cta} →
                </Link>
                {"secondaryTo" in s && s.secondaryTo && (
                  <Link to={s.secondaryTo} className="btn ghost small" style={{ textDecoration: "none" }}>
                    {s.secondaryCta} →
                  </Link>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="card" style={{ marginTop: 20, fontSize: 13, color: "var(--slate)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--text)" }}>入口怎么分？</strong>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li>
            <b>实验者</b>：门户 <code>/#/nhp/fill</code> → 登记或选择对象 → 选/建实例 → 缓冲确认 → 填写
          </li>
          <li>
            <b>管理员</b>：侧栏「数据采集」可代登记/开填；「研究对象」维护列表；「表单实例」审阅/删除
          </li>
        </ul>
      </div>
    </div>
  );
}
