import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { SettingDefinitionRecord, SystemConfigRecord } from "@/api/domains/notification.api";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { FaceEnvThresholdPanel } from "@/features/admin/settings/FaceEnvThresholdPanel";
import { SystemConfigsPanel } from "@/features/admin/settings/SystemConfigsPanel";
import {
  FACE_SETTINGS_GROUPS,
  pickFaceConfigsForGroup,
  pickUncategorizedFaceConfigs,
} from "@/features/admin/settings/faceSettingsGroups";

type FaceSettingsPanelProps = {
  configs: SystemConfigRecord[];
  configDefs: SettingDefinitionRecord[];
  onConfigsChange: Dispatch<SetStateAction<SystemConfigRecord[]>>;
};

export function FaceSettingsPanel({ configs, configDefs, onConfigsChange }: FaceSettingsPanelProps) {
  const [keyword, setKeyword] = useState("");

  const faceConfigs = useMemo(
    () => configs.filter((c) => c.module === "face" || c.configKey.startsWith("face.")),
    [configs],
  );

  const faceDefs = useMemo(
    () => configDefs.filter((d) => d.module === "face" || d.configKey.startsWith("face.")),
    [configDefs],
  );

  const uncategorized = useMemo(() => pickUncategorizedFaceConfigs(faceConfigs), [faceConfigs]);

  return (
    <div className="space-y-5">
      <AdminFormCard
        title="人脸识别配置"
        description="按实际控制模块分区；保存后立即生效（无需重启）。环境变量仅作首次 seed 默认值。"
      >
        <AdminToolbarSearchField
          className="max-w-md"
          placeholder="搜索全部分区：中文名、说明或键名…"
          value={keyword}
          onChange={setKeyword}
          onSubmit={() => undefined}
        />
      </AdminFormCard>

      {FACE_SETTINGS_GROUPS.map((group) => {
        const groupConfigs = pickFaceConfigsForGroup(faceConfigs, group);
        if (groupConfigs.length === 0) return null;
        return (
          <SystemConfigsPanel
            key={group.id}
            moduleKey="face"
            title={`${group.title} · ${group.scope}`}
            description={`${group.description}（键前缀与代码模块对应，便于对照排查。）`}
            configs={groupConfigs}
            configDefs={faceDefs}
            onConfigsChange={onConfigsChange}
            configKeys={group.keys}
            parentKeyword={keyword}
            hideSearch
          />
        );
      })}

      {uncategorized.length > 0 && (
        <SystemConfigsPanel
          moduleKey="face"
          title="其他 · 未归类"
          description="新增但尚未写入分区表的 face 配置项。"
          configs={uncategorized}
          configDefs={faceDefs}
          onConfigsChange={onConfigsChange}
          parentKeyword={keyword}
          hideSearch
        />
      )}

      <FaceEnvThresholdPanel />
    </div>
  );
}
