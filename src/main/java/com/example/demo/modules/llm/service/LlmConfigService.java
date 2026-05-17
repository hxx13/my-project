package com.example.demo.modules.llm.service;

import com.example.demo.modules.llm.LlmInsightModules;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class LlmConfigService {

    public static final String MODULE = "llm";

    private final NotificationSettingsService notificationSettingsService;

    public LlmConfigService(NotificationSettingsService notificationSettingsService) {
        this.notificationSettingsService = notificationSettingsService;
    }

    public boolean isEnabled() {
        return "true".equalsIgnoreCase(get("llm.enabled", "false"));
    }

    public String getApiKey() {
        String fromDb = get("llm.api_key", "");
        if (StringUtils.hasText(fromDb)) {
            return fromDb.trim();
        }
        String env = System.getenv("DASHSCOPE_API_KEY");
        return env != null ? env.trim() : "";
    }

    public String getBaseUrl() {
        String url = get("llm.base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1");
        if (!StringUtils.hasText(url)) {
            url = "https://dashscope.aliyuncs.com/compatible-mode/v1";
        }
        return trimTrailingSlash(url.trim());
    }

    public String getModel() {
        return get("llm.model", "qwen-plus");
    }

    /**
     * 主模型 + 备用模型列表（逗号分隔），去重且保持顺序。无需配置全部 124 个模型，仅列 2～5 个即可。
     */
    public List<String> getModelCandidates() {
        Set<String> ordered = new LinkedHashSet<>();
        addModels(ordered, getModel());
        addModels(ordered, get("llm.model_fallback", "qwen-turbo,qwen-plus,qwen-max"));
        if (ordered.isEmpty()) {
            ordered.add("qwen-plus");
        }
        return new ArrayList<>(ordered);
    }

    public int getMaxTokens() {
        try {
            return Math.min(Math.max(Integer.parseInt(get("llm.max_tokens", "2048")), 256), 8192);
        } catch (Exception e) {
            return 2048;
        }
    }

    public double getTemperature() {
        try {
            double t = Double.parseDouble(get("llm.temperature", "0.3"));
            return Math.min(Math.max(t, 0), 1);
        } catch (Exception e) {
            return 0.3;
        }
    }

    /** 每日审计跑批后自动生成解读（无缓存时） */
    public boolean isAutoInsightAfterAudit() {
        return "true".equalsIgnoreCase(get("llm.auto_insight", "false"));
    }

    /** 打开某条清算详情时，若无缓存则自动生成一次 */
    public boolean isAutoInsightOnOpen() {
        return "true".equalsIgnoreCase(get("llm.auto_insight_on_open", "true"));
    }

    public int getAutoInsightBatchLimit() {
        try {
            return Math.min(Math.max(Integer.parseInt(get("llm.auto_insight_batch_limit", "5")), 1), 20);
        } catch (Exception e) {
            return 5;
        }
    }

    public void assertReady() {
        if (!isEnabled()) {
            throw new IllegalStateException("大模型未启用，请在系统设置 → 大模型 中开启");
        }
        if (!StringUtils.hasText(getApiKey())) {
            throw new IllegalStateException("未配置 API Key，请在系统设置 → 大模型 中填写");
        }
    }

    /** 模块默认用户提问（系统设置可覆盖） */
    public String getInsightUserPrompt(String reportKey) {
        String key = LlmInsightModules.userPromptConfigKey(reportKey);
        String fromDb = get(key, "");
        if (StringUtils.hasText(fromDb)) {
            return fromDb.trim();
        }
        return LlmInsightModules.defaultUserPrompt(reportKey);
    }

    /** 模块系统提示（系统设置可覆盖；空则用内置 JSON 输出规范） */
    public String getInsightSystemPrompt(String reportKey) {
        String key = LlmInsightModules.systemPromptConfigKey(reportKey);
        String fromDb = get(key, "");
        if (StringUtils.hasText(fromDb)) {
            return fromDb.trim();
        }
        return LlmInsightModules.defaultSystemPrompt();
    }

    public Map<String, Object> getInsightPromptBundle(String reportKey) {
        return LlmInsightModules.toPromptMap(
                reportKey, getInsightUserPrompt(reportKey), getInsightSystemPrompt(reportKey));
    }

    private void addModels(Set<String> target, String raw) {
        if (!StringUtils.hasText(raw)) {
            return;
        }
        for (String part : raw.split("[,;，；|\\s]+")) {
            String m = part.trim();
            if (StringUtils.hasText(m)) {
                target.add(m);
            }
        }
    }

    private String get(String key, String defaultValue) {
        List<SystemConfigItem> items = notificationSettingsService.listConfigs(MODULE);
        return items.stream()
                .filter(it -> key.equals(it.getConfigKey()))
                .map(SystemConfigItem::getConfigValue)
                .filter(StringUtils::hasText)
                .findFirst()
                .orElse(defaultValue);
    }

    private static String trimTrailingSlash(String url) {
        while (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        return url;
    }
}
