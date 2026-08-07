package com.example.demo.modules.site;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class SiteConfigJdbcRepository {

    private static final String LOGIN_BRANDING_KEY = "login_branding";
    private static final String DASH_PREVIEW_KEY = "dashboard_preview";
    private static final String PORTAL_FOOTER_KEY = "portal_footer";

    private final JdbcTemplate jdbc;

    public SiteConfigJdbcRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<String> findJsonByKey(String configKey) {
        List<String> rows = jdbc.query(
                "SELECT config_value_json FROM sys_site_config WHERE config_key = ? LIMIT 1",
                (rs, i) -> rs.getString(1),
                configKey
        );
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        String v = rows.get(0);
        return v == null || v.isBlank() ? Optional.empty() : Optional.of(v);
    }

    public Optional<String> findLoginBrandingJson() {
        return findJsonByKey(LOGIN_BRANDING_KEY);
    }

    public void upsertLoginBrandingJson(String json) {
        upsertJson(LOGIN_BRANDING_KEY, "cfg_login_branding", json);
    }

    public Optional<String> findDashboardPreviewJson() {
        return findJsonByKey(DASH_PREVIEW_KEY);
    }

    public void upsertDashboardPreviewJson(String json) {
        upsertJson(DASH_PREVIEW_KEY, "cfg_dashboard_preview", json);
    }

    public Optional<String> findPortalFooterJson() {
        return findJsonByKey(PORTAL_FOOTER_KEY);
    }

    public void upsertPortalFooterJson(String json) {
        upsertJson(PORTAL_FOOTER_KEY, "cfg_portal_footer", json);
    }

    private void upsertJson(String configKey, String id, String json) {
        jdbc.update(
                """
                INSERT INTO sys_site_config (id, config_key, config_value_json)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE config_value_json = VALUES(config_value_json)
                """,
                id,
                configKey,
                json
        );
    }
}
