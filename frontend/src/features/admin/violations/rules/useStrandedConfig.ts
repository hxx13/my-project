import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { adminHttp } from "@/api/core/adminHttp";
import { isRichTextEmpty } from "@/utils/announcementHtml";

/** 一道（违规公告）行为配置，字段为前端语义名，序列化时转后端 snake_case。后端唯一读写入口 /stranded-config（未废弃）。 */
export type StrandedConfig = {
  autoSignout: boolean;
  violationTextTpl: string;
  forbidEnter: boolean;
  expireDays: number | null;
  whitelistDepts: string[];
  challengeEnabled: boolean;
  challengePhrase: string;
  unlockOnVerify: boolean;
};

export type StrandedSignout2Config = { enabled: boolean; lastResult: string | null };

const DEFAULT_STRANDED_CONFIG: StrandedConfig = {
  autoSignout: true,
  violationTextTpl: "",
  forbidEnter: false,
  expireDays: 1,
  whitelistDepts: [],
  challengeEnabled: false,
  challengePhrase: "一人一卡,严禁尾随",
  unlockOnVerify: true,
};

const DEFAULT_SIGNOUT2_CONFIG: StrandedSignout2Config = { enabled: true, lastResult: null };

/** TINYINT / JSON boolean 统一解析（勿用 `v !== 0`，false 与 "0" 会被误判为开） */
function dbTinyIntOn(value: unknown, defaultOn = false): boolean {
  if (value === null || value === undefined) return defaultOn;
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return defaultOn;
}

/** whitelist_depts：兼容 JSON 字符串与已解析数组。 */
function parseJsonArrayStr(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string" && raw.trim()) {
    try {
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j.filter((x): x is string => typeof x === "string") : [];
    } catch { return []; }
  }
  return [];
}

function toNumberOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function mapConfig(raw: Record<string, unknown>): StrandedConfig {
  const phrase = typeof raw.interactive_challenge_phrase === "string" ? raw.interactive_challenge_phrase : "";
  return {
    autoSignout: dbTinyIntOn(raw.auto_signout_enabled, true),
    violationTextTpl: typeof raw.violation_text_tpl === "string" ? raw.violation_text_tpl : "",
    forbidEnter: dbTinyIntOn(raw.forbid_enter, false),
    expireDays: toNumberOrNull(raw.expire_after_days) ?? 1,
    whitelistDepts: parseJsonArrayStr(raw.whitelist_depts),
    challengeEnabled: dbTinyIntOn(raw.interactive_challenge_enabled, false),
    challengePhrase: phrase.trim() !== "" ? phrase : "一人一卡,严禁尾随",
    unlockOnVerify: dbTinyIntOn(raw.interactive_unlock_on_verify, true),
  };
}

function serializeConfig(c: StrandedConfig): Record<string, unknown> {
  return {
    auto_signout_enabled: c.autoSignout ? 1 : 0,
    violation_text_tpl: isRichTextEmpty(c.violationTextTpl) ? "" : c.violationTextTpl.trim(),
    forbid_enter: c.forbidEnter ? 1 : 0,
    expire_after_days: c.expireDays ?? 1,
    whitelist_depts: JSON.stringify(c.whitelistDepts),
    interactive_challenge_enabled: c.challengeEnabled ? 1 : 0,
    interactive_challenge_phrase: c.challengePhrase,
    interactive_unlock_on_verify: c.unlockOnVerify ? 1 : 0,
  };
}

function mapSignout2(raw: Record<string, unknown>): StrandedSignout2Config {
  const last = raw.last_execution_result;
  return { enabled: dbTinyIntOn(raw.auto_signout_enabled, true), lastResult: typeof last === "string" && last.trim() !== "" ? last : null };
}

export function useStrandedConfig() {
  const [config, setConfigState] = useState<StrandedConfig>(DEFAULT_STRANDED_CONFIG);
  const [signout2, setSignout2State] = useState<StrandedSignout2Config>(DEFAULT_SIGNOUT2_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSignout2, setSavingSignout2] = useState(false);
  const configRef = useRef(config);
  const signout2Ref = useRef(signout2);

  const setConfig = useCallback((patch: Partial<StrandedConfig>) => {
    setConfigState((prev) => { const next = { ...prev, ...patch }; configRef.current = next; return next; });
  }, []);
  const setSignout2 = useCallback((patch: Partial<StrandedSignout2Config>) => {
    setSignout2State((prev) => { const next = { ...prev, ...patch }; signout2Ref.current = next; return next; });
  }, []);

  const applyConfig = useCallback((raw: Record<string, unknown>) => {
    const next = mapConfig(raw);
    setConfigState(next); configRef.current = next;
  }, []);
  const applySignout2 = useCallback((raw: Record<string, unknown>) => {
    const next = mapSignout2(raw);
    setSignout2State(next); signout2Ref.current = next;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        adminHttp.get("/twin/student-violations/stranded-config"),
        adminHttp.get("/twin/student-violations/stranded-signout-config"),
      ]);
      applyConfig((r1.data?.data ?? {}) as Record<string, unknown>);
      applySignout2((r2.data?.data ?? {}) as Record<string, unknown>);
    } catch { /* 加载失败静默保持默认 */ }
    finally { setLoading(false); }
  }, [applyConfig, applySignout2]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await adminHttp.put("/twin/student-violations/stranded-config", serializeConfig(configRef.current));
      applyConfig((res.data?.data ?? {}) as Record<string, unknown>);
      toast.success("自动滞留配置已保存");
    } catch (e) { toast.error(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  }, [applyConfig]);

  const saveSignout2 = useCallback(async () => {
    setSavingSignout2(true);
    try {
      const res = await adminHttp.put("/twin/student-violations/stranded-signout-config", { auto_signout_enabled: signout2Ref.current.enabled ? 1 : 0 });
      applySignout2((res.data?.data ?? {}) as Record<string, unknown>);
      toast.success("第二道滞留签退配置已保存");
    } catch (e) { toast.error(e instanceof Error ? e.message : "保存失败"); }
    finally { setSavingSignout2(false); }
  }, [applySignout2]);

  const runTest = useCallback(async (userId: string, autoSignout: boolean): Promise<Record<string, unknown>> => {
    const res = await adminHttp.post("/twin/student-violations/stranded-config/test", { userId, autoSignout });
    return (res.data?.data ?? {}) as Record<string, unknown>;
  }, []);

  return { config, setConfig, signout2, setSignout2, loading, saving, savingSignout2, save, saveSignout2, runTest };
}
