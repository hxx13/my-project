package com.example.demo.modules.site;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class SiteBrandingService {

    private static final Logger log = LoggerFactory.getLogger(SiteBrandingService.class);

    public static final String CONFIG_KEY_LOGIN = "login_branding";
    private static final String CONFIG_ROW_ID = "cfg_login_branding";

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public SiteBrandingService(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> getLoginBrandingPublic() {
        List<String> rows;
        try {
            rows = jdbc.query(
                    "SELECT config_value_json FROM sys_site_config WHERE config_key = ? LIMIT 1",
                    (rs, i) -> rs.getString(1),
                    CONFIG_KEY_LOGIN
            );
        } catch (BadSqlGrammarException ex) {
            // 缺表时降级：避免公开登录页 500；须执行 scripts/login_branding_invite_chat.ddl.sql（见 scripts/DEPLOY_DDL.md）
            log.warn("[site-branding] sys_site_config 不可用，使用默认轮播: {}", ex.getMessage());
            return defaults();
        }
        if (rows.isEmpty() || !StringUtils.hasText(rows.get(0))) {
            return defaults();
        }
        try {
            JsonNode root = objectMapper.readTree(rows.get(0));
            List<String> urls = new ArrayList<>();
            if (root.has("heroImageUrls") && root.get("heroImageUrls").isArray()) {
                for (JsonNode n : root.get("heroImageUrls")) {
                    if (n.isTextual() && StringUtils.hasText(n.asText())) {
                        urls.add(n.asText().trim());
                    }
                }
            }
            int interval = root.has("intervalSec") && root.get("intervalSec").isInt() ? Math.max(3, root.get("intervalSec").asInt()) : 8;
            boolean heroCarouselEnabled = readHeroCarouselEnabled(root);
            Map<String, Object> out = new HashMap<>();
            out.put("heroImageUrls", urls);
            out.put("intervalSec", interval);
            out.put("heroCarouselEnabled", heroCarouselEnabled);
            return out;
        } catch (Exception e) {
            return defaults();
        }
    }

    private Map<String, Object> defaults() {
        Map<String, Object> out = new HashMap<>();
        out.put("heroImageUrls", List.of(
                "https://www.shsmu.edu.cn/images/0b4897a73b135d90d9689a0eab3da1e3.jpg",
                "https://www.shsmu.edu.cn/images/cc9c553dd78d0556312c0599c39395912026.jpg"
        ));
        out.put("intervalSec", 8);
        out.put("heroCarouselEnabled", true);
        return out;
    }

    private static boolean readHeroCarouselEnabled(JsonNode root) {
        if (root == null || !root.has("heroCarouselEnabled") || root.get("heroCarouselEnabled").isNull()) {
            return true;
        }
        JsonNode n = root.get("heroCarouselEnabled");
        if (n.isBoolean()) {
            return n.booleanValue();
        }
        if (n.isIntegralNumber()) {
            return n.intValue() != 0;
        }
        if (n.isTextual()) {
            return Boolean.parseBoolean(n.asText().trim());
        }
        return true;
    }

    public void upsertLoginBranding(List<String> heroImageUrls, Integer intervalSec, Boolean heroCarouselEnabled) throws Exception {
        ObjectNode root = objectMapper.createObjectNode();
        ArrayNode arr = root.putArray("heroImageUrls");
        for (String u : heroImageUrls) {
            if (StringUtils.hasText(u)) {
                arr.add(u.trim());
            }
        }
        int iv = intervalSec == null ? 8 : Math.max(3, intervalSec);
        root.put("intervalSec", iv);
        root.put("heroCarouselEnabled", heroCarouselEnabled == null || heroCarouselEnabled);
        String json = objectMapper.writeValueAsString(root);
        jdbc.update(
                "INSERT INTO sys_site_config(id, config_key, config_value_json) VALUES(?,?,?) "
                        + "ON DUPLICATE KEY UPDATE config_value_json = VALUES(config_value_json), update_time = CURRENT_TIMESTAMP",
                CONFIG_ROW_ID, CONFIG_KEY_LOGIN, json
        );
    }
}
