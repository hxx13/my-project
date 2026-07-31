package com.example.demo.modules.facerecognition.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 人脸识别开关配置：总开关 + 下级开关。
 * 比对阈值默认来自环境变量，可在管理端热改（DB 优先于 ENV 默认值）。
 */
@Component
@Order(126)
public class FaceAuthConfigSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(FaceAuthConfigSeed.class);
    private static final String MODULE = "face";

    private final JdbcTemplate jdbcTemplate;

    @Value("${app.face.master-enabled:false}")
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

    @Value("${app.face.enroll-strict-pair-min-sim:0.72}")
    private double defaultEnrollStrictPairMinSim;

    @Value("${app.face.enroll-strict-min-count-above-pair:2}")
    private String defaultEnrollStrictMinCountAbovePair;

    @Value("${app.face.enroll-strict-max-pair-sim:0.82}")
    private double defaultEnrollStrictMaxPairSim;

    @Value("${app.face.enroll-strict-top2-avg-min:0.75}")
    private double defaultEnrollStrictTop2AvgMin;

    @Value("${app.face.verify-match-threshold:0.62}")
    private String defaultVerifyMatchThreshold;

    @Value("${app.face.verify-reject-threshold:0.48}")
    private String defaultVerifyRejectThreshold;

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

    @Value("${app.face.verify-prefetch-enabled:true}")
    private String defaultVerifyPrefetchEnabled;

    @Value("${app.face.verify-prefetch-interval-ms:900}")
    private String defaultVerifyPrefetchIntervalMs;

    @Value("${app.face.verify-pre-liveness-reject-threshold:0.55}")
    private double defaultPreLivenessRejectThreshold;

    public FaceAuthConfigSeed(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        ensureDef(MODULE, "face.master_enabled", "人脸识别总开关",
                "关闭后所有下级功能（验证/录入/调试）全部不可用", "BOOLEAN", null, defaultMasterEnabled, 0, 0, 0);
        ensureDef(MODULE, "face.scan_popup.enabled", "刷卡弹窗人脸验证",
                "刷卡后弹出 Dynamic Island 进行人脸比对", "BOOLEAN", null, defaultScanPopupEnabled, 0, 0, 0);
        ensureDef(MODULE, "face.pin_alternative.enabled", "PIN码替代人脸验证",
                "快捷业务入口可选择人脸识别代替 PIN 码", "BOOLEAN", null, defaultPinAlternativeEnabled, 0, 0, 0);
        ensureDef(MODULE, "face.debug_page.enabled", "人脸识别调试页",
                "后台 /admin/face-debug 调试页可用", "BOOLEAN", null, defaultDebugPageEnabled, 0, 0, 0);
        ensureDef(MODULE, "face.baseline_mgmt.enabled", "底库照片管理",
                "dahua-issue 页面的底库照片上传/删除功能", "BOOLEAN", null, defaultBaselineMgmtEnabled, 0, 0, 0);
        ensureDef(MODULE, "face.enroll_strict.enabled", "录入严模式（附加互配质检）",
                "开启后，在常规录入质检（正脸/睁眼/清晰/3~6张/帧间互配≥68%）之上，再校验入选照互配：≥min_count 张与其它照互配≥pair_min%，或全局最高互配≥max_pair% 且各张最高互配前两均值≥top2_avg%。阈值见本模块 face.enroll_strict.* 数值项；客户端 face-api 尺度，非路线 B 服务端余弦。", "BOOLEAN", null, defaultEnrollStrictEnabled, 0, 0, 0);

        ensureDef(MODULE, "face.enroll_strict.pair_min_sim", "严模式：单张与其它照互配下限",
                "0~1，客户端帧间相似度（ENV: FACE_ENROLL_STRICT_PAIR_MIN_SIM，默认 0.72）", "NUMBER", null, String.valueOf(defaultEnrollStrictPairMinSim), 0, 0, 0);
        ensureDef(MODULE, "face.enroll_strict.min_count_above_pair", "严模式：达标张数下限",
                "至少 N 张各自存在互配≥pair_min 的其它照（ENV: FACE_ENROLL_STRICT_MIN_COUNT_ABOVE_PAIR，默认 2）", "NUMBER", null, defaultEnrollStrictMinCountAbovePair, 0, 0, 0);
        ensureDef(MODULE, "face.enroll_strict.max_pair_sim", "严模式：全局最高互配下限",
                "0~1，与门禁 MATCH 参考线对齐（ENV: FACE_ENROLL_STRICT_MAX_PAIR_SIM，默认 0.82）", "NUMBER", null, String.valueOf(defaultEnrollStrictMaxPairSim), 0, 0, 0);
        ensureDef(MODULE, "face.enroll_strict.top2_avg_min", "严模式：各张最高互配前两均值下限",
                "0~1（ENV: FACE_ENROLL_STRICT_TOP2_AVG_MIN，默认 0.75）", "NUMBER", null, String.valueOf(defaultEnrollStrictTop2AvgMin), 0, 0, 0);

        ensureDef(MODULE, "face.verify.match_threshold", "全局比对通过阈值",
                "服务端余弦相似度 ≥ 此值判定通过（0~1，保存后立即生效）", "NUMBER", null, defaultVerifyMatchThreshold, 0, 0, 0);
        ensureDef(MODULE, "face.verify.reject_threshold", "全局比对拒绝阈值",
                "余弦相似度 < 此值立即拒绝（0~1，保存后立即生效）", "NUMBER", null, defaultVerifyRejectThreshold, 0, 0, 0);
        ensureDef(MODULE, "face.verify.match_threshold.gate", "门禁通过阈值（可选覆盖）",
                "留空则使用全局通过阈值；gate 来源验证专用", "NUMBER", null, "", 0, 0, 0);
        ensureDef(MODULE, "face.verify.match_threshold.personal", "个人中心通过阈值（可选覆盖）",
                "留空则使用全局通过阈值", "NUMBER", null, "", 0, 0, 0);
        ensureDef(MODULE, "face.verify.match_threshold.pip", "画中画通过阈值（可选覆盖）",
                "留空则使用全局通过阈值", "NUMBER", null, "", 0, 0, 0);

        ensureDef(MODULE, "face.verify.prefetch.enabled", "活体期间静默 Prefetch 比对",
                "开启后，活体挑战进行时正脸稳定帧静默提交 /api/face/verify（challengeAction=prefetch），积累通过次数；活体完成后若已达标则即时放行。ENV: FACE_VERIFY_PREFETCH_ENABLED", "BOOLEAN", null, defaultVerifyPrefetchEnabled, 0, 0, 0);
        ensureDef(MODULE, "face.verify.prefetch.interval_ms", "Prefetch 最小间隔（毫秒）",
                "活体期间两次静默比对的最小间隔（ENV: FACE_VERIFY_PREFETCH_INTERVAL_MS，默认 900）", "NUMBER", null, defaultVerifyPrefetchIntervalMs, 0, 0, 0);
        ensureDef(MODULE, "face.verify.pre_liveness_reject_threshold", "眨眼前早拒阈值",
                "0~1，活体未完成时若静默比对 sim 低于此值立即拒绝（灰区仍继续活体；ENV: FACE_VERIFY_PRE_LIVENESS_REJECT_THRESHOLD，默认 0.55）", "NUMBER", null, String.valueOf(defaultPreLivenessRejectThreshold), 0, 0, 0);

        ensureDef(MODULE, "face.verify.liveness.blink_enabled", "门禁验证要求眨眼",
                "关闭则验证时不做眨眼活体（ENV: FACE_VERIFY_LIVENESS_BLINK_ENABLED）", "BOOLEAN", null, defaultVerifyBlinkEnabled, 0, 0, 0);
        ensureDef(MODULE, "face.verify.liveness.turn_enabled", "门禁验证要求转头",
                "关闭则验证时不做转头活体（ENV: FACE_VERIFY_LIVENESS_TURN_ENABLED）", "BOOLEAN", null, defaultVerifyTurnEnabled, 0, 0, 0);
        ensureDef(MODULE, "face.verify.liveness.turn_hold_ms", "门禁转头保持时长（毫秒）",
                "0=侧脸到位即通过；>0 须保持该毫秒（ENV: FACE_VERIFY_LIVENESS_TURN_HOLD_MS）", "NUMBER", null, defaultVerifyTurnHoldMs, 0, 0, 0);

        ensureDef(MODULE, "face.enroll.liveness.blink_enabled", "录入要求眨眼",
                "ENV: FACE_ENROLL_LIVENESS_BLINK_ENABLED", "BOOLEAN", null, defaultEnrollBlinkEnabled, 0, 0, 0);
        ensureDef(MODULE, "face.enroll.liveness.turn_left_enabled", "录入要求左转头",
                "ENV: FACE_ENROLL_LIVENESS_TURN_LEFT_ENABLED", "BOOLEAN", null, defaultEnrollTurnLeftEnabled, 0, 0, 0);
        ensureDef(MODULE, "face.enroll.liveness.turn_right_enabled", "录入要求右转头",
                "ENV: FACE_ENROLL_LIVENESS_TURN_RIGHT_ENABLED", "BOOLEAN", null, defaultEnrollTurnRightEnabled, 0, 0, 0);
        ensureDef(MODULE, "face.enroll.liveness.turn_hold_ms", "录入转头保持时长（毫秒）",
                "ENV: FACE_ENROLL_LIVENESS_TURN_HOLD_MS", "NUMBER", null, defaultEnrollTurnHoldMs, 0, 0, 0);
        ensureDef(MODULE, "face.enroll.hold_still_seconds", "录入注视保持秒数",
                "ENV: FACE_ENROLL_HOLD_STILL_SECONDS", "NUMBER", null, defaultEnrollHoldStillSeconds, 0, 0, 0);

        log.info("[face-auth-config] 人脸识别开关已初始化 master={} scan_popup={} pin={} debug={} baseline={} enroll_strict={} | 阈值默认(ENV) match={} reject={} | 活体 verify_blink={} verify_turn={} turn_hold_ms={}",
                defaultMasterEnabled, defaultScanPopupEnabled, defaultPinAlternativeEnabled,
                defaultDebugPageEnabled, defaultBaselineMgmtEnabled, defaultEnrollStrictEnabled,
                defaultVerifyMatchThreshold, defaultVerifyRejectThreshold,
                defaultVerifyBlinkEnabled, defaultVerifyTurnEnabled, defaultVerifyTurnHoldMs);
    }

    private void ensureDef(String module, String configKey, String labelZh, String description,
                           String valueType, String optionsJson, String defaultValue,
                           int isSensitive, int requiresRestart, int isPublic) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                Integer.class, module, configKey);
        if (cnt != null && cnt > 0) {
            jdbcTemplate.update(
                    "UPDATE sys_system_config_def SET label_zh = ?, description = ?, value_type = ?, default_value = ? WHERE module = ? AND config_key = ?",
                    labelZh, description, valueType, defaultValue, module, configKey);
            return;
        }
        jdbcTemplate.update(
                "INSERT INTO sys_system_config_def (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public) VALUES (?,?,?,?,?,?,?,?,?,?)",
                module, configKey, labelZh, description, valueType, optionsJson, defaultValue,
                isSensitive, requiresRestart, isPublic);
    }
}
