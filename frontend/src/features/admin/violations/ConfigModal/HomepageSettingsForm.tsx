import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import toast from "react-hot-toast";
import {
  fetchConfigDefinitions,
  fetchSystemConfigs,
  updateSystemConfig,
  type SettingDefinitionRecord,
  type SystemConfigRecord,
} from "@/api/domains/notification.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { validateConfigValue } from "@/features/admin/settings/ConfigFieldEditor";
import { cn } from "@/lib/utils";

const MODULE_KEY = "dashboard_codex";

/* 富文本（TipTap HTML）字段：不得回退为纯文本，保留富文本能力 */
const RICH_KEYS = new Set([
  "dashboard.codex.return_rules",
  "dashboard.codex.discipline_body",
  "dashboard.codex.notice_body",
]);

/* 字号档位：inherit 前缀仅还卡/惩戒独立档位可用 */
const SCALE_OPTIONS = ["sm", "md", "lg", "xl"];
const INHERIT_SCALE_OPTIONS = ["inherit", "sm", "md", "lg", "xl"];

const INHERIT_SCALE_KEYS = new Set([
  "dashboard.codex.footer_hours_font_scale",
  "dashboard.codex.footer_discipline_font_scale",
]);

type FieldKind = "text" | "rich" | "select" | "number" | "switch";
type Field = { key: string; kind: FieldKind; wide?: boolean };
type Group = { title: string; desc?: string; fields: Field[]; grid?: boolean; collapsible?: boolean };

const GROUPS: Group[] = [
  {
    title: "卡片与时段",
    fields: [
      { key: "dashboard.codex.title", kind: "text", wide: true },
      { key: "dashboard.codex.hours_label", kind: "text", wide: true },
      { key: "dashboard.codex.start_time", kind: "text" },
      { key: "dashboard.codex.end_time", kind: "text" },
    ],
  },
  {
    title: "正文文案",
    desc: "点击「编辑」展开，同一时刻仅一项",
    collapsible: true,
    fields: [
      { key: "dashboard.codex.return_rules", kind: "rich" },
      { key: "dashboard.codex.discipline_title", kind: "text", wide: true },
      { key: "dashboard.codex.discipline_body", kind: "rich" },
      { key: "dashboard.codex.notice_title", kind: "text", wide: true },
      { key: "dashboard.codex.notice_body", kind: "rich" },
    ],
  },
  {
    title: "展示样式",
    desc: "sm / md / lg / xl",
    grid: true,
    fields: [
      { key: "dashboard.codex.title_font_scale", kind: "select" },
      { key: "dashboard.codex.notice_font_scale", kind: "select" },
      { key: "dashboard.codex.footer_font_scale", kind: "select" },
      { key: "dashboard.codex.footer_hours_font_scale", kind: "select" },
      { key: "dashboard.codex.footer_discipline_font_scale", kind: "select" },
      { key: "dashboard.codex.notice_card_scale", kind: "select" },
      { key: "dashboard.codex.footer_card_scale", kind: "select" },
    ],
  },
  {
    title: "大屏惩戒公示",
    fields: [
      { key: "dashboard.codex.violation_board_enabled", kind: "switch" },
      { key: "dashboard.codex.violation_board_max_items", kind: "number" },
      { key: "dashboard.codex.violation_board_summary_max_len", kind: "number" },
      { key: "dashboard.codex.notice_tab_seconds", kind: "number" },
    ],
  },
];

/** 压缩配置值为单行摘要：布尔转「是/否」，富文本/多行去标签、去空白、截断。 */
function summarizeValue(cfg: SystemConfigRecord, def?: SettingDefinitionRecord): string {
  const valueType = (def?.valueType || cfg.valueType || "STRING").toUpperCase();
  const raw = cfg.configValue || "";
  if (valueType === "BOOLEAN") return raw === "true" ? "是" : "否";
  const plain = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return "未填写";
  return plain.length > 60 ? `${plain.slice(0, 60)}…` : plain;
}

const ctlInput =
  "h-7 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 text-xs text-[var(--app-color-text-primary)] outline-none transition focus:border-[var(--app-color-accent)]";
const ctlWide = cn(ctlInput, "w-44 max-w-full");
const ctlNarrow = cn(ctlInput, "w-16");

const selectCls =
  "h-7 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-1.5 text-xs text-[var(--app-color-text-primary)] outline-none transition focus:border-[var(--app-color-accent)]";

/**
 * 「主页文案」紧凑分组表单（记录为主页后，⚙ 弹窗 → 其他 → 主页文案 的挂载页）。
 * 数据自取自查（dashboard_codex 20 个定义）；正文长字段用 RichTextEditor 保留富文本；
 * 底部「保存全部」逐个 updateSystemConfig，成功后仅合并本地（post-save-no-full-refresh）。
 */
export function HomepageSettingsForm(): JSX.Element {
  const [configs, setConfigs] = useState<SystemConfigRecord[]>([]);
  const [defs, setDefs] = useState<SettingDefinitionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchSystemConfigs(MODULE_KEY), fetchConfigDefinitions(MODULE_KEY)])
      .then(([c, d]) => {
        setConfigs(c);
        setDefs(d);
      })
      .catch((err) => console.error("Failed to load dashboard_codex configs:", err))
      .finally(() => setLoading(false));
  }, []);

  const defMap = useMemo(() => new Map(defs.map((d) => [d.configKey, d])), [defs]);
  const cfgMap = useMemo(() => new Map(configs.map((c) => [c.configKey, c])), [configs]);

  const setValue = (key: string, value: string) => {
    setConfigs((prev) => prev.map((x) => (x.configKey === key ? { ...x, configValue: value } : x)));
    setDirty((prev) => new Set(prev).add(key));
  };

  const saveAll = async () => {
    const keys = configs.filter((c) => dirty.has(c.configKey)).map((c) => c.configKey);
    if (keys.length === 0) {
      toast("没有需要保存的修改");
      return;
    }
    setSaving(true);
    let ok = 0;
    const failed: string[] = [];
    for (const key of keys) {
      const cfg = cfgMap.get(key);
      const def = defMap.get(key);
      if (!cfg) continue;
      if (!validateConfigValue(cfg.configValue || "", def?.valueType)) {
        failed.push(def?.labelZh || key);
        continue;
      }
      try {
        await updateSystemConfig(cfg.id, { configValue: cfg.configValue });
        ok += 1;
        setDirty((prev) => {
          const n = new Set(prev);
          n.delete(key);
          return n;
        });
      } catch {
        failed.push(def?.labelZh || key);
      }
    }
    setSaving(false);
    if (ok > 0) toast.success(ok === keys.length ? "已保存全部修改" : `已保存 ${ok} 项`);
    if (failed.length > 0) toast.error(`保存失败：${failed.join("、")}`);
  };

  if (loading) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">
        加载中…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="flex flex-col gap-4 p-3">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <div className="mb-1 flex items-baseline gap-2 px-1 text-[11px] font-bold tracking-wide text-[var(--app-color-text-tertiary)]">
                {g.title}
                {g.desc ? <span className="font-medium tracking-normal text-[var(--app-color-text-tertiary)]/75">{g.desc}</span> : null}
              </div>
              <div
                className={cn(
                  "overflow-hidden rounded-lg border border-[var(--app-color-border-default)]",
                  g.grid && "grid grid-cols-1 sm:grid-cols-2"
                )}
              >
                {g.fields.map((f, i) => {
                  const cfg = cfgMap.get(f.key);
                  const def = defMap.get(f.key);
                  if (!cfg) return null;
                  const rowBorder = i === 0 ? undefined : "border-t border-[var(--app-color-border-default)]";
                  return (
                    <div key={f.key} className={cn("min-h-9 px-3 py-1.5", rowBorder)}>
                      <RowLabel keyName={f.key} label={def?.labelZh || f.key} desc={def?.description} dirty={dirty.has(f.key)} />
                      {f.kind === "rich" ? (
                        <RichRow
                          keyName={f.key}
                          open={openKey === f.key}
                          onToggle={() => setOpenKey((cur) => (cur === f.key ? null : f.key))}
                          preview={summarizeValue(cfg, def)}
                          saving={saving}
                          value={cfg.configValue || ""}
                          onChange={(v) => setValue(f.key, v)}
                        />
                      ) : f.kind === "switch" ? (
                        <div className="flex items-center justify-end pt-0.5">
                          <AdminSwitchScaled
                            size="sm"
                            checked={cfg.configValue === "true"}
                            disabled={saving}
                            onChange={(checked) => setValue(f.key, checked ? "true" : "false")}
                          />
                        </div>
                      ) : f.kind === "select" ? (
                        <div className="flex items-center justify-end">
                          <select
                            className={selectCls}
                            value={cfg.configValue || ""}
                            disabled={saving}
                            onChange={(e) => setValue(f.key, e.target.value)}
                          >
                            {(def?.options?.length ? def.options : INHERIT_SCALE_KEYS.has(f.key) ? INHERIT_SCALE_OPTIONS : SCALE_OPTIONS).map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : f.kind === "number" ? (
                        <div className="flex items-center justify-end">
                          <input
                            type="number"
                            className={ctlNarrow}
                            value={cfg.configValue || ""}
                            disabled={saving}
                            onChange={(e) => setValue(f.key, e.target.value)}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-end">
                          <input
                            type="text"
                            className={f.wide ? ctlWide : ctlNarrow}
                            value={cfg.configValue || ""}
                            disabled={saving}
                            onChange={(e) => setValue(f.key, e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[var(--app-color-border-default)] px-4 py-2.5">
        {dirty.size > 0 ? (
          <span className="text-[11px] text-[var(--app-color-text-tertiary)]">共 {dirty.size} 项修改未保存</span>
        ) : (
          <span className="text-[11px] text-[var(--app-color-text-tertiary)]">暂无未保存修改</span>
        )}
        <AdminButton type="button" tone="primary" size="sm" loading={saving} disabled={dirty.size === 0} onClick={() => void saveAll()}>
          保存全部
        </AdminButton>
      </div>
    </div>
  );
}

function RowLabel({ keyName, label, desc, dirty }: { keyName: string; label: string; desc?: string; dirty: boolean }): JSX.Element {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[13px] font-medium text-[var(--app-color-text-primary)]" title={desc}>
        {label}
      </span>
      {dirty ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--app-color-accent)]" aria-label="已修改" /> : null}
      <span className="hidden font-mono text-[10px] text-[var(--app-color-text-tertiary)]">{keyName}</span>
    </div>
  );
}

function RichRow({
  keyName,
  open,
  onToggle,
  preview,
  saving,
  value,
  onChange,
}: {
  keyName: string;
  open: boolean;
  onToggle: () => void;
  preview: string;
  saving: boolean;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  const interactedRef = useRef(false);
  // TipTap 挂载时会对存量 HTML 做一次规范化并触发 onChange（并非用户编辑）。
  // 丢弃首次发射，避免「打开即脏」并阻止未编辑时把规范化后的 HTML 写回。
  const handleEditorChange = (html: string) => {
    if (!interactedRef.current) {
      interactedRef.current = true;
      return;
    }
    onChange(html);
  };
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="line-clamp-2 min-w-0 flex-1 text-xs leading-snug text-[var(--app-color-text-secondary)]">{preview}</span>
        <AdminButton type="button" tone="secondary" size="sm" className="shrink-0" onClick={onToggle}>
          {open ? "收起" : "编辑"}
        </AdminButton>
      </div>
      {open ? (
        <div className="mt-2">
          <RichTextEditor value={value} onChange={handleEditorChange} disabled={saving} />
        </div>
      ) : null}
    </div>
  );
}
