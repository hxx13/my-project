package com.example.demo.modules.cageshelf.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * cage_claim 历史配置清理（退役专用，幂等且只做删除）。
 *
 * <p>历史上本类负责播种「认领/分笼/转移」的全局开关定义。这些开关现已改为**按所属人**持久化
 * （表 cage_owner_approval_config，见 {@code CageOwnerApprovalConfigService}）：判定不再读全局配置。
 *
 * <p>之所以还要留着这段删除逻辑：老环境的 sys_system_config_def 里仍留有这些定义，而设置中心是
 * schema 驱动渲染的 —— 不删掉就会继续显示一个「改了没有任何效果」的开关。
 *
 * <p>⚠ 若将来要在 cage_claim 模块重新加同名全局配置，请先删掉本类，否则会被这里每次启动清掉。
 * 等所有环境都完成迁移后，本类可整体删除。
 */
@Component
@Order(131)
public class CageClaimConfigSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CageClaimConfigSeed.class);

    /** 已退役的全局配置键：定义与运行值都要清掉。 */
    private static final String[] RETIRED_KEYS = {
        // 早期开发期的「假配置」——从未有对应需求
        "cage.claim.approval_mode",
        "cage.release.approval_mode",
        "cage.transfer.approval_mode",
        "cage.claim.approval_timeout_hours",
        "cage.claim.confirm_timeout_hours",
        "cage.claim.reject_cooldown_minutes",
        "cage.claim.max_reject_count",
        // 三个开关迁移到按所属人后退役
        "cage.claim.confirm_required",
        "cage.claim.student_divide_approval_required",
        "cage.claim.student_transfer_approval_required",
        "cage.claim.student_op_approval_required",
    };

    private final JdbcTemplate jdbc;

    public CageClaimConfigSeed(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            for (String key : RETIRED_KEYS) {
                jdbc.update("DELETE FROM sys_system_config_def WHERE module = 'cage_claim' AND config_key = ?", key);
                jdbc.update("DELETE FROM sys_system_config WHERE module = 'cage_claim' AND config_key = ?", key);
            }
            log.info("[cage-claim-config] 已清理 {} 个退役全局配置键", RETIRED_KEYS.length);
        } catch (Exception e) {
            log.warn("[cage-claim-config] 清理跳过: {}", e.getMessage());
        }
    }
}
