package com.example.demo.modules.llm;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 大模型供应商预设：DeepSeek（默认）、自定义。
 */
public final class LlmProfilePresets {

    public static final String PROVIDER_DEEPSEEK = "deepseek";
    public static final String PROVIDER_CUSTOM = "custom";

    private LlmProfilePresets() {}

    public static Map<String, String> presetFor(String provider) {
        return switch (provider != null ? provider.trim().toLowerCase() : "") {
            case PROVIDER_CUSTOM -> Map.of("provider", PROVIDER_CUSTOM);
            default -> deepseek();
        };
    }

    /** DeepSeek API 根地址。 */
    public static final String DEEPSEEK_BASE_URL = "https://api.deepseek.com";

    public static Map<String, String> deepseek() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("provider", PROVIDER_DEEPSEEK);
        m.put("base_url", DEEPSEEK_BASE_URL);
        m.put("model", "deepseek-v4-pro");
        m.put("model_fallback", "deepseek-v4-flash");
        return m;
    }

    public static String inferProviderFromBaseUrl(String baseUrl) {
        if (baseUrl == null) {
            return PROVIDER_DEEPSEEK;
        }
        String lower = baseUrl.toLowerCase();
        if (lower.contains("deepseek")) {
            return PROVIDER_DEEPSEEK;
        }
        return PROVIDER_CUSTOM;
    }
}
