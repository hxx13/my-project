package com.example.demo.modules.notification.service;

import com.example.demo.modules.notification.dto.UpdateNotifyRuleRequest;
import com.example.demo.modules.notification.dto.UpdateNotifyTemplateRequest;
import com.example.demo.modules.notification.dto.UpdateSystemConfigRequest;
import com.example.demo.modules.notification.dto.SettingDefinitionView;
import com.example.demo.modules.notification.entity.NotifyRule;
import com.example.demo.modules.notification.entity.NotifyTemplate;
import com.example.demo.modules.notification.entity.SystemConfigDefinition;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.mapper.NotificationSettingsMapper;
import com.example.demo.modules.telemetry.service.TelemetryFacilityLayoutRulesService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.*;

@Service
public class NotificationSettingsService {
    private final NotificationSettingsMapper settingsMapper;
    private final TelemetryFacilityLayoutRulesService telemetryFacilityLayoutRulesService;

    public NotificationSettingsService(NotificationSettingsMapper settingsMapper,
                                       TelemetryFacilityLayoutRulesService telemetryFacilityLayoutRulesService) {
        this.settingsMapper = settingsMapper;
        this.telemetryFacilityLayoutRulesService = telemetryFacilityLayoutRulesService;
    }

    public List<NotifyRule> listRules() {
        return settingsMapper.listRules();
    }

    public List<NotifyTemplate> listTemplates() {
        return settingsMapper.listTemplates();
    }

    public List<SystemConfigItem> listConfigs(String module) {
        List<SystemConfigDefinition> defs = settingsMapper.listConfigDefinitionsByModule(module);
        List<SystemConfigItem> items = settingsMapper.listConfigsByModule(module);
        Set<String> existingKeys = new HashSet<>(items.stream().map(SystemConfigItem::getConfigKey).toList());
        for (SystemConfigDefinition def : defs) {
            if (existingKeys.contains(def.getConfigKey())) {
                continue;
            }
            SystemConfigItem item = new SystemConfigItem();
            item.setModule(def.getModule());
            item.setConfigKey(def.getConfigKey());
            item.setConfigValue(def.getDefaultValue());
            item.setValueType(def.getValueType());
            item.setRemark(def.getDescription());
            try {
                settingsMapper.insertConfigItem(item);
            } catch (Exception ignored) {
                // Ignore duplicate inserts caused by concurrent requests.
            }
        }
        return settingsMapper.listConfigsByModule(module);
    }

    public boolean updateRule(Long id, UpdateNotifyRuleRequest request) {
        NotifyRule current = settingsMapper.findRuleById(id);
        if (current == null || request == null) return false;
        if (request.getEnabled() != null) current.setEnabled(request.getEnabled());
        if (request.getMinRoleLevel() != null) current.setMinRoleLevel(request.getMinRoleLevel());
        if (StringUtils.hasText(request.getRecipientMode())) current.setRecipientMode(request.getRecipientMode().trim().toUpperCase());
        if (StringUtils.hasText(request.getTemplateKey())) current.setTemplateKey(request.getTemplateKey().trim());
        return settingsMapper.updateRule(current) > 0;
    }

    public boolean updateTemplate(Long id, UpdateNotifyTemplateRequest request) {
        if (request == null) return false;
        List<NotifyTemplate> all = settingsMapper.listTemplates();
        NotifyTemplate target = all.stream().filter(it -> id.equals(it.getId())).findFirst().orElse(null);
        if (target == null) return false;
        if (StringUtils.hasText(request.getTitleTpl())) target.setTitleTpl(request.getTitleTpl().trim());
        if (StringUtils.hasText(request.getContentTpl())) target.setContentTpl(request.getContentTpl().trim());
        if (request.getEnabled() != null) target.setEnabled(request.getEnabled());
        return settingsMapper.updateTemplate(target) > 0;
    }

    public boolean updateConfig(Long id, UpdateSystemConfigRequest request, String operatorId) {
        if (request == null) return false;
        SystemConfigItem item = settingsMapper.findConfigById(id);
        if (item == null) return false;
        SystemConfigDefinition def = settingsMapper.listConfigDefinitionsByModule(item.getModule()).stream()
                .filter(it -> item.getConfigKey().equals(it.getConfigKey()))
                .findFirst()
                .orElse(null);
        String newValue = request.getConfigValue();
        if (TelemetryFacilityLayoutRulesService.MODULE.equals(item.getModule())
                && TelemetryFacilityLayoutRulesService.CONFIG_KEY_RULES_JSON.equals(item.getConfigKey())) {
            if (!telemetryFacilityLayoutRulesService.isValidRulesJson(newValue)) {
                return false;
            }
        }
        if (def != null && !isValueValid(def, newValue)) {
            return false;
        }
        String oldValue = item.getConfigValue();
        item.setConfigValue(newValue);
        item.setRemark(request.getRemark());
        int updated = settingsMapper.updateConfig(item);
        if (updated > 0) {
            settingsMapper.insertConfigAudit(item.getId(), item.getModule(), item.getConfigKey(), oldValue, newValue, operatorId);
            if (TelemetryFacilityLayoutRulesService.MODULE.equals(item.getModule())
                    && TelemetryFacilityLayoutRulesService.CONFIG_KEY_RULES_JSON.equals(item.getConfigKey())) {
                telemetryFacilityLayoutRulesService.refresh();
            }
            return true;
        }
        return false;
    }

    public List<Map<String, String>> listModules() {
        List<Map<String, String>> base = new ArrayList<>(List.of(
                module("notification", "通知规则"),
                module("template", "通知模板"),
                module("capability", "业务能力策略")
        ));
        Set<String> exists = new HashSet<>(base.stream().map(it -> it.get("key")).toList());
        for (String dynamicModule : settingsMapper.listConfigModules()) {
            if (!StringUtils.hasText(dynamicModule) || exists.contains(dynamicModule)) {
                continue;
            }
            base.add(module(dynamicModule, moduleLabel(dynamicModule)));
            exists.add(dynamicModule);
        }
        return base;
    }

    public List<SettingDefinitionView> listConfigDefinitions(String module) {
        List<SystemConfigDefinition> defs = settingsMapper.listConfigDefinitionsByModule(module);
        return defs.stream().map(this::toView).toList();
    }

    public Map<String, String> getPublicRuntimeConfig() {
        Map<String, String> result = new HashMap<>();
        List<SystemConfigDefinition> defs = settingsMapper.listPublicConfigDefinitions();
        for (SystemConfigDefinition def : defs) {
            List<SystemConfigItem> items = settingsMapper.listConfigsByModule(def.getModule());
            String dbValue = items.stream()
                    .filter(item -> def.getConfigKey().equals(item.getConfigKey()))
                    .map(SystemConfigItem::getConfigValue)
                    .findFirst()
                    .orElse(null);
            String value = StringUtils.hasText(dbValue) && isValueValid(def, dbValue)
                    ? dbValue
                    : (StringUtils.hasText(System.getenv(toEnvName(def.getConfigKey()))) ? System.getenv(toEnvName(def.getConfigKey())) : def.getDefaultValue());
            result.put(def.getConfigKey(), value == null ? "" : value);
        }
        return result;
    }

    private Map<String, String> module(String key, String label) {
        Map<String, String> map = new HashMap<>();
        map.put("key", key);
        map.put("label", label);
        return map;
    }

    private String moduleLabel(String module) {
        if ("mini_program".equals(module)) return "小程序推送";
        if ("frontend_runtime".equals(module)) return "前端运行时";
        if ("network".equals(module)) return "网络配置";
        if ("system".equals(module)) return "系统配置";
        if ("supplies".equals(module)) return "物资领用";
        if ("dashboard_codex".equals(module)) return "主页公告/还卡说明";
        if ("telemetry_facility".equals(module)) return "动物房设施布局";
        if ("scanner".equals(module)) return "扫码终端";
        if ("twin_scanner_popup".equals(module)) return "扫码进出提示";
        return module;
    }

    private SettingDefinitionView toView(SystemConfigDefinition def) {
        SettingDefinitionView view = new SettingDefinitionView();
        view.setId(def.getId());
        view.setModule(def.getModule());
        view.setConfigKey(def.getConfigKey());
        view.setLabelZh(def.getLabelZh());
        view.setDescription(def.getDescription());
        view.setValueType(def.getValueType());
        view.setDefaultValue(def.getDefaultValue());
        view.setIsSensitive(def.getIsSensitive());
        view.setRequiresRestart(def.getRequiresRestart());
        view.setIsPublic(def.getIsPublic());
        view.setOptions(parseOptions(def.getOptionsJson()));
        return view;
    }

    private List<String> parseOptions(String optionsJson) {
        if (!StringUtils.hasText(optionsJson)) return List.of();
        String raw = optionsJson.trim();
        if (!raw.startsWith("[") || !raw.endsWith("]")) return List.of();
        String body = raw.substring(1, raw.length() - 1).trim();
        if (!StringUtils.hasText(body)) return List.of();
        String[] arr = body.split(",");
        List<String> out = new ArrayList<>();
        for (String s : arr) {
            out.add(s.trim().replace("\"", ""));
        }
        return out;
    }

    private boolean isValueValid(SystemConfigDefinition def, String value) {
        if (def == null) return true;
        if (value == null) value = "";
        if (isNetworkConfig(def.getConfigKey()) && !isNetworkValueValid(def.getConfigKey(), value)) {
            return false;
        }
        String type = def.getValueType() == null ? "STRING" : def.getValueType().toUpperCase();
        if ("BOOLEAN".equals(type)) {
            return "true".equalsIgnoreCase(value) || "false".equalsIgnoreCase(value);
        }
        if ("NUMBER".equals(type)) {
            try {
                Integer.parseInt(value);
            } catch (Exception ex) {
                return false;
            }
        }
        List<String> options = parseOptions(def.getOptionsJson());
        return options.isEmpty() || options.contains(value);
    }

    private boolean isNetworkConfig(String configKey) {
        return StringUtils.hasText(configKey) && configKey.startsWith("network.");
    }

    private boolean isNetworkValueValid(String configKey, String value) {
        if ("network.backend.serverPort".equals(configKey)) {
            try {
                int port = Integer.parseInt(value);
                return port >= 1 && port <= 65535;
            } catch (Exception ex) {
                return false;
            }
        }
        if ("network.backend.serverAddress".equals(configKey)) {
            return !StringUtils.hasText(value) || value.matches("^[a-zA-Z0-9_.:-]+$");
        }
        if ("network.backend.contextPath".equals(configKey)
                || "network.frontend.apiBaseUrl".equals(configKey)
                || "network.frontend.sseBaseUrl".equals(configKey)
                || "network.upload.publicBaseUrl".equals(configKey)) {
            return value.startsWith("/") || value.matches("^https?://[^\\s]+$");
        }
        return true;
    }

    private String toEnvName(String configKey) {
        return configKey.toUpperCase().replace(".", "_");
    }
}
