package com.example.demo.modules.twin.dahua.service;

import com.alibaba.fastjson2.JSON;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class DahuaSwingRuleConfigService {
    private final JdbcTemplate jdbcTemplate;

    public DahuaSwingRuleConfigService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> getConfig() {
        String json = jdbcTemplate.query(
                "SELECT config_json FROM twin_dahua_rule_config WHERE id = 1",
                rs -> rs.next() ? rs.getString(1) : null
        );
        if (json == null || json.isBlank()) {
            return defaultConfig();
        }
        try {
            Map<String, Object> parsed = JSON.parseObject(json, Map.class);
            if (parsed == null) return defaultConfig();
            return mergeDefault(parsed);
        } catch (Exception ignore) {
            return defaultConfig();
        }
    }

    public void saveConfig(Map<String, Object> config) {
        Map<String, Object> normalized = mergeDefault(config == null ? new HashMap<>() : config);
        validateConfig(normalized);
        String json = JSON.toJSONString(normalized);
        int updated = jdbcTemplate.update(
                "UPDATE twin_dahua_rule_config SET config_json = ?, updated_at = NOW() WHERE id = 1",
                json
        );
        if (updated <= 0) {
            jdbcTemplate.update(
                    "INSERT INTO twin_dahua_rule_config (id, config_json, updated_at) VALUES (1, ?, NOW())",
                    json
            );
        }
    }

    private Map<String, Object> defaultConfig() {
        Map<String, Object> m = new HashMap<>();
        m.put("exitChannelCodes", new java.util.ArrayList<>());
        m.put("toggleChannelCodes", new java.util.ArrayList<>());
        m.put("activatedReswipeExitChannelCodes", new java.util.ArrayList<>());
        /** 方向无关激活门：不看 enterOrExit（1/2/null 都算），用于方向数据不可靠或双向均算在场的门 */
        m.put("directionAgnosticActivationChannelCodes", new java.util.ArrayList<>());
        m.put("autoExitDelaySeconds", 10);
        m.put("enterDebounceSeconds", 30);
        /** 刷离开门/激活后签退门：防抖秒数，默认不低于 enterDebounce；可单独配置 exitDebounceSeconds */
        m.put("exitDebounceSeconds", 60);
        m.put("activationExpireSeconds", 120);
        /** 配置项保留；当前引擎刷激活门后不再按本项/时限排程「激活后到期」自动离开 */
        m.put("requireOtherRoomSuccess", true);
        m.put("otherRoomWithinSeconds", 120);
        // 自动签退后：是否撤销大华联动权限并冻结卡；false=仅 ARO 离开（DahuaAutoSignoutService）
        m.put("autoRiskActionEnabled", true);
        /** Web 扫码弹窗：限制「进入/离开」按钮可用时段；false=不限制 */
        m.put("scanPopupEntryWindowEnabled", false);
        /** 每日重复时段，元素形如 {"startHm":"08:00","endHm":"18:00"}；可跨午夜如 22:00-06:00 */
        m.put("scanPopupEntryWindows", new java.util.ArrayList<>());
        /** Web 扫码离开：ARO 成功后延迟多少秒再执行大华回收 + 冻结物理卡；0=立即（兼容旧行为） */
        m.put("scanLeaveDahuaDeferSeconds", 0);
        return m;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mergeDefault(Map<String, Object> src) {
        Map<String, Object> out = defaultConfig();
        out.putAll(src);
        return out;
    }

    /** 排斥校验：方向无关激活门不得与签退门（exitChannelCodes ∪ activatedReswipeExitChannelCodes）重叠 */
    private void validateConfig(Map<String, Object> config) {
        List<String> agnostic = strList(config.get("directionAgnosticActivationChannelCodes"));
        Set<String> signoff = new LinkedHashSet<>();
        signoff.addAll(strList(config.get("exitChannelCodes")));
        signoff.addAll(strList(config.get("activatedReswipeExitChannelCodes")));
        Set<String> overlap = new LinkedHashSet<>(agnostic);
        overlap.retainAll(signoff);
        if (!overlap.isEmpty()) {
            throw new IllegalArgumentException("方向无关激活门不可与签退门重复：" + String.join(", ", overlap));
        }
    }

    @SuppressWarnings("unchecked")
    private List<String> strList(Object v) {
        List<String> out = new java.util.ArrayList<>();
        if (!(v instanceof List<?> list)) {
            return out;
        }
        for (Object item : list) {
            String s = item == null ? "" : String.valueOf(item).trim();
            if (!s.isBlank()) {
                out.add(s);
            }
        }
        return out;
    }
}

