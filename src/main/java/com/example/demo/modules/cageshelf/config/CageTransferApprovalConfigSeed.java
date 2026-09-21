package com.example.demo.modules.cageshelf.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 转移审核的两条全局配置播种。
 *
 * <p>两条都写「定义行 + 运行值行」：设置中心按运行值行的 id 更新，
 * 只写定义不写运行值会让面板显示「配置项未初始化」而存不了（照 AnimalOrderCageConfigSeed）。
 */
@Component
@Order(136)
public class CageTransferApprovalConfigSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CageTransferApprovalConfigSeed.class);

    public static final String MODULE = "cage_owner_approval";
    /** 全局强制转移审核：开 = 任何人都不能关闭自己的转移审核开关。 */
    public static final String KEY_TRANSFER_FORCED = "transfer_approval_forced";
    /** 全局审核兽医名单（账号 id 的 JSON 数组，不分区域）。 */
    public static final String KEY_REVIEW_VET_IDS = "review_vet_account_ids";
    /**
     * 转移待审提醒的**二级**开关（笼架页设置中心）。
     *
     * <p>与 push-config 上 {@code CAGE_TRANSFER_REVIEW} 源的总控开关是两回事、两个值：
     * 总控管「有没有这个通知、发给谁之外还要加谁」，二级管「眼下要不要发」。
     * 判定是**级联**——两级都开才真的推。
     */
    public static final String KEY_REVIEW_NOTIFY_ENABLED = "transfer_review_notify_enabled";

    public static final String DEFAULT_TRANSFER_FORCED = "false";
    public static final String DEFAULT_REVIEW_VET_IDS = "[]";
    /** 默认开：不开的话上线即静默，问题不好发现。 */
    public static final String DEFAULT_REVIEW_NOTIFY_ENABLED = "true";

    private final JdbcTemplate jdbc;

    public CageTransferApprovalConfigSeed(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            def(KEY_TRANSFER_FORCED, "BOOLEAN", "强制开启转移审核",
                    "开启后所有人对自己转移审核开关的关闭都会被忽略，界面上置灰不可改。",
                    DEFAULT_TRANSFER_FORCED);
            def(KEY_REVIEW_VET_IDS, "STRING", "审核兽医名单",
                    "JSON 数组，存账号 id。转移审核「兽医」那一关只有名单里的人能签。与「指定兽医」（管健康异常通知）不是一回事。",
                    DEFAULT_REVIEW_VET_IDS);
            def(KEY_REVIEW_NOTIFY_ENABLED, "BOOLEAN", "转移审核通知",
                    "提交转移申请时给审核人推送待审提醒。这是二级开关：push-config 上 CAGE_TRANSFER_REVIEW 源的总控仍然独立生效，两级都开才真的推。",
                    DEFAULT_REVIEW_NOTIFY_ENABLED);
            log.info("[cage-transfer-approval-config] 转移审核配置就绪");
        } catch (Exception e) {
            log.warn("[cage-transfer-approval-config] 播种跳过: {}", e.getMessage());
        }
    }

    private void def(String key, String valueType, String labelZh, String description, String defaultValue) {
        try {
            Integer exists = jdbc.queryForObject(
                    "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                    Integer.class, MODULE, key);
            if (exists == null || exists == 0) {
                jdbc.update("""
                        INSERT INTO sys_system_config_def
                        (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
                        VALUES (?, ?, ?, ?, ?, NULL, ?, 0, 0, 0, NOW())
                        """,
                        MODULE, key, labelZh, description, valueType, defaultValue);
            }
            ensureRuntimeValue(key, defaultValue);
        } catch (Exception e) {
            log.warn("[cage-transfer-approval-config] 配置播种失败 {}: {}", key, e.getMessage());
        }
    }

    /** 设置中心按 id 更新值，缺运行值行时前端显示「配置项未初始化」无法保存，故幂等补行。 */
    private void ensureRuntimeValue(String configKey, String defaultValue) {
        try {
            Integer exists = jdbc.queryForObject(
                    "SELECT COUNT(1) FROM sys_system_config WHERE module = ? AND config_key = ?",
                    Integer.class, MODULE, configKey);
            if (exists != null && exists > 0) return;
            jdbc.update(
                    "INSERT INTO sys_system_config (module, config_key, config_value, update_time) VALUES (?, ?, ?, NOW())",
                    MODULE, configKey, defaultValue);
        } catch (Exception e) {
            log.warn("[cage-transfer-approval-config] 运行值播种失败 {}: {}", configKey, e.getMessage());
        }
    }
}
