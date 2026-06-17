package com.example.demo.modules.facerecognition.service;

import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.*;

@Service
public class FaceAuthConfigService {

    public static final String MODULE = "face";

    public static final String ENV_VERIFY_MATCH = "FACE_VERIFY_MATCH_THRESHOLD";
    public static final String ENV_VERIFY_REJECT = "FACE_VERIFY_REJECT_THRESHOLD";

    private static final String KEY_MASTER = "face.master_enabled";
    public static final String KEY_SCAN_POPUP = "face.scan_popup.enabled";
    public static final String KEY_PIN_ALTERNATIVE = "face.pin_alternative.enabled";
    public static final String KEY_DEBUG_PAGE = "face.debug_page.enabled";
    public static final String KEY_BASELINE_MGMT = "face.baseline_mgmt.enabled";
    public static final String KEY_ENROLL_STRICT = "face.enroll_strict.enabled";

    /** 全局默认阈值（DB 可热改；未配置时用环境变量默认值） */
    public static final String KEY_MATCH = "face.verify.match_threshold";
    public static final String KEY_REJECT = "face.verify.reject_threshold";
    public static final String KEY_MATCH_GATE = "face.verify.match_threshold.gate";
    public static final String KEY_MATCH_PERSONAL = "face.verify.match_threshold.personal";
    public static final String KEY_MATCH_PIP = "face.verify.match_threshold.pip";

    /** 门禁/个人中心验证活体 */
    public static final String KEY_VERIFY_LIVENESS_BLINK = "face.verify.liveness.blink_enabled";
    public static final String KEY_VERIFY_LIVENESS_TURN = "face.verify.liveness.turn_enabled";
    public static final String KEY_VERIFY_LIVENESS_TURN_HOLD_MS = "face.verify.liveness.turn_hold_ms";

    /** 底库录入活体 */
    public static final String KEY_ENROLL_LIVENESS_BLINK = "face.enroll.liveness.blink_enabled";
    public static final String KEY_ENROLL_LIVENESS_TURN_LEFT = "face.enroll.liveness.turn_left_enabled";
    public static final String KEY_ENROLL_LIVENESS_TURN_RIGHT = "face.enroll.liveness.turn_right_enabled";
    public static final String KEY_ENROLL_LIVENESS_TURN_HOLD_MS = "face.enroll.liveness.turn_hold_ms";
    public static final String KEY_ENROLL_HOLD_STILL_SECONDS = "face.enroll.hold_still_seconds";

    /** 录入严模式：客户端帧间互配附加门槛（与路线 B 服务端阈值独立） */
    public static final String KEY_ENROLL_STRICT_PAIR_MIN = "face.enroll_strict.pair_min_sim";
    public static final String KEY_ENROLL_STRICT_MIN_COUNT = "face.enroll_strict.min_count_above_pair";
    public static final String KEY_ENROLL_STRICT_MAX_PAIR = "face.enroll_strict.max_pair_sim";
    public static final String KEY_ENROLL_STRICT_TOP2_AVG = "face.enroll_strict.top2_avg_min";

    /** 门禁：活体期间静默 Prefetch 比对 + 眨眼前早拒 */
    public static final String KEY_VERIFY_PREFETCH_ENABLED = "face.verify.prefetch.enabled";
    public static final String KEY_VERIFY_PREFETCH_INTERVAL_MS = "face.verify.prefetch.interval_ms";
    public static final String KEY_VERIFY_PRE_LIVENESS_REJECT = "face.verify.pre_liveness_reject_threshold";

    private final NotificationSettingsService notificationSettingsService;

    @Value("${app.face.master-enabled:true}")
    private String defaultMasterEnabled;

    @Value("${app.face.scan-popup-enabled:true}")
    private String defaultScanPopupEnabled;

    @Value("${app.face.pin-alternative-enabled:false}")
    private String defaultPinAlternativeEnabled;

    @Value("${app.face.debug-page-enabled:true}")
    private String defaultDebugPageEnabled;

    @Value("${app.face.baseline-mgmt-enabled:true}")
    private String defaultBaselineMgmtEnabled;

    @Value("${app.face.enroll-strict-enabled:false}")
    private String defaultEnrollStrictEnabled;

    @Value("${app.face.verify-match-threshold:0.62}")
    private double envDefaultMatchThreshold;

    @Value("${app.face.verify-reject-threshold:0.48}")
    private double envDefaultRejectThreshold;

    /** 画中画持续监测：默认可略低于门禁全局线，仍须同一人 */
    @Value("${app.face.verify-match-threshold-pip:0.58}")
    private double envDefaultMatchThresholdPip;

    @Value("${app.face.verify-liveness-blink-enabled:true}")
    private String defaultVerifyBlinkEnabled;

    @Value("${app.face.verify-liveness-turn-enabled:true}")
    private String defaultVerifyTurnEnabled;

    @Value("${app.face.verify-liveness-turn-hold-ms:800}")
    private String defaultVerifyTurnHoldMs;

    @Value("${app.face.enroll-liveness-blink-enabled:true}")
    private String defaultEnrollBlinkEnabled;

    @Value("${app.face.enroll-liveness-turn-left-enabled:true}")
    private String defaultEnrollTurnLeftEnabled;

    @Value("${app.face.enroll-liveness-turn-right-enabled:true}")
    private String defaultEnrollTurnRightEnabled;

    @Value("${app.face.enroll-liveness-turn-hold-ms:800}")
    private String defaultEnrollTurnHoldMs;

    @Value("${app.face.enroll-hold-still-seconds:2}")
    private String defaultEnrollHoldStillSeconds;

    @Value("${app.face.enroll-strict-pair-min-sim:0.72}")
    private double defaultEnrollStrictPairMinSim;

    @Value("${app.face.enroll-strict-min-count-above-pair:2}")
    private String defaultEnrollStrictMinCountAbovePair;

    @Value("${app.face.enroll-strict-max-pair-sim:0.82}")
    private double defaultEnrollStrictMaxPairSim;

    @Value("${app.face.enroll-strict-top2-avg-min:0.75}")
    private double defaultEnrollStrictTop2AvgMin;

    @Value("${app.face.verify-prefetch-enabled:true}")
    private String defaultVerifyPrefetchEnabled;

    @Value("${app.face.verify-prefetch-interval-ms:900}")
    private String defaultVerifyPrefetchIntervalMs;

    @Value("${app.face.verify-pre-liveness-reject-threshold:0.55}")
    private double defaultPreLivenessRejectThreshold;

    public FaceAuthConfigService(NotificationSettingsService notificationSettingsService) {
        this.notificationSettingsService = notificationSettingsService;
    }

    public boolean isMasterEnabled() {
        return "true".equalsIgnoreCase(get(KEY_MASTER, defaultMasterEnabled));
    }

    public boolean isFeatureEnabled(String featureKey) {
        if (!isMasterEnabled()) return false;
        return "true".equalsIgnoreCase(get(featureKey, getDefaultForKey(featureKey)));
    }

    public boolean isEnabled(String featureKey) {
        return isFeatureEnabled(featureKey);
    }

    public Map<String, Object> getAllConfigs() {
        Map<String, Object> cfg = new LinkedHashMap<>(getBooleanConfigs());
        cfg.put("liveness", getLivenessConfig().toMap());
        cfg.put("enrollStrict", getEnrollStrictConfig().toMap());
        cfg.put("verifyPrefetch", getVerifyPrefetchConfig().toMap());
        return cfg;
    }

    /** 仅布尔开关（管理端 PUT /config 批量保存） */
    public Map<String, Object> getBooleanConfigs() {
        Map<String, Object> cfg = new LinkedHashMap<>();
        List<SystemConfigItem> items = notificationSettingsService.listConfigs(MODULE);
        for (SystemConfigItem item : items) {
            String key = item.getConfigKey();
            if (isBooleanSwitchKey(key)) {
                cfg.put(key, readBoolean(key, getDefaultForKey(key)));
            }
        }
        for (String key : new String[]{
                KEY_MASTER, KEY_SCAN_POPUP, KEY_PIN_ALTERNATIVE, KEY_DEBUG_PAGE, KEY_BASELINE_MGMT,
                KEY_ENROLL_STRICT, KEY_VERIFY_PREFETCH_ENABLED
        }) {
            cfg.putIfAbsent(key, readBoolean(key, getDefaultForKey(key)));
        }
        return cfg;
    }

    public com.example.demo.modules.facerecognition.dto.FaceLivenessConfigDTO getLivenessConfig() {
        return new com.example.demo.modules.facerecognition.dto.FaceLivenessConfigDTO(
                readBoolean(KEY_VERIFY_LIVENESS_BLINK, defaultVerifyBlinkEnabled),
                readBoolean(KEY_VERIFY_LIVENESS_TURN, defaultVerifyTurnEnabled),
                readInt(KEY_VERIFY_LIVENESS_TURN_HOLD_MS, defaultVerifyTurnHoldMs, 0, 30_000),
                readBoolean(KEY_ENROLL_LIVENESS_BLINK, defaultEnrollBlinkEnabled),
                readBoolean(KEY_ENROLL_LIVENESS_TURN_LEFT, defaultEnrollTurnLeftEnabled),
                readBoolean(KEY_ENROLL_LIVENESS_TURN_RIGHT, defaultEnrollTurnRightEnabled),
                readInt(KEY_ENROLL_LIVENESS_TURN_HOLD_MS, defaultEnrollTurnHoldMs, 0, 30_000),
                readInt(KEY_ENROLL_HOLD_STILL_SECONDS, defaultEnrollHoldStillSeconds, 1, 30)
        );
    }

    public com.example.demo.modules.facerecognition.dto.FaceEnrollStrictConfigDTO getEnrollStrictConfig() {
        return new com.example.demo.modules.facerecognition.dto.FaceEnrollStrictConfigDTO(
                readThreshold(KEY_ENROLL_STRICT_PAIR_MIN, defaultEnrollStrictPairMinSim),
                readInt(KEY_ENROLL_STRICT_MIN_COUNT, defaultEnrollStrictMinCountAbovePair, 2, 6),
                readThreshold(KEY_ENROLL_STRICT_MAX_PAIR, defaultEnrollStrictMaxPairSim),
                readThreshold(KEY_ENROLL_STRICT_TOP2_AVG, defaultEnrollStrictTop2AvgMin)
        );
    }

    public com.example.demo.modules.facerecognition.dto.FaceVerifyPrefetchConfigDTO getVerifyPrefetchConfig() {
        return new com.example.demo.modules.facerecognition.dto.FaceVerifyPrefetchConfigDTO(
                readBoolean(KEY_VERIFY_PREFETCH_ENABLED, defaultVerifyPrefetchEnabled),
                readInt(KEY_VERIFY_PREFETCH_INTERVAL_MS, defaultVerifyPrefetchIntervalMs, 400, 5_000),
                readThreshold(KEY_VERIFY_PRE_LIVENESS_REJECT, defaultPreLivenessRejectThreshold)
        );
    }

    public double getVerifyMatchThreshold() {
        return getVerifyMatchThreshold(null);
    }

    public double getVerifyMatchThreshold(String source) {
        String normalized = normalizeSource(source);
        if ("pip".equals(normalized)) {
            if (hasDbValue(KEY_MATCH_PIP)) {
                return readThreshold(KEY_MATCH_PIP, envDefaultMatchThresholdPip);
            }
            return envDefaultMatchThresholdPip;
        }
        String specificKey = switch (normalized) {
            case "gate" -> KEY_MATCH_GATE;
            case "personal" -> KEY_MATCH_PERSONAL;
            default -> null;
        };
        if (specificKey != null && hasDbValue(specificKey)) {
            return readThreshold(specificKey, envDefaultMatchThreshold);
        }
        return readThreshold(KEY_MATCH, envDefaultMatchThreshold);
    }

    public double getVerifyRejectThreshold() {
        return getVerifyRejectThreshold(null);
    }

    public double getVerifyRejectThreshold(String source) {
        return readThreshold(KEY_REJECT, envDefaultRejectThreshold);
    }

    public Map<String, Object> getEnvThresholdConfig() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("matchThreshold", getVerifyMatchThreshold());
        out.put("rejectThreshold", getVerifyRejectThreshold());
        out.put("matchThresholdGate", getVerifyMatchThreshold("gate"));
        out.put("matchThresholdPersonal", getVerifyMatchThreshold("personal"));
        out.put("matchThresholdPip", getVerifyMatchThreshold("pip"));
        out.put("matchEnvVar", ENV_VERIFY_MATCH);
        out.put("rejectEnvVar", ENV_VERIFY_REJECT);
        out.put("modelVersion", FaceCompareService.MODEL_VERSION);
        out.put("requiresRestart", false);
        out.put("hotReload", true);
        out.put("note", "比对阈值可在本页配置项保存后立即生效；环境变量仅作首次 seed 默认值。");
        out.put("liveness", getLivenessConfig().toMap());
        out.put("enrollStrict", getEnrollStrictConfig().toMap());
        out.put("enrollStrictEnvVars", Map.of(
                "pairMinSim", "FACE_ENROLL_STRICT_PAIR_MIN_SIM",
                "minCountAbovePair", "FACE_ENROLL_STRICT_MIN_COUNT_ABOVE_PAIR",
                "maxPairSim", "FACE_ENROLL_STRICT_MAX_PAIR_SIM",
                "top2AvgMin", "FACE_ENROLL_STRICT_TOP2_AVG_MIN"
        ));
        out.put("verifyPrefetch", getVerifyPrefetchConfig().toMap());
        out.put("verifyPrefetchEnvVars", Map.of(
                "prefetchEnabled", "FACE_VERIFY_PREFETCH_ENABLED",
                "prefetchIntervalMs", "FACE_VERIFY_PREFETCH_INTERVAL_MS",
                "preLivenessRejectThreshold", "FACE_VERIFY_PRE_LIVENESS_REJECT_THRESHOLD"
        ));
        out.put("livenessEnvVars", Map.of(
                "verifyBlink", "FACE_VERIFY_LIVENESS_BLINK_ENABLED",
                "verifyTurn", "FACE_VERIFY_LIVENESS_TURN_ENABLED",
                "verifyTurnHoldMs", "FACE_VERIFY_LIVENESS_TURN_HOLD_MS",
                "enrollBlink", "FACE_ENROLL_LIVENESS_BLINK_ENABLED",
                "enrollTurnLeft", "FACE_ENROLL_LIVENESS_TURN_LEFT_ENABLED",
                "enrollTurnRight", "FACE_ENROLL_LIVENESS_TURN_RIGHT_ENABLED",
                "enrollTurnHoldMs", "FACE_ENROLL_LIVENESS_TURN_HOLD_MS",
                "enrollHoldStillSeconds", "FACE_ENROLL_HOLD_STILL_SECONDS"
        ));
        return out;
    }

    private boolean readBoolean(String key, String envDefault) {
        String raw = get(key, envDefault);
        return !"false".equalsIgnoreCase(String.valueOf(raw).trim());
    }

    private int readInt(String key, String envDefault, int min, int max) {
        String raw = get(key, envDefault);
        if (!StringUtils.hasText(raw)) {
            raw = envDefault;
        }
        try {
            int v = Integer.parseInt(raw.trim());
            return Math.max(min, Math.min(max, v));
        } catch (NumberFormatException ignored) {
            try {
                int v = Integer.parseInt(envDefault.trim());
                return Math.max(min, Math.min(max, v));
            } catch (NumberFormatException e) {
                return min;
            }
        }
    }

    private static String normalizeSource(String source) {
        if (!StringUtils.hasText(source)) {
            return "gate";
        }
        return source.trim().toLowerCase(Locale.ROOT);
    }

    private double readThreshold(String key, double envFallback) {
        String raw = get(key, null);
        if (!StringUtils.hasText(raw)) {
            return envFallback;
        }
        try {
            double v = Double.parseDouble(raw.trim());
            if (v >= 0 && v <= 1) {
                return v;
            }
        } catch (NumberFormatException ignored) {
        }
        return envFallback;
    }

    private boolean hasDbValue(String key) {
        return notificationSettingsService.listConfigs(MODULE).stream()
                .anyMatch(it -> key.equals(it.getConfigKey()) && StringUtils.hasText(it.getConfigValue()));
    }

    private static boolean isBooleanSwitchKey(String key) {
        if (key == null) return false;
        // face.master_enabled 与 face.scan_popup.enabled 等两种命名均视为布尔开关
        return key.endsWith("_enabled") || key.endsWith(".enabled");
    }

    private String getDefaultForKey(String key) {
        return switch (key) {
            case KEY_MASTER -> defaultMasterEnabled;
            case KEY_SCAN_POPUP -> defaultScanPopupEnabled;
            case KEY_PIN_ALTERNATIVE -> defaultPinAlternativeEnabled;
            case KEY_DEBUG_PAGE -> defaultDebugPageEnabled;
            case KEY_BASELINE_MGMT -> defaultBaselineMgmtEnabled;
            case KEY_ENROLL_STRICT -> defaultEnrollStrictEnabled;
            case KEY_MATCH -> String.valueOf(envDefaultMatchThreshold);
            case KEY_REJECT -> String.valueOf(envDefaultRejectThreshold);
            case KEY_MATCH_GATE, KEY_MATCH_PERSONAL, KEY_MATCH_PIP -> "";
            case KEY_VERIFY_LIVENESS_BLINK -> defaultVerifyBlinkEnabled;
            case KEY_VERIFY_LIVENESS_TURN -> defaultVerifyTurnEnabled;
            case KEY_VERIFY_LIVENESS_TURN_HOLD_MS -> defaultVerifyTurnHoldMs;
            case KEY_ENROLL_LIVENESS_BLINK -> defaultEnrollBlinkEnabled;
            case KEY_ENROLL_LIVENESS_TURN_LEFT -> defaultEnrollTurnLeftEnabled;
            case KEY_ENROLL_LIVENESS_TURN_RIGHT -> defaultEnrollTurnRightEnabled;
            case KEY_ENROLL_LIVENESS_TURN_HOLD_MS -> defaultEnrollTurnHoldMs;
            case KEY_ENROLL_HOLD_STILL_SECONDS -> defaultEnrollHoldStillSeconds;
            case KEY_ENROLL_STRICT_PAIR_MIN -> String.valueOf(defaultEnrollStrictPairMinSim);
            case KEY_ENROLL_STRICT_MIN_COUNT -> defaultEnrollStrictMinCountAbovePair;
            case KEY_ENROLL_STRICT_MAX_PAIR -> String.valueOf(defaultEnrollStrictMaxPairSim);
            case KEY_ENROLL_STRICT_TOP2_AVG -> String.valueOf(defaultEnrollStrictTop2AvgMin);
            case KEY_VERIFY_PREFETCH_ENABLED -> defaultVerifyPrefetchEnabled;
            case KEY_VERIFY_PREFETCH_INTERVAL_MS -> defaultVerifyPrefetchIntervalMs;
            case KEY_VERIFY_PRE_LIVENESS_REJECT -> String.valueOf(defaultPreLivenessRejectThreshold);
            default -> "false";
        };
    }

    private String get(String key, String defaultValue) {
        List<SystemConfigItem> items = notificationSettingsService.listConfigs(MODULE);
        Optional<String> db = items.stream()
                .filter(it -> key.equals(it.getConfigKey()))
                .map(SystemConfigItem::getConfigValue)
                .filter(StringUtils::hasText)
                .findFirst();
        if (db.isPresent()) {
            return db.get();
        }
        return defaultValue;
    }
}
