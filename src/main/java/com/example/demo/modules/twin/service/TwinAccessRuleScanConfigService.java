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
 * 扫码门禁联动全局开关（表 {@code twin_access_rule_scan_config}）。
 * <ul>
 *   <li>{@code enter_dispatch_enabled} / {@code exit_dispatch_enabled}：大华 batch 下发 / 权限回收。</li>
 *   <li>{@code enter_unfreeze_enabled} / {@code exit_freeze_enabled}：物理卡解冻 / 冻结（与 dispatch 正交）。</li>
 * </ul>
 */
@Service
public class TwinAccessRuleScanConfigService {

    private static final int CONFIG_ID = 1;

    private final TwinAccessRuleScanConfigMapper mapper;

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

    private TwinAccessRuleScanConfigRow loadRow() {
        ensureRow();
        TwinAccessRuleScanConfigRow row = mapper.selectById(CONFIG_ID);
        if (row == null) {
            mapper.insertIgnoreDefault(CONFIG_ID);
            row = mapper.selectById(CONFIG_ID);
        }
        if (row == null) {
            row = new TwinAccessRuleScanConfigRow();
            row.setEnterDispatchEnabled(1);
            row.setExitDispatchEnabled(1);
            row.setEnterUnfreezeEnabled(1);
            row.setExitFreezeEnabled(1);
        }
        return row;
    }

    private static boolean flagOn(Integer v) {
        return v == null || v == 1;
    }

    public boolean isEnterDispatchEnabled() {
        return flagOn(loadRow().getEnterDispatchEnabled());
    }

    public boolean isExitDispatchEnabled() {
        return flagOn(loadRow().getExitDispatchEnabled());
    }

    public boolean isEnterUnfreezeEnabled() {
        return flagOn(loadRow().getEnterUnfreezeEnabled());
    }

    public boolean isExitFreezeEnabled() {
        return flagOn(loadRow().getExitFreezeEnabled());
    }

    public Map<String, Object> getConfigMap() {
        TwinAccessRuleScanConfigRow row = loadRow();
        Map<String, Object> m = new HashMap<>();
        m.put("enterDispatchEnabled", flagOn(row.getEnterDispatchEnabled()));
        m.put("exitDispatchEnabled", flagOn(row.getExitDispatchEnabled()));
        m.put("enterUnfreezeEnabled", flagOn(row.getEnterUnfreezeEnabled()));
        m.put("exitFreezeEnabled", flagOn(row.getExitFreezeEnabled()));
        m.put("updatedBy", row.getUpdatedBy());
        m.put("updatedAt", row.getUpdatedAt() != null ? row.getUpdatedAt().toString() : null);
        return m;
    }

    public Map<String, Object> saveConfig(
            boolean enterDispatchEnabled,
            boolean exitDispatchEnabled,
            boolean enterUnfreezeEnabled,
            boolean exitFreezeEnabled,
            String updatedBy) {
        ensureRow();
        mapper.updateConfig(
                CONFIG_ID,
                enterDispatchEnabled ? 1 : 0,
                exitDispatchEnabled ? 1 : 0,
                enterUnfreezeEnabled ? 1 : 0,
                exitFreezeEnabled ? 1 : 0,
                updatedBy != null ? updatedBy : "system"
        );
        return getConfigMap();
    }
}
