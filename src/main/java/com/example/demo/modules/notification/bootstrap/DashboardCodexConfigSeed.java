package com.example.demo.modules.notification.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 为主页「标准还卡 / 惩戒 / 公告」卡片写入 sys_system_config_def（若不存在）；并清理已下线的扫码弹窗公告模块数据。
 * 配置值对前端公开（is_public=1），超级管理员可在「系统设置」中按模块 dashboard_codex 编辑。
 */
@Component
@Order(120)
public class DashboardCodexConfigSeed implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DashboardCodexConfigSeed.class);

    private final JdbcTemplate jdbcTemplate;

    public DashboardCodexConfigSeed(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.title",
                    "卡片总标题",
                    "显示在主页右侧说明卡片顶部",
                    "STRING",
                    null,
                    "标准还卡与违规惩戒说明",
                    0,
                    0,
                    1
            );
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.hours_label",
                    "时段小标题",
                    "例如：标准还卡时段",
                    "STRING",
                    null,
                    "标准还卡时段",
                    0,
                    0,
                    1
            );
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.start_time",
                    "开始时间",
                    "24 小时制，如 08:00",
                    "STRING",
                    null,
                    "08:00",
                    0,
                    0,
                    1
            );
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.end_time",
                    "结束时间",
                    "24 小时制，如 17:30",
                    "STRING",
                    null,
                    "17:30",
                    0,
                    0,
                    1
            );
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.return_rules",
                    "还卡规则正文",
                    "支持换行；可写多条说明。将按原样排版显示。",
                    "STRING",
                    null,
                    "每天早 8:00—晚 5:30 为卡片使用时间。超时未还卡可能导致无法退出登录或权限受限，需联系老师解封；如需延长使用请提前沟通。",
                    0,
                    0,
                    1
            );
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.discipline_title",
                    "惩戒区块标题",
                    "例如：违规惩戒",
                    "STRING",
                    null,
                    "违规惩戒",
                    0,
                    0,
                    1
            );
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.discipline_body",
                    "惩戒说明正文",
                    "支持换行。",
                    "STRING",
                    null,
                    "视情节可暂停实验动物科学部饲养室使用权限，具体以管理部门认定为准。",
                    0,
                    0,
                    1
            );
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.notice_title",
                    "公告区块标题",
                    "例如：公告与通知",
                    "STRING",
                    null,
                    "公告与通知",
                    0,
                    0,
                    1
            );
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.notice_body",
                    "公告正文",
                    "用于发布临时通知、放假安排等；支持换行与简单分段。",
                    "STRING",
                    null,
                    "（在此填写最新公告。可在「系统设置 → 主页公告/还卡说明」模块中编辑。）",
                    0,
                    0,
                    1
            );
            String scaleOptions = "[\"sm\",\"md\",\"lg\",\"xl\"]";
            String inheritScaleOptions = "[\"inherit\",\"sm\",\"md\",\"lg\",\"xl\"]";
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.title_font_scale",
                    "标题字号档位",
                    "可选 sm/md/lg/xl：控制卡片最上方总标题大小（sm 最小，xl 最大）。",
                    "STRING",
                    scaleOptions,
                    "lg",
                    0,
                    0,
                    1
            );
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.notice_font_scale",
                    "公告区字号档位",
                    "可选 sm/md/lg/xl：控制「公告与通知」标题与正文字号（建议 xl 便于阅读）。",
                    "STRING",
                    scaleOptions,
                    "xl",
                    0,
                    0,
                    1
            );
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.footer_font_scale",
                    "底部说明字号档位（默认）",
                    "可选 sm/md/lg/xl：同时作用于两个底部区块；若配置了「时段/惩戒独立字号」则各自覆盖。",
                    "STRING",
                    scaleOptions,
                    "md",
                    0,
                    0,
                    1
            );
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.footer_hours_font_scale",
                    "标准还卡区块字号",
                    "inherit=沿用「底部说明字号档位」；否则仅作用于「标准还卡时段」卡片内标题、时间与规则正文。",
                    "STRING",
                    inheritScaleOptions,
                    "inherit",
                    0,
                    0,
                    1
            );
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.footer_discipline_font_scale",
                    "违规惩戒区块字号",
                    "inherit=沿用「底部说明字号档位」；否则仅作用于「违规惩戒」卡片。",
                    "STRING",
                    inheritScaleOptions,
                    "inherit",
                    0,
                    0,
                    1
            );
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.notice_card_scale",
                    "公告区卡片大小",
                    "可选 sm/md/lg/xl：控制「公告与通知」外框的内边距与区块间距（xl 最宽松）；正文在卡片内滚动，不占满视口。",
                    "STRING",
                    scaleOptions,
                    "md",
                    0,
                    0,
                    1
            );
            ensureDef(
                    "dashboard_codex",
                    "dashboard.codex.footer_card_scale",
                    "底部两栏卡片大小",
                    "可选 sm/md/lg/xl：控制标准还卡时段、违规惩戒两个区块的内边距、圆角与区块间距（xl 最宽松）。",
                    "STRING",
                    scaleOptions,
                    "md",
                    0,
                    0,
                    1
            );

            purgeScannerPopupNoticeModule();
        } catch (Exception e) {
            log.warn("[dashboard_codex] 配置定义初始化跳过（可能尚未创建 sys_system_config_def 表）: {}", e.getMessage());
        }
    }

    /**
     * 扫码弹窗公告功能已下线：删除模块下全部配置值与定义（含历史 primaryButtonLabel 等）。
     */
    private void purgeScannerPopupNoticeModule() {
        try {
            int cfg = jdbcTemplate.update("DELETE FROM sys_system_config WHERE module = ?", "scanner_popup_notice");
            int def = jdbcTemplate.update("DELETE FROM sys_system_config_def WHERE module = ?", "scanner_popup_notice");
            if (cfg > 0 || def > 0) {
                log.info("[dashboard_codex] 已清除扫码弹窗公告模块: sys_system_config {} 条, sys_system_config_def {} 条", cfg, def);
            }
        } catch (Exception e) {
            log.warn("[dashboard_codex] 清除扫码弹窗公告模块跳过: {}", e.getMessage());
        }
    }

    private void ensureDef(
            String module,
            String configKey,
            String labelZh,
            String description,
            String valueType,
            String optionsJson,
            String defaultValue,
            int isSensitive,
            int requiresRestart,
            int isPublic
    ) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                Integer.class,
                module,
                configKey
        );
        if (cnt != null && cnt > 0) {
            return;
        }
        jdbcTemplate.update(
                """
                        INSERT INTO sys_system_config_def
                        (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                        """,
                module,
                configKey,
                labelZh,
                description,
                valueType,
                optionsJson,
                defaultValue,
                isSensitive,
                requiresRestart,
                isPublic
        );
        log.info("[dashboard_codex] 已插入配置定义: {}.{}", module, configKey);
    }
}
