import type { SettingDefinitionRecord, SystemConfigRecord } from "@/api/domains/notification.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { adminHintClass, adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import { labelConfigOption } from "@/features/admin/settings/settingsLabels";
import { cn } from "@/lib/utils";

const MULTILINE_KEYS = new Set([
  "dashboard.codex.notice_body",
  "dashboard.codex.return_rules",
  "dashboard.codex.discipline_body",
  "telemetry.facility.rules_json",
  "scanner.access.enter.own_text",
  "scanner.access.enter.borrowed_text",
  "scanner.access.exit.own_text",
  "scanner.access.exit.borrowed_text",
]);

const COLOR_KEY_HINT = "color";

const COLOR_PALETTE = [
  "#0f172a",
  "#334155",
  "#475569",
  "#64748b",
  "#94a3b8",
  "#e2e8f0",
  "#ffffff",
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

function normalizeHexColor(raw?: string) {
  const v = (raw || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#334155";
}

export function isMultilineConfigKey(configKey: string) {
  return MULTILINE_KEYS.has(configKey);
}

export function isColorConfigKey(configKey: string) {
  return configKey.toLowerCase().includes(COLOR_KEY_HINT);
}

export function validateConfigValue(value: string, valueType?: string) {
  if (!valueType) return true;
  const t = valueType.toUpperCase();
  if (t === "BOOLEAN") return value === "true" || value === "false";
  if (t === "NUMBER") return value === "" || !Number.isNaN(Number(value));
  return true;
}

type ConfigFieldEditorProps = {
  cfg: SystemConfigRecord;
  def?: SettingDefinitionRecord;
  showSensitive: boolean;
  onToggleSensitive: () => void;
  onChange: (value: string) => void;
  onSave: () => void | Promise<void>;
  saving?: boolean;
};

export function ConfigFieldEditor({
  cfg,
  def,
  showSensitive,
  onToggleSensitive,
  onChange,
  onSave,
  saving,
}: ConfigFieldEditorProps) {
  const valueType = (def?.valueType || cfg.valueType || "STRING").toUpperCase();
  const options = def?.options?.filter(Boolean) ?? [];

  const renderValueInput = () => {
    if (options.length > 0) {
      return (
        <AdminSelect value={cfg.configValue || ""} onChange={(e) => onChange(e.target.value)} className="w-full max-w-md">
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {labelConfigOption(opt)}
            </option>
          ))}
        </AdminSelect>
      );
    }

    if (valueType === "BOOLEAN") {
      return (
        <AdminSelect value={cfg.configValue === "true" ? "true" : "false"} onChange={(e) => onChange(e.target.value)} className="w-full max-w-xs">
          <option value="true">是</option>
          <option value="false">否</option>
        </AdminSelect>
      );
    }

    if (valueType === "NUMBER") {
      return (
        <input
          type="number"
          className={cn(adminInputClass, "max-w-xs")}
          value={cfg.configValue || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }

    if (isMultilineConfigKey(cfg.configKey)) {
      return (
        <textarea
          value={cfg.configValue || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={cfg.configKey.includes("rules_json") ? 14 : 8}
          spellCheck={false}
          className={cn(
            adminInputClass,
            "min-h-[160px] resize-y font-mono text-[13px] leading-relaxed [tab-size:2] whitespace-pre-wrap",
          )}
          placeholder={cfg.configKey.includes("rules_json") ? "JSON 布局规则" : "支持换行，前台将按段落展示"}
        />
      );
    }

    if (isColorConfigKey(cfg.configKey)) {
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="color"
              value={normalizeHexColor(cfg.configValue)}
              onChange={(e) => onChange(e.target.value)}
              className="h-9 w-11 cursor-pointer rounded-lg border border-neutral-200 p-0.5"
              title="选色"
            />
            <input
              type="text"
              className={cn(adminInputClass, "max-w-[12rem] font-mono text-xs")}
              value={cfg.configValue || ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder="#334155"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className="h-6 w-6 rounded border border-neutral-200 shadow-sm"
                style={{ backgroundColor: c }}
                title={c}
                onClick={() => onChange(c)}
              />
            ))}
          </div>
        </div>
      );
    }

    const sensitive = Boolean(def?.isSensitive);
    return (
      <div className="flex max-w-lg items-center gap-2">
        <input
          type={sensitive && !showSensitive ? "password" : "text"}
          className={adminInputClass}
          value={cfg.configValue || ""}
          onChange={(e) => onChange(e.target.value)}
        />
        {sensitive ? (
          <AdminButton type="button" tone="secondary" size="sm" onClick={onToggleSensitive}>
            {showSensitive ? "隐藏" : "查看"}
          </AdminButton>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "grid gap-4 border-b border-neutral-100 py-4 last:border-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-start",
        isMultilineConfigKey(cfg.configKey) && "md:items-start",
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="text-sm font-medium text-neutral-900">{def?.labelZh || cfg.configKey}</div>
        <p className={adminHintClass}>
          键名 <code className="rounded bg-neutral-100 px-1 font-mono text-[11px]">{cfg.configKey}</code>
        </p>
        {(def?.description || cfg.remark) && <p className="text-xs leading-relaxed text-neutral-600">{def?.description || cfg.remark}</p>}
        {def?.defaultValue ? <p className={adminHintClass}>默认：{def.defaultValue}</p> : null}
        {def?.requiresRestart ? (
          <span className="inline-block rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200/80">
            修改后需重启服务
          </span>
        ) : null}
      </div>
      <div className="min-w-0">
        <span className={cn(adminLabelClass, "mb-1 block")}>当前值</span>
        {renderValueInput()}
      </div>
      <div className={cn("flex md:justify-end", isMultilineConfigKey(cfg.configKey) ? "md:pt-6" : "md:items-center")}>
        <AdminButton type="button" tone="primary" size="sm" disabled={saving} onClick={() => void onSave()}>
          {saving ? "保存中…" : "保存"}
        </AdminButton>
      </div>
    </div>
  );
}
