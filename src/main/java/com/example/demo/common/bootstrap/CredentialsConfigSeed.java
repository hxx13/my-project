package com.example.demo.common.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 将凭证与外部集成配置写入 sys_system_config_def，超级管理员可在「系统设置」中在线编辑。
 * 配置值由 NotificationSettingsService 惰性播种到 sys_system_config。
 */
@Component
@Order(110)
public class CredentialsConfigSeed implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(CredentialsConfigSeed.class);

    private final JdbcTemplate jdbcTemplate;

    public CredentialsConfigSeed(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            seedCredentials();
            seedIntegration();
        } catch (Exception e) {
            log.warn("[credentials] 配置定义初始化跳过（可能尚未创建 sys_system_config_def 表）: {}", e.getMessage());
        }
    }

    private void seedCredentials() {
        // ---- 大华门禁 API ----
        def("credentials", "dahua.base_url", "大华 API 基址",
                "大华门禁管理平台 OpenAPI 地址", "STRING", null,
                "https://172.22.161.200", 0, 0, 0);
        def("credentials", "dahua.client_id", "大华 OAuth Client ID",
                "大华 API OAuth 应用标识", "STRING", null,
                "client_id", 0, 0, 0);
        def("credentials", "dahua.client_secret", "大华 OAuth Client Secret",
                "大华 API OAuth 密钥", "STRING", null,
                "", 1, 0, 0);
        def("credentials", "dahua.username", "大华登录用户名",
                "大华门禁平台登录账号", "STRING", null,
                "", 0, 0, 0);
        def("credentials", "dahua.password", "大华登录密码",
                "大华门禁平台登录密码", "STRING", null,
                "", 1, 0, 0);

        // ---- ARO 实验动物系统 ----
        def("credentials", "aro.account", "ARO 登录账号",
                "ARO 实验动物管理系统登录手机号", "STRING", null,
                "", 0, 0, 0);
        def("credentials", "aro.password", "ARO 登录密码",
                "ARO 实验动物管理系统登录密码", "STRING", null,
                "", 1, 0, 0);

        // ---- WinCC 温湿度遥测 ----
        def("credentials", "wincc.username", "WinCC 登录用户名",
                "WinCC REST 接口登录账号", "STRING", null,
                "admin", 0, 0, 0);
        def("credentials", "wincc.password", "WinCC 登录密码",
                "WinCC REST 接口登录密码", "STRING", null,
                "", 1, 0, 0);

        // ---- 安全杂项 ----
        def("credentials", "invite_code_pepper", "邀请码哈希 Pepper",
                "注册推荐码 SHA-256 加盐值，泄露后需轮换", "STRING", null,
                "", 1, 0, 0);
        def("credentials", "mp.proxy_secret", "小程序云函数 Proxy Secret",
                "与云函数环境变量 PROXY_SHARED_SECRET 一致，留空不校验", "STRING", null,
                "", 1, 0, 0);
    }

    private void seedIntegration() {
        String boolOpts = "[\"true\",\"false\"]";

        // ---- WinCC 遥测 ----
        def("integration", "wincc.enabled", "启用 WinCC 遥测",
                "关闭后不连接 WinCC，GET /api/v1/telemetry/wincc/snapshot 返回未启用说明", "BOOLEAN", boolOpts,
                "true", 0, 0, 0);
        def("integration", "wincc.base_url", "WinCC REST 基址",
                "WinCC 服务器 HTTPS 地址，如 https://CLIENT-01:8080", "STRING", null,
                "https://CLIENT-01:8080", 0, 0, 0);
        def("integration", "wincc.ssl_insecure", "WinCC 跳过 SSL 校验",
                "WinCC 使用自签证书时设为 true；正式受信证书改为 false", "BOOLEAN", boolOpts,
                "true", 0, 0, 0);
        def("integration", "wincc.refresh_interval_ms", "WinCC 刷新间隔 (ms)",
                "后台刷新内存快照间隔，全量点数多时建议 60000~120000", "NUMBER", null,
                "60000", 0, 0, 0);

        // ---- 大华 ----
        def("integration", "dahua.ssl_insecure", "大华跳过 SSL 校验",
                "大华使用自签证书时设为 true", "BOOLEAN", boolOpts,
                "true", 0, 0, 0);

        // ---- 扫码与调试 ----
        def("integration", "access_rule_dahua_debug", "门禁规则大华联动调试",
                "开启后控制台输出大华权限联动详细日志", "BOOLEAN", boolOpts,
                "true", 0, 0, 0);
        def("integration", "scan.analyze_timing_console", "扫码分析耗时打印",
                "排查慢接口时开启，稳定后可关", "BOOLEAN", boolOpts,
                "true", 0, 0, 0);
        def("integration", "scan.analyze_timing_console_min_ms", "耗时打印最低毫秒",
                "非 ARO 步骤低于此毫秒不打印分段/汇总行（默认 300）", "NUMBER", null,
                "300", 0, 0, 0);

        // ---- 头像代理 ----
        def("integration", "personnel_avatar_proxy.insecure_tls", "头像代理跳过 TLS 校验",
                "仅建议在隔离环境短期使用", "BOOLEAN", boolOpts,
                "false", 0, 0, 0);

        // ---- 遥测归档 ----
        def("integration", "telemetry.archive.enabled", "启用遥测归档",
                "WinCC 刷新成功后异步写入 telemetry_value_archive", "BOOLEAN", boolOpts,
                "true", 0, 0, 0);

        // ---- 对外访问 ----
        def("integration", "public_base_url", "对外可访问基址",
                "用于生成绝对下载链接，如 http://192.168.1.10:8080", "STRING", null,
                "", 0, 0, 0);

        // ---- 分析数据源 ----
        def("integration", "analytics.isolation.data_source", "隔离服统计门禁数据源",
                "cleaned=清洗后门禁数据, aro=ARO 原始数据", "STRING",
                "[\"access_package\",\"aro\"]",
                "access_package", 0, 0, 0);
    }

    private void def(String module, String configKey, String labelZh, String description,
                     String valueType, String optionsJson, String defaultValue,
                     int isSensitive, int requiresRestart, int isPublic) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                Integer.class, module, configKey);
        if (cnt != null && cnt > 0) {
            return;
        }
        jdbcTemplate.update("""
                        INSERT INTO sys_system_config_def
                        (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                        """,
                module, configKey, labelZh, description, valueType, optionsJson, defaultValue,
                isSensitive, requiresRestart, isPublic);
        log.info("[{}] 已插入配置定义: {}.{}", module, module, configKey);
    }
}
