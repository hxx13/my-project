import { useEffect, useState } from "react";
import {
  fetchConfigDefinitions,
  fetchSystemConfigs,
  updateSystemConfig,
} from "@/api/domains/notification.api";
import { fetchIdentityTags, type IdentityTag } from "@/api/domains/personIdentity.api";
import toast from "react-hot-toast";

/**
 * 笼架「模式可见性」+「分笼/转移操作身份」多选 — 每项一行，右侧 checkbox chips 选择身份 code。
 * 配置模块 cage_mode：valueType=STRING，落库为逗号分隔身份 code（view 恒可见不可配）。
 * 分笼/转移额外支持特殊 token OWNER = 该笼位占用者本人。
 */
const MODES: Array<{ key: string; label: string }> = [
  { key: "booking", label: "预约" },
  { key: "allocate", label: "分配" },
  { key: "reserve", label: "预定" },
  { key: "edit", label: "状态" },
  { key: "record", label: "记录" },
  { key: "archive", label: "归档" },
  { key: "confirm", label: "确认" },
  { key: "division", label: "划分" },
];

/** 分笼/转移的额外操作身份（占用者本人恒定可操作，不是可配项） */
const OP_MANAGE_KEY = "cage.op.manage_identities";

export default function CageModeVisibilitySettings() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [idMap, setIdMap] = useState<Record<string, number>>({});
  const [tags, setTags] = useState<IdentityTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchConfigDefinitions("cage_mode"),
      fetchSystemConfigs("cage_mode"),
      fetchIdentityTags(),
    ])
      .then(([defs, configs, tagList]) => {
        if (cancelled) return;
        const vm: Record<string, string> = {};
        const im: Record<string, number> = {};
        for (const r of configs) {
          vm[r.configKey] = r.configValue ?? "";
          im[r.configKey] = r.id;
        }
        for (const df of defs) {
          if (!(df.configKey in vm)) vm[df.configKey] = df.defaultValue ?? "";
        }
        setValues(vm);
        setIdMap(im);
        setTags(tagList);
      })
      .catch(() => toast.error("加载模式可见性配置失败"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleCode = async (key: string, code: string) => {
    const id = idMap[key];
    if (!id) {
      toast.error("配置项未初始化");
      return;
    }
    const selected = new Set((values[key] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    if (selected.has(code)) selected.delete(code);
    else selected.add(code);
    const next = [...selected].join(",");
    setSavingKey(key);
    try {
      await updateSystemConfig(id, { configValue: next });
      setValues((v) => ({ ...v, [key]: next }));
    } catch (e: any) {
      toast.error(e?.message || "保存失败");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) return <div className="py-4 text-center text-xs text-[var(--twin-mute)]">加载中…</div>;

  const renderRow = (key: string, label: string, hint: string | null, chips: Array<{ code: string; label: string }>) => {
    const selected = new Set((values[key] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    const saving = savingKey === key;
    return (
      <div key={key} className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2">
        <div className="mb-1.5 text-xs font-semibold text-[var(--twin-ink)]">{label}</div>
        {hint && <div className="mb-1.5 text-[10px] text-[var(--twin-mute)]">{hint}</div>}
        <div className="flex flex-wrap gap-1.5">
          {chips.map((t) => {
            const on = selected.has(t.code);
            return (
              <button
                key={t.code}
                type="button"
                disabled={saving}
                onClick={() => toggleCode(key, t.code)}
                className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                  on
                    ? "border-transparent bg-[var(--twin-primary)] text-white"
                    : "border-[var(--twin-hairline)] text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const tagChips = tags.map((t) => ({ code: t.code, label: t.label }));

  return (
    <div className="space-y-2">
      <div className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-[10px] leading-relaxed text-[var(--twin-mute)]">
        每个模式选中若干身份后，只有这些身份能看到/进入该模式。不选 = 该模式对所有人不可见（管理员始终可见）。
      </div>
      {renderRow(
        OP_MANAGE_KEY,
        "分笼 / 转移额外操作身份",
        "笼位占用者本人恒定可操作，无需配置；此处配置额外的身份。",
        tagChips,
      )}
      {MODES.map((m) => renderRow(`cage.mode.${m.key}`, m.label, null, tagChips))}
    </div>
  );
}
