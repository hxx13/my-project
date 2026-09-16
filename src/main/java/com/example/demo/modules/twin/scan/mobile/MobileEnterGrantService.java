package com.example.demo.modules.twin.scan.mobile;

import com.example.demo.common.config.DebugToggleService;
import com.example.demo.modules.cageshelf.service.UserGroupNameResolver;
import com.example.demo.modules.notification.dto.UpdateSystemConfigRequest;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 移动端房间自助进入的灰度门控与名单。
 *
 * <p>生效优先级（高 → 低）：
 * <ol>
 *   <li><b>黑名单</b>（表里有记录且 enabled=0）→ 始终关闭</li>
 *   <li><b>白名单</b>（表里有记录且 enabled=1）→ 始终开启</li>
 *   <li><b>无记录</b> → 跟随全局「一键开关」（settings: integration/scan.mobile_enter_enabled）</li>
 * </ol>
 * 即白名单/黑名单都是「一键开关」的例外，不受它控制。
 *
 * <p>名单只存 canonical id：STAFF_* 先折算成 ARO 人员编号，保证「禁用一个人 = 他名下任意 id 都失效」。
 */
@Service
public class MobileEnterGrantService {

    private static final Logger log = LoggerFactory.getLogger(MobileEnterGrantService.class);

    private static final String MODULE = "integration";
    private static final String CONFIG_KEY = "scan.mobile_enter_enabled";

    private final JdbcTemplate jdbcTemplate;
    private final DebugToggleService debugToggleService;
    private final UserGroupNameResolver userGroupNameResolver;
    private final NotificationSettingsService notificationSettingsService;

    public MobileEnterGrantService(JdbcTemplate jdbcTemplate,
                                   DebugToggleService debugToggleService,
                                   UserGroupNameResolver userGroupNameResolver,
                                   NotificationSettingsService notificationSettingsService) {
        this.jdbcTemplate = jdbcTemplate;
        this.debugToggleService = debugToggleService;
        this.userGroupNameResolver = userGroupNameResolver;
        this.notificationSettingsService = notificationSettingsService;
    }

    /**
     * 纯逻辑门控：override 为 null 表示「不在任何名单里」，跟随全局一键开关。
     * 非 null 表示白名单(true)/黑名单(false)，优先级高于一键开关。
     */
    static boolean resolveVisible(boolean masterEnabled, Boolean override) {
        return override != null ? override : masterEnabled;
    }

    /** 该账号当前是否可见「进入」按钮。传任意形态 id（STAFF_ / ARO）皆可。 */
    public boolean isVisibleFor(String userId) {
        Boolean override = lookupOverride(userId);
        return resolveVisible(debugToggleService.isMobileEnterEnabled(), override);
    }

    /** 全局「一键开关」。 */
    public boolean isMasterEnabled() {
        return debugToggleService.isMobileEnterEnabled();
    }

    /** 写全局一键开关。走 settings 服务，写成功会触发 CredentialsChangedEvent → 缓存热刷新。 */
    public void setMasterEnabled(boolean enabled, String operatorId) {
        // listConfigs 会按 sys_system_config_def 自动播种缺失的配置行，因此这里必然拿得到 id
        List<SystemConfigItem> items = notificationSettingsService.listConfigs(MODULE);
        SystemConfigItem hit = items == null ? null : items.stream()
                .filter(i -> CONFIG_KEY.equals(i.getConfigKey()))
                .findFirst()
                .orElse(null);
        if (hit == null) {
            throw new IllegalStateException("配置项 " + CONFIG_KEY + " 未定义，请确认后端已完成启动播种");
        }
        UpdateSystemConfigRequest req = new UpdateSystemConfigRequest();
        req.setConfigValue(enabled ? "true" : "false");
        req.setRemark(hit.getRemark());
        if (!notificationSettingsService.updateConfig(hit.getId(), req, operatorId)) {
            throw new IllegalStateException("配置保存失败");
        }
    }

    /** 名单查询（enabled=true 取白名单，false 取黑名单，null 取全部）。 */
    public List<Map<String, Object>> list(Boolean enabled, String keyword) {
        StringBuilder sql = new StringBuilder(
                "SELECT user_id, enabled, updated_by, updated_at FROM mobile_enter_grant WHERE 1 = 1");
        List<Object> args = new ArrayList<>();
        if (enabled != null) {
            sql.append(" AND enabled = ?");
            args.add(enabled ? 1 : 0);
        }
        if (keyword != null && !keyword.isBlank()) {
            sql.append(" AND user_id LIKE ?");
            args.add("%" + keyword.trim() + "%");
        }
        sql.append(" ORDER BY updated_at DESC LIMIT 500");
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql.toString(), args.toArray());
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", r.get("user_id"));
            m.put("enabled", asBool(r.get("enabled")));
            m.put("updatedBy", r.get("updated_by"));
            m.put("updatedAt", r.get("updated_at") != null ? String.valueOf(r.get("updated_at")) : null);
            out.add(m);
        }
        return out;
    }

    public int countByEnabled(Boolean enabled) {
        String sql = enabled == null
                ? "SELECT COUNT(1) FROM mobile_enter_grant"
                : "SELECT COUNT(1) FROM mobile_enter_grant WHERE enabled = ?";
        try {
            Integer n = enabled == null
                    ? jdbcTemplate.queryForObject(sql, Integer.class)
                    : jdbcTemplate.queryForObject(sql, Integer.class, enabled ? 1 : 0);
            return n == null ? 0 : n;
        } catch (Exception e) {
            log.warn("[mobile-enter] 名单计数失败 err={}", e.getMessage());
            return 0;
        }
    }

    /** 批量写入名单：ids 中的全部置为 enabled（true=白名单，false=黑名单），其余保持不动。 */
    public int setEnabled(List<String> ids, boolean enabled, String operatorId) {
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        int n = 0;
        for (String raw : ids) {
            String canonical = canonical(raw);
            if (canonical == null || canonical.isBlank()) {
                continue;
            }
            jdbcTemplate.update("""
                    INSERT INTO mobile_enter_grant (user_id, enabled, updated_by)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_by = VALUES(updated_by)
                    """, canonical, enabled ? 1 : 0, operatorId);
            n++;
        }
        return n;
    }

    /** 移出名单（回到「跟随一键开关」）。 */
    public int removeGrants(List<String> ids) {
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        int n = 0;
        for (String raw : ids) {
            String canonical = canonical(raw);
            if (canonical == null || canonical.isBlank()) {
                continue;
            }
            n += jdbcTemplate.update("DELETE FROM mobile_enter_grant WHERE user_id = ?", canonical);
        }
        return n;
    }

    /** 名单覆盖：null=不在名单（跟随一键），true=白名单，false=黑名单。 */
    private Boolean lookupOverride(String userId) {
        String canonical = canonical(userId);
        if (canonical == null || canonical.isBlank()) {
            return null;
        }
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT enabled FROM mobile_enter_grant WHERE user_id = ?", canonical);
            if (rows.isEmpty()) {
                return null;
            }
            return asBool(rows.get(0).get("enabled"));
        } catch (Exception e) {
            // 表尚未迁移完成时按「未授权」处理（fail-closed）
            log.warn("[mobile-enter] 名单查询失败 userId={} err={}", canonical, e.getMessage());
            return Boolean.FALSE;
        }
    }

    /** TINYINT(1) 在 MariaDB 驱动下会映射成 Boolean，也可能是 Number，两种都吃。 */
    private static boolean asBool(Object v) {
        if (v instanceof Boolean b) {
            return b;
        }
        if (v instanceof Number n) {
            return n.intValue() != 0;
        }
        return v != null && "1".equals(String.valueOf(v).trim());
    }

    private String canonical(String userId) {
        try {
            return userGroupNameResolver.canonicalUserId(userId);
        } catch (Exception e) {
            log.warn("[mobile-enter] id 归一化失败 userId={} err={}", userId, e.getMessage());
            return userId;
        }
    }
}
