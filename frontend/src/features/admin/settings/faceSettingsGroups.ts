/** 管理端 face 模块配置分组：按实际控制的前端/业务模块归类 */

export interface FaceSettingsGroup {
  id: string;
  title: string;
  /** 本组配置影响的用户可见功能 */
  scope: string;
  description: string;
  keys: readonly string[];
}

/** 已知键的展示顺序（组内） */
export const FACE_SETTINGS_GROUPS: readonly FaceSettingsGroup[] = [
  {
    id: "global",
    title: "总控",
    scope: "所有人脸子功能",
    description: "关闭后验证、录入、调试、底库管理等全部不可用。",
    keys: ["face.master_enabled"],
  },
  {
    id: "gate-scan",
    title: "门禁 · 刷卡弹窗验证",
    scope: "Twin 扫码页 → Dynamic Island",
    description: "刷卡 analyze 成功后是否弹出全屏人脸验证；含活体动作与活体期间静默 Prefetch。",
    keys: [
      "face.scan_popup.enabled",
      "face.verify.prefetch.enabled",
      "face.verify.prefetch.interval_ms",
      "face.verify.pre_liveness_reject_threshold",
      "face.verify.liveness.blink_enabled",
      "face.verify.liveness.turn_enabled",
      "face.verify.liveness.turn_hold_ms",
    ],
  },
  {
    id: "gate-threshold",
    title: "门禁 · 服务端比对阈值",
    scope: "POST /api/face/verify（source=gate）",
    description: "路线 B 余弦相似度；留空的可选覆盖项表示沿用全局阈值。",
    keys: [
      "face.verify.match_threshold",
      "face.verify.reject_threshold",
      "face.verify.match_threshold.gate",
    ],
  },
  {
    id: "personal",
    title: "个人中心 · PIN 键盘",
    scope: "UiverseProfilePopup 紧凑人脸窗",
    description: "快捷业务 PIN 键盘上方的人脸验证；pin_alternative 开启后可选择人脸代替 PIN。",
    keys: ["face.pin_alternative.enabled", "face.verify.match_threshold.personal"],
  },
  {
    id: "pip",
    title: "画中画 · 持续监测",
    scope: "FacePipMonitor（验证通过后）",
    description: "门禁验证成功后在角落持续比对，非本人时倒计时告警。",
    keys: ["face.verify.match_threshold.pip"],
  },
  {
    id: "enroll",
    title: "底库 · 人脸录入",
    scope: "FaceEnrollment 录入流程",
    description: "底库照片采集时的活体步骤、注视时长；严模式为附加帧间互配质检。",
    keys: [
      "face.enroll.liveness.blink_enabled",
      "face.enroll.liveness.turn_left_enabled",
      "face.enroll.liveness.turn_right_enabled",
      "face.enroll.liveness.turn_hold_ms",
      "face.enroll.hold_still_seconds",
      "face.enroll_strict.enabled",
      "face.enroll_strict.pair_min_sim",
      "face.enroll_strict.min_count_above_pair",
      "face.enroll_strict.max_pair_sim",
      "face.enroll_strict.top2_avg_min",
    ],
  },
  {
    id: "baseline",
    title: "底库 · 照片管理",
    scope: "大华发卡 / 底库维护页",
    description: "是否允许在管理端上传、删除人员底库照片。",
    keys: ["face.baseline_mgmt.enabled"],
  },
  {
    id: "debug",
    title: "调试 · face-debug",
    scope: "/admin/face-debug",
    description: "开发人员人脸比对调试页开关。",
    keys: ["face.debug_page.enabled"],
  },
] as const;

const GROUPED_KEY_SET = new Set(FACE_SETTINGS_GROUPS.flatMap((g) => g.keys));

export function faceConfigGroupRank(configKey: string): number {
  for (let i = 0; i < FACE_SETTINGS_GROUPS.length; i++) {
    const idx = FACE_SETTINGS_GROUPS[i].keys.indexOf(configKey);
    if (idx >= 0) return i * 100 + idx;
  }
  return 9000;
}

export function isFaceConfigGrouped(configKey: string): boolean {
  return GROUPED_KEY_SET.has(configKey);
}

export function pickFaceConfigsForGroup<T extends { configKey: string }>(
  configs: T[],
  group: FaceSettingsGroup,
): T[] {
  const map = new Map(configs.map((c) => [c.configKey, c]));
  return group.keys.map((k) => map.get(k)).filter((c): c is T => c != null);
}

export function pickUncategorizedFaceConfigs<T extends { configKey: string }>(configs: T[]): T[] {
  return configs.filter((c) => !GROUPED_KEY_SET.has(c.configKey));
}
