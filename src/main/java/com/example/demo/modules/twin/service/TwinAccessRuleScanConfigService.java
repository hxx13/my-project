package com.example.demo.modules.twin.service;

import com.example.demo.modules.twin.config.TwinAccessRuleScanConfigSchemaMigrator;
import com.example.demo.modules.twin.entity.TwinAccessRuleScanConfigRow;
import com.example.demo.modules.twin.mapper.TwinAccessRuleScanConfigMapper;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/**
 * 扫码门禁「大华 HTTP 派发」全局开关（表 {@code twin_access_rule_scan_config}）。
 * <ul>
 *   <li>{@code enter_dispatch_enabled}：仅控制进入时是否调用大华 batch 下发；不控制 ARO 登记、不控制「待激活」联动计时起算、不控制本地物理卡解冻。</li>
 *   <li>{@code exit_dispatch_enabled}：仅控制离开时是否调用大华权限回收接口；不控制 ARO 离开登记、不控制自动签退后的本地冻结（见 {@link com.example.demo.modules.twin.service.DahuaAutoSignoutService}）。</li>
 * </ul>
 */
@Service
public class TwinAccessRuleScanConfigService {

    private static final int CONFIG_ID = 1;

    private final TwinAccessRuleScanConfigMapper mapper;

    /**
     * 依赖 {@link TwinAccessRuleScanConfigSchemaMigrator} 以保证其 {@code @PostConstruct} 先执行并完成建表。
     */
    public TwinAccessRuleScanConfigService(
            TwinAccessRuleScanConfigMapper mapper,
            TwinAccessRuleScanConfigSchemaMigrator schemaMigrator) {
        this.mapper = mapper;
        Objects.requireNonNull(schemaMigrator, "schema migrator");
    }

    @PostConstruct
    public void ensureDefaultRow() {
        mapper.insertIgnoreDefault(CONFIG_ID);
    }

    public void ensureRow() {
        mapper.insertIgnoreDefault(CONFIG_ID);
    }

    public boolean isEnterDispatchEnabled() {
        ensureRow();
        TwinAccessRuleScanConfigRow row = mapper.selectById(CONFIG_ID);
        return row == null || row.getEnterDispatchEnabled() == null || row.getEnterDispatchEnabled() == 1;
    }

    public boolean isExitDispatchEnabled() {
        ensureRow();
        TwinAccessRuleScanConfigRow row = mapper.selectById(CONFIG_ID);
        return row == null || row.getExitDispatchEnabled() == null || row.getExitDispatchEnabled() == 1;
    }

    public Map<String, Object> getConfigMap() {
        ensureRow();
        TwinAccessRuleScanConfigRow row = mapper.selectById(CONFIG_ID);
        Map<String, Object> m = new HashMap<>();
        boolean enter = row == null || row.getEnterDispatchEnabled() == null || row.getEnterDispatchEnabled() == 1;
        boolean exit = row == null || row.getExitDispatchEnabled() == null || row.getExitDispatchEnabled() == 1;
        m.put("enterDispatchEnabled", enter);
        m.put("exitDispatchEnabled", exit);
        m.put("updatedBy", row != null ? row.getUpdatedBy() : null);
        m.put("updatedAt", row != null && row.getUpdatedAt() != null ? row.getUpdatedAt().toString() : null);
        return m;
    }

    public Map<String, Object> saveConfig(boolean enterDispatchEnabled, boolean exitDispatchEnabled, String updatedBy) {
        ensureRow();
        mapper.updateConfig(
                CONFIG_ID,
                enterDispatchEnabled ? 1 : 0,
                exitDispatchEnabled ? 1 : 0,
                updatedBy != null ? updatedBy : "system"
        );
        return getConfigMap();
    }
}
