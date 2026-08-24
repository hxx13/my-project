import { useEffect, useState } from "react";
import {
  fetchConfigDefinitions,
  fetchSystemConfigs,
  updateSystemConfig,
  type SettingDefinitionRecord,
} from "@/api/domains/notification.api";
import toast from "react-hot-toast";

/**
 * 设置中心面板（schema 驱动，可扩展）。
 *
 * 读取 cage_claim 模块的配置定义（label/valueType/options）与当前值，
 * 按 valueType 通用渲染：BOOLEAN→开关、STRING+options→下拉、NUMBER→数字框。
 * 后续新增开关 = 在 CageClaimConfigSeed 加一条 def，无需改本组件。
 */
export default function CageScanSettingsPanel() {
  const [defs, setDefs] = useState<SettingDefinitionRecord[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [idMap, setIdMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchConfigDefinitions("cage_claim"), fetchSystemConfigs("cage_claim")])
      .then(([d, c]) => {
        if (cancelled) return;
        setDefs(d);
        const vm: Record<string, string> = {};
        const im: Record<string, number> = {};
        for (const r of c) {
          vm[r.configKey] = r.configValue ?? "";
          im[r.configKey] = r.id;
        }
        for (const df of d) {
          if (!(df.configKey in vm)) vm[df.configKey] = df.defaultValue ?? "";
        }
        setValues(vm);
        setIdMap(im);
      })
      .catch(() => toast.error("加载设置失败"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = async (key: string, value: string) => {
    const id = idMap[key];
    if (!id) {
      toast.error("配置项未初始化");
      return;
    }
    setSavingKey(key);
    try {
      await updateSystemConfig(id, { configValue: value });
      setValues((v) => ({ ...v, [key]: value }));
      toast.success("已保存");
    } catch (e: any) {
      toast.error(e?.message || "保存失败");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) return <div className="py-4 text-center text-xs text-[var(--twin-mute)]">加载中…</div>;
  if (defs.length === 0) return <div className="py-4 text-center text-xs text-[var(--twin-mute)]">暂无配置项</div>;

  return (
    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
      {defs.map((df) => {
        const v = values[df.configKey] ?? "";
        const saving = savingKey === df.configKey;
        return (
          <div key={df.configKey} className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[var(--twin-ink)]">{df.labelZh}</div>
                {df.description && <div className="text-[10px] text-[var(--twin-mute)]">{df.description}</div>}
              </div>
              <div className="shrink-0">
                {df.valueType === "BOOLEAN" ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => update(df.configKey, v === "true" ? "false" : "true")}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${v === "true" ? "bg-emerald-500" : "bg-gray-300"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${v === "true" ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                ) : df.options && df.options.length > 0 ? (
                  <select
                    value={v}
                    disabled={saving}
                    onChange={(e) => update(df.configKey, e.target.value)}
                    className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px]"
                  >
                    {df.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    value={v}
                    disabled={saving}
                    onChange={(e) => setValues((x) => ({ ...x, [df.configKey]: e.target.value }))}
                    onBlur={() => update(df.configKey, values[df.configKey] ?? "")}
                    className="w-20 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px]"
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
