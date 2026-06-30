import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FaceSettingsPanel } from "@/features/admin/settings/FaceSettingsPanel";
import { SystemConfigsPanel } from "@/features/admin/settings/SystemConfigsPanel";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { AdminButton } from "@/components/admin/AdminButton";
import { adminHintClass } from "@/features/admin/adminFormUi";
import DataSkeleton from "@/components/ui/DataSkeleton";
import {
  fetchSystemConfigs,
  fetchConfigDefinitions,
  fetchExternalCommConfigOverview,
  type SystemConfigRecord,
  type SettingDefinitionRecord,
  type ExternalCommConfigItem,
  type ExternalCommConfigOverview,
} from "@/api/domains/notification.api";

// ────────────────────────────────────────────────────────────────────
// ExternalCommConfigTable — read-only inspection table extracted from
// AdminExternalCommConfigPage.tsx. Handles its own keyword search,
// sensitive-field toggle, and three-column source-grouped layout.
// ────────────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  hardcoded: "代码硬编码",
  applicationProperties: "应用配置文件",
  environmentVariables: "环境变量",
};

function ExternalCommConfigTable({ overview }: { overview: ExternalCommConfigOverview }) {
  const [keyword, setKeyword] = useState("");
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});

  const filterRows = (rows: ExternalCommConfigItem[]) => {
    const key = keyword.trim().toLowerCase();
    if (!key) return rows;
    return rows.filter((row) => {
      return (
        row.key.toLowerCase().includes(key) ||
        row.source.toLowerCase().includes(key) ||
        (row.actualValue || row.value || "").toLowerCase().includes(key)
      );
    });
  };

  const sections = useMemo(() => {
    return [
      { id: "hardcoded", title: SECTION_LABELS.hardcoded, rows: filterRows(overview.hardcoded) },
      { id: "props", title: SECTION_LABELS.applicationProperties, rows: filterRows(overview.applicationProperties) },
      { id: "env", title: SECTION_LABELS.environmentVariables, rows: filterRows(overview.environmentVariables) },
    ];
  }, [overview, keyword]);

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--app-radius-container)] border border-[var(--app-color-feedback-warning-soft)] bg-[var(--app-color-feedback-warning-soft)] px-4 py-2 text-xs text-[var(--app-color-feedback-warning)]">
        敏感字段默认脱敏，点击「查看」后仅在当前浏览器会话中显示明文。
      </div>

      <AdminToolbarSearchField
        placeholder="搜索配置键、来源或值…"
        value={keyword}
        onChange={setKeyword}
        onSubmit={() => undefined}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {sections.map((sec) => (
          <AdminFormCard key={sec.id} title={sec.title} description={`共 ${sec.rows.length} 项`}>
            {sec.rows.length === 0 ? (
              <p className={adminHintClass}>暂无数据</p>
            ) : (
              <div className="max-h-[min(60vh,520px)] space-y-2 overflow-y-auto">
                {sec.rows.map((row) => {
                  const canView = row.masked && row.exists;
                  const visible = canView && showSensitive[row.key];
                  const displayValue = visible ? row.actualValue || "" : row.value;
                  return (
                    <div
                      key={`${sec.id}-${row.key}`}
                      className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-2.5 text-xs"
                    >
                      <p className="break-all font-medium text-[var(--app-color-text-primary)]">
                        {row.key}
                      </p>
                      <p className="mt-1 break-all text-[var(--app-color-text-secondary)]">
                        值：{row.exists ? displayValue || "（空）" : "未设置"}
                      </p>
                      <p className="mt-1 break-all text-[var(--app-color-text-tertiary)]">
                        来源：{row.source}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {row.masked ? (
                          <span className="rounded-[var(--app-radius-element)] bg-[var(--app-color-feedback-warning-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-color-feedback-warning)]">
                            敏感
                          </span>
                        ) : null}
                        {!row.modifiable ? (
                          <span className="rounded-[var(--app-radius-element)] bg-[var(--app-color-surface-hover)] px-1.5 py-0.5 text-[10px] text-[var(--app-color-text-secondary)]">
                            只读
                          </span>
                        ) : null}
                        {canView ? (
                          <AdminButton
                            type="button"
                            tone="secondary"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() =>
                              setShowSensitive((prev) => ({
                                ...prev,
                                [row.key]: !prev[row.key],
                              }))
                            }
                          >
                            {visible ? "隐藏" : "查看"}
                          </AdminButton>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </AdminFormCard>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// AccessControlSettings — main page component
//
// Renders three logical areas, each self-contained with its own card
// chrome. FaceSettingsPanel and SystemConfigsPanel already render
// their own AdminFormCard internally (they accept title/description
// props or hardcode them), so we do NOT double-wrap them here.
// ExternalCommConfigTable does not self-wrap; we wrap it once.
// ────────────────────────────────────────────────────────────────────

export default function AccessControlSettings() {
  // ── Face config ──
  const [faceConfigs, setFaceConfigs] = useState<SystemConfigRecord[]>([]);
  const [faceDefs, setFaceDefs] = useState<SettingDefinitionRecord[]>([]);

  const { data: faceConfigsRaw, isLoading: faceConfigsLoading } = useQuery({
    queryKey: ["systemConfigs", "face"] as const,
    queryFn: () => fetchSystemConfigs("face"),
  });
  const { data: faceDefsRaw, isLoading: faceDefsLoading } = useQuery({
    queryKey: ["configDefinitions", "face"] as const,
    queryFn: () => fetchConfigDefinitions("face"),
  });

  useEffect(() => {
    if (faceConfigsRaw) setFaceConfigs(faceConfigsRaw);
  }, [faceConfigsRaw]);
  useEffect(() => {
    if (faceDefsRaw) setFaceDefs(faceDefsRaw);
  }, [faceDefsRaw]);

  // ── Telemetry facility config ──
  const [telemetryConfigs, setTelemetryConfigs] = useState<SystemConfigRecord[]>([]);
  const [telemetryDefs, setTelemetryDefs] = useState<SettingDefinitionRecord[]>([]);

  const { data: telemetryConfigsRaw, isLoading: telemetryConfigsLoading } = useQuery({
    queryKey: ["systemConfigs", "telemetry_facility"] as const,
    queryFn: () => fetchSystemConfigs("telemetry_facility"),
  });
  const { data: telemetryDefsRaw, isLoading: telemetryDefsLoading } = useQuery({
    queryKey: ["configDefinitions", "telemetry_facility"] as const,
    queryFn: () => fetchConfigDefinitions("telemetry_facility"),
  });

  useEffect(() => {
    if (telemetryConfigsRaw) setTelemetryConfigs(telemetryConfigsRaw);
  }, [telemetryConfigsRaw]);
  useEffect(() => {
    if (telemetryDefsRaw) setTelemetryDefs(telemetryDefsRaw);
  }, [telemetryDefsRaw]);

  // ── External communication config ──
  const { data: extCommOverview, isLoading: extCommLoading } = useQuery({
    queryKey: ["externalCommConfigOverview"] as const,
    queryFn: fetchExternalCommConfigOverview,
  });

  const faceLoading = faceConfigsLoading || faceDefsLoading;
  const telemetryLoading = telemetryConfigsLoading || telemetryDefsLoading;

  return (
    <div className="space-y-6">
      {/* ── 人脸识别配置 ──
          FaceSettingsPanel renders its own AdminFormCard with title
          "人脸识别配置" + search bar + per-group SystemConfigsPanel
          cards. No outer card needed. */}
      {faceLoading ? (
        <DataSkeleton variant="card" rows={10} />
      ) : (
        <FaceSettingsPanel
          configs={faceConfigs}
          configDefs={faceDefs}
          onConfigsChange={setFaceConfigs}
        />
      )}

      {/* ── 设施遥测配置 ──
          SystemConfigsPanel self-wraps in AdminFormCard. We pass
          title/description to override its default heading. */}
      {telemetryLoading ? (
        <DataSkeleton variant="card" rows={8} />
      ) : (
        <SystemConfigsPanel
          moduleKey="telemetry_facility"
          title="设施遥测配置"
          description="动物房 B1F 等设施房间的 3D 布局规则（JSON，修改后通常即时生效）。"
          configs={telemetryConfigs}
          configDefs={telemetryDefs}
          onConfigsChange={setTelemetryConfigs}
        />
      )}

      {/* ── 外部通信连接状态 ──
          ExternalCommConfigTable does NOT self-wrap, so we wrap it
          in AdminFormCard here. */}
      <AdminFormCard
        title="外部通信连接状态"
        description="只读检查外部通信配置值，按来源分组展示。本卡片不支持在线修改。"
      >
        {extCommLoading ? (
          <DataSkeleton variant="card" rows={6} />
        ) : extCommOverview ? (
          <ExternalCommConfigTable overview={extCommOverview} />
        ) : (
          <p className={adminHintClass}>暂无数据</p>
        )}
      </AdminFormCard>
    </div>
  );
}
