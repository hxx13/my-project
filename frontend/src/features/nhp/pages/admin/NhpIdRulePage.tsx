/**
 * NHP 编号规则配置页（左列表右详情，对齐 22 §4 / 24 §3.5）。
 *
 * - crf_id_rule：16 类 ID 的 pattern + derived 标记
 * - pattern 全占位符、derived（ANES/HX/RS）不走取号器、未解析占位符抛异常
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { appConfirm } from "@/lib/appDialog";
import {
  fetchNhpIdRules,
  updateNhpIdRule,
  type NhpIdRule,
} from "../../api/nhpIdRule.api";
import { formatIdRuleTypeInline, idRuleTypeZh } from "../../utils/nhpIdRuleLabels";
import { nextNhpId } from "../../api/nhpOps.api";
import "@/features/aup/aup.css";
import "../../nhp.css";

/** 可插入的占位符（token + 中文注释；点一下插入 pattern 光标处） */
const INSERTABLE_PLACEHOLDERS: { token: string; label: string }[] = [
  { token: "{base}", label: "基地码" },
  { token: "{center}", label: "中心码" },
  { token: "{year}", label: "年份后2位" },
  { token: "{seq:2}", label: "序号2位" },
  { token: "{seq:3}", label: "序号3位" },
  { token: "{seq:4}", label: "序号4位" },
  { token: "{DONOR}", label: "供体号" },
  { token: "{RECIP}", label: "受体号" },
  { token: "{TX}", label: "手术号" },
  { token: "{REG}", label: "方案号" },
  { token: "{TEST_ID}", label: "委托单号" },
  { token: "{TP}", label: "时点码" },
  { token: "{日期}", label: "日期YYMMDD" },
  { token: "{年月}", label: "年月YYMM" },
  { token: "{样本类型}", label: "样本类型" },
  { token: "{实验室}", label: "实验室码" },
  { token: "{项目码}", label: "检测项目码" },
];

/** 16+1 类 ID 规则的种子默认值（对齐后端 NhpSeedService.seedIdRules） */
const ID_RULE_DEFAULTS: Record<string, { pattern: string; derived: boolean }> = {
  DON: { pattern: "DON-{base}{year}-{seq:4}", derived: false },
  RCP: { pattern: "RCP-{center}{year}-{seq:3}", derived: false },
  XM: { pattern: "XM-{DONOR}-{RECIP}-{seq:2}", derived: false },
  TX: { pattern: "TX-{center}{year}-{seq:3}", derived: false },
  FU: { pattern: "FU-{TX}-{TP}-{seq:2}", derived: false },
  AE: { pattern: "AE-{TX}-{日期}-{seq:2}", derived: false },
  REG: { pattern: "REG-{TX}-{seq:2}", derived: false },
  MED: { pattern: "MED-{REG}-{seq:4}", derived: false },
  LVL: { pattern: "LVL-{TX}-{日期}-{seq:2}", derived: false },
  ANES: { pattern: "ANES-{TX}", derived: true },
  PATH: { pattern: "PATH-{TX}-{TP}-{seq:2}", derived: false },
  HX: { pattern: "HX-{TX}", derived: true },
  PERF: { pattern: "PERF-{DON}-{日期}", derived: false },
  SMP: { pattern: "SMP-{TX}-{TP}-{样本类型}-{seq:2}", derived: false },
  TST: { pattern: "TST-{实验室}{年月}-{seq:4}", derived: false },
  RS: { pattern: "RS-{TEST_ID}-{项目码}", derived: true },
  NHP_PROJ: { pattern: "NHP-{year}-{seq:4}", derived: false },
};

/** 详情面板表单行（对齐 NhpCodelistPage 的 row() 内联写法，不用 .aup-row） */
function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <label style={{ fontSize: 13, color: "var(--muted)", width: 76, flexShrink: 0, paddingTop: 8 }}>
        {label}
      </label>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

export default function NhpIdRulePage() {
  const qc = useQueryClient();
  const goBack = useGoBack("/nhp-admin/template");

  const rulesQuery = useQuery({ queryKey: ["nhp", "idrules"], queryFn: fetchNhpIdRules });
  const rules = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(() => rules.find((r) => r.id === selectedId) ?? null, [rules, selectedId]);

  // 列表加载后默认选中第一条
  useEffect(() => {
    if (rules.length && (selectedId == null || !rules.some((r) => r.id === selectedId))) {
      setSelectedId(rules[0].id);
    }
  }, [rules, selectedId]);

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<NhpIdRule> }) => updateNhpIdRule(id, patch),
    onSuccess: () => {
      toast.success("已保存");
      void qc.invalidateQueries({ queryKey: ["nhp", "idrules"] });
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  // pattern / derived 草稿（提升到父级；不再失焦即存，改显式「保存」）
  const [patternDraft, setPatternDraft] = useState("");
  const [derivedDraft, setDerivedDraft] = useState(false);
  const patternInputRef = useRef<HTMLInputElement>(null);
  const [trialCode, setTrialCode] = useState<string | null>(null);

  useEffect(() => {
    setPatternDraft(selected?.pattern ?? "");
    setDerivedDraft(selected?.derived ?? false);
    setTrialCode(null);
  }, [selected?.id]);

  const dirty =
    selected != null && (patternDraft.trim() !== (selected.pattern ?? "") || derivedDraft !== selected.derived);

  const handleSave = () => {
    if (!selected || !dirty) return;
    updateMut.mutate({ id: selected.id, patch: { pattern: patternDraft.trim(), derived: derivedDraft } });
  };

  const handleResetDefault = async () => {
    if (!selected) return;
    const def = ID_RULE_DEFAULTS[selected.idType];
    if (!def) {
      toast.error("该规则无默认值");
      return;
    }
    if (await appConfirm(`恢复「${idRuleTypeZh(selected.idType)}」为默认规则？当前修改将丢失。`, { danger: true })) {
      updateMut.mutate({ id: selected.id, patch: { pattern: def.pattern, derived: def.derived } });
    }
  };

  const insertPlaceholder = (token: string) => {
    const el = patternInputRef.current;
    const pos = el?.selectionStart ?? patternDraft.length;
    const next = patternDraft.slice(0, pos) + token + patternDraft.slice(pos);
    setPatternDraft(next);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        const np = pos + token.length;
        el.setSelectionRange(np, np);
      }
    });
  };

  const trialNextMut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("未选中规则");
      const year = String(new Date().getFullYear()).slice(-2);
      return nextNhpId({
        idType: selected.idType,
        base: "FARM",
        center: "SJ",
        year,
        date: new Date().toISOString().slice(0, 10).replace(/-/g, "").slice(2),
      });
    },
    onSuccess: (r) => setTrialCode(r.code),
    onError: (e: Error) => {
      toast.error(e.message || "取号失败");
      setTrialCode(null);
    },
  });

  return (
    <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={goBack}>
              ← 返回
            </button>
            <h1>编号规则</h1>
            <div className="sub">16 类 ID · pattern 全占位符 + derived 标记（ANES/HX/RS 不走取号器）</div>
          </div>
        </div>

        <div className="aup-wb-split">
          <aside className="aup-wb-aside">
            {rulesQuery.isLoading && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>加载规则…</div>
            )}
            {rulesQuery.isError && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>加载失败，请刷新重试</div>
            )}
            {!rulesQuery.isLoading && !rulesQuery.isError && rules.length === 0 && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>暂无编号规则</div>
            )}
            {rules.map((r) => (
              <div
                key={r.id}
                className={`aup-wb-row${selectedId === r.id ? " on" : ""}`}
                style={{ paddingLeft: 14 }}
                onClick={() => setSelectedId(r.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="lbl">{idRuleTypeZh(r.idType)}</div>
                  <div
                    className="meta"
                    style={{ marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    <span style={{ fontFamily: "ui-monospace, monospace" }}>{r.idType}</span>
                    <span style={{ margin: "0 4px", color: "var(--muted)" }}>·</span>
                    <span style={{ fontFamily: "ui-monospace, monospace" }}>{r.pattern}</span>
                  </div>
                </div>
                <span className={r.derived ? "aup-wb-chip" : "aup-wb-chip muted"}>
                  {r.derived ? "derived" : "取号器"}
                </span>
              </div>
            ))}
          </aside>

          <div className="aup-wb-main">
            {!selected ? (
              <div className="aup-wb-empty">选左侧规则查看与编辑</div>
            ) : (
              <div className="aup-wb-panel">
                <div className="aup-wb-panel-hd">
                  <span className="title">{formatIdRuleTypeInline(selected.idType)}</span>
                  <span className={selected.derived ? "aup-wb-chip" : "aup-wb-chip muted"}>
                    {selected.derived ? "derived · 派生键不走取号器" : "取号器"}
                  </span>
                  {dirty && <span className="aup-wb-chip warn">未保存</span>}
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    {!selected.derived && (
                      <>
                        <button
                          type="button"
                          className="btn ghost small"
                          disabled={trialNextMut.isPending}
                          onClick={() => trialNextMut.mutate()}
                        >
                          试取号
                        </button>
                        {trialCode && (
                          <code
                            style={{
                              fontSize: 12,
                              fontFamily: "ui-monospace, monospace",
                              color: "var(--success)",
                              background: "var(--success-weak)",
                              padding: "2px 8px",
                              borderRadius: 4,
                            }}
                          >
                            {trialCode}
                          </code>
                        )}
                      </>
                    )}
                    <button type="button" className="btn ghost small" onClick={() => void handleResetDefault()}>
                      重置默认
                    </button>
                    <button
                      type="button"
                      className="btn primary small"
                      disabled={!dirty || updateMut.isPending}
                      onClick={handleSave}
                    >
                      {updateMut.isPending ? "保存中…" : "保存"}
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <FormRow label="pattern">
                    <input
                      ref={patternInputRef}
                      className="input"
                      style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
                      value={patternDraft}
                      onChange={(e) => setPatternDraft(e.target.value)}
                    />
                  </FormRow>

                  <FormRow label="derived">
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, paddingTop: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={derivedDraft}
                        onChange={(e) => setDerivedDraft(e.target.checked)}
                      />
                      派生键（不走取号器）
                    </label>
                  </FormRow>

                  <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                    未解析的占位符将<strong style={{ color: "var(--text)" }}>抛异常</strong>，不再静默返回字面量（22 §4.2）。
                  </div>

                  <div style={{ height: 1, background: "var(--border)", margin: "12px 0" }} />
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>占位符全集</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {INSERTABLE_PLACEHOLDERS.map((p) => (
                      <button
                        key={p.token}
                        type="button"
                        onClick={() => insertPlaceholder(p.token)}
                        title={`插入 ${p.token}`}
                        style={{
                          fontSize: 11,
                          background: "var(--primary-weak)",
                          color: "var(--primary)",
                          padding: "2px 8px",
                          borderRadius: 4,
                          border: "1px solid transparent",
                          cursor: "pointer",
                          fontFamily: "ui-monospace, monospace",
                        }}
                      >
                        {p.token}
                        <span style={{ color: "var(--muted)", marginLeft: 4 }}>{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
