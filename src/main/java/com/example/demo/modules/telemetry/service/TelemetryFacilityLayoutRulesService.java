package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.mapper.NotificationSettingsMapper;
import com.example.demo.modules.telemetry.animalroom.dto.FacilityLayoutRulesV1;
import com.example.demo.modules.telemetry.animalroom.layout.FacilityLayoutRulebook;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.text.Collator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 从系统设置 {@code telemetry_facility} 加载动物房设施布局 JSON；带短时缓存。
 */
@Service
public class TelemetryFacilityLayoutRulesService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryFacilityLayoutRulesService.class);

    public static final String MODULE = "telemetry_facility";
    public static final String CONFIG_KEY_RULES_JSON = "telemetry.facility.rules_json";

    private static final long CACHE_TTL_MS = 60_000L;

    private final NotificationSettingsMapper notificationSettingsMapper;
    private final ObjectMapper objectMapper;

    private final AtomicReference<Cached> cache = new AtomicReference<>();

    private record Cached(FacilityLayoutRulebook book, long loadedAtMs) {
    }

    public TelemetryFacilityLayoutRulesService(
            NotificationSettingsMapper notificationSettingsMapper,
            ObjectMapper objectMapper) {
        this.notificationSettingsMapper = notificationSettingsMapper;
        this.objectMapper = objectMapper;
    }

    /** 合并默认值后的规则（供 GET API） */
    public FacilityLayoutRulesV1 getEffectiveRulesV1() {
        return getRulebook().getRules();
    }

    public FacilityLayoutRulebook getRulebook() {
        Cached c = cache.get();
        long now = System.currentTimeMillis();
        if (c != null && now - c.loadedAtMs < CACHE_TTL_MS) {
            return c.book();
        }
        return reload();
    }

    public synchronized void refresh() {
        reload();
    }

    private FacilityLayoutRulebook reload() {
        FacilityLayoutRulesV1 merged = resolveMergedFromDatabase();
        FacilityLayoutRulebook book = new FacilityLayoutRulebook(merged, Collator.getInstance(Locale.CHINA));
        cache.set(new Cached(book, System.currentTimeMillis()));
        return book;
    }

    private FacilityLayoutRulesV1 resolveMergedFromDatabase() {
        String rawJson = null;
        try {
            List<SystemConfigItem> items = notificationSettingsMapper.listConfigsByModule(MODULE);
            for (SystemConfigItem it : items) {
                if (CONFIG_KEY_RULES_JSON.equals(it.getConfigKey())) {
                    rawJson = it.getConfigValue();
                    break;
                }
            }
        } catch (Exception e) {
            log.warn("[telemetry_facility] 读取系统配置失败，使用内置默认: {}", e.getMessage());
        }
        return mergeWithDefaults(parseLenient(rawJson));
    }

    private FacilityLayoutRulesV1 parseLenient(String rawJson) {
        if (!StringUtils.hasText(rawJson)) {
            return null;
        }
        try {
            return objectMapper.readValue(rawJson.trim(), FacilityLayoutRulesV1.class);
        } catch (Exception e) {
            log.warn("[telemetry_facility] JSON 解析失败，使用内置默认: {}", e.getMessage());
            return null;
        }
    }

    public boolean isValidRulesJson(String rawJson) {
        if (!StringUtils.hasText(rawJson)) {
            return false;
        }
        try {
            FacilityLayoutRulesV1 v = objectMapper.readValue(rawJson.trim(), FacilityLayoutRulesV1.class);
            return v != null && v.getVersion() == 1;
        } catch (Exception e) {
            return false;
        }
    }

    public static FacilityLayoutRulesV1 defaultRulesV1() {
        FacilityLayoutRulesV1 v = new FacilityLayoutRulesV1();
        v.setVersion(1);
        v.setFacilitySmallRoomKeywords(List.of(
                "蒸汽供水", "蒸汽报警", "蒸汽", "冷却塔", "冷冻水泵", "冷却水泵", "冷冻水", "冷却水", "冷机"));

        FacilityLayoutRulesV1.GongShuiConfig g = new FacilityLayoutRulesV1.GongShuiConfig();
        g.setSegmentEquals(List.of("供水"));
        g.setSegmentContains(List.of("(供水)"));
        v.setGongShui(g);

        FacilityLayoutRulesV1.TitleMetricConfig tm = new FacilityLayoutRulesV1.TitleMetricConfig();
        tm.setKindCodePrefixes(List.of("TEMP", "PRESSURE"));
        tm.setLabelContainsAny(List.of("温度", "气温", "压差", "压力", "压强"));
        v.setTitleMetric(tm);

        FacilityLayoutRulesV1.SuiteRecognition sr = new FacilityLayoutRulesV1.SuiteRecognition();
        FacilityLayoutRulesV1.SuiteTokensConfig ps = new FacilityLayoutRulesV1.SuiteTokensConfig();
        ps.setTokens(List.of("动力站"));
        sr.setPowerStation(ps);
        FacilityLayoutRulesV1.SuiteTokensConfig br = new FacilityLayoutRulesV1.SuiteTokensConfig();
        br.setTokens(List.of("锅炉房"));
        sr.setBoilerRoom(br);
        v.setSuiteRecognition(sr);

        FacilityLayoutRulesV1.BasementWebChrome bc = new FacilityLayoutRulesV1.BasementWebChrome();
        bc.setExclusiveRowIfSuiteNormContains(List.of("动力站"));
        bc.setBoilerSwitchRowMergeIfSuiteNormContains(List.of("锅炉房"));
        v.setBasementWebChrome(bc);

        return v;
    }

    public static String defaultRulesJsonPretty(ObjectMapper mapper) {
        try {
            return mapper.writerWithDefaultPrettyPrinter().writeValueAsString(defaultRulesV1());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * 将部分 JSON 与内置默认合并（缺省字段沿用默认）。
     */
    public FacilityLayoutRulesV1 mergeWithDefaults(FacilityLayoutRulesV1 partial) {
        FacilityLayoutRulesV1 d = defaultRulesV1();
        if (partial == null) {
            return d;
        }
        if (partial.getVersion() != 1) {
            log.warn("[telemetry_facility] version 非 1，忽略并回退默认");
            return d;
        }
        if (partial.getFacilitySmallRoomKeywords() != null && !partial.getFacilitySmallRoomKeywords().isEmpty()) {
            d.setFacilitySmallRoomKeywords(List.copyOf(partial.getFacilitySmallRoomKeywords()));
        }
        if (partial.getGongShui() != null) {
            FacilityLayoutRulesV1.GongShuiConfig g = new FacilityLayoutRulesV1.GongShuiConfig();
            if (partial.getGongShui().getSegmentEquals() != null) {
                g.setSegmentEquals(List.copyOf(partial.getGongShui().getSegmentEquals()));
            } else {
                g.setSegmentEquals(d.getGongShui().getSegmentEquals());
            }
            if (partial.getGongShui().getSegmentContains() != null) {
                g.setSegmentContains(List.copyOf(partial.getGongShui().getSegmentContains()));
            } else {
                g.setSegmentContains(d.getGongShui().getSegmentContains());
            }
            d.setGongShui(g);
        }
        if (partial.getTitleMetric() != null) {
            FacilityLayoutRulesV1.TitleMetricConfig tm = new FacilityLayoutRulesV1.TitleMetricConfig();
            if (partial.getTitleMetric().getKindCodePrefixes() != null) {
                tm.setKindCodePrefixes(List.copyOf(partial.getTitleMetric().getKindCodePrefixes()));
            } else {
                tm.setKindCodePrefixes(d.getTitleMetric().getKindCodePrefixes());
            }
            if (partial.getTitleMetric().getLabelContainsAny() != null) {
                tm.setLabelContainsAny(List.copyOf(partial.getTitleMetric().getLabelContainsAny()));
            } else {
                tm.setLabelContainsAny(d.getTitleMetric().getLabelContainsAny());
            }
            d.setTitleMetric(tm);
        }
        if (partial.getSuiteRecognition() != null) {
            FacilityLayoutRulesV1.SuiteRecognition sr = new FacilityLayoutRulesV1.SuiteRecognition();
            if (partial.getSuiteRecognition().getPowerStation() != null
                    && partial.getSuiteRecognition().getPowerStation().getTokens() != null) {
                FacilityLayoutRulesV1.SuiteTokensConfig ps = new FacilityLayoutRulesV1.SuiteTokensConfig();
                ps.setTokens(List.copyOf(partial.getSuiteRecognition().getPowerStation().getTokens()));
                sr.setPowerStation(ps);
            } else {
                sr.setPowerStation(d.getSuiteRecognition().getPowerStation());
            }
            if (partial.getSuiteRecognition().getBoilerRoom() != null
                    && partial.getSuiteRecognition().getBoilerRoom().getTokens() != null) {
                FacilityLayoutRulesV1.SuiteTokensConfig br = new FacilityLayoutRulesV1.SuiteTokensConfig();
                br.setTokens(List.copyOf(partial.getSuiteRecognition().getBoilerRoom().getTokens()));
                sr.setBoilerRoom(br);
            } else {
                sr.setBoilerRoom(d.getSuiteRecognition().getBoilerRoom());
            }
            d.setSuiteRecognition(sr);
        }
        if (partial.getBasementWebChrome() != null) {
            FacilityLayoutRulesV1.BasementWebChrome bc = new FacilityLayoutRulesV1.BasementWebChrome();
            if (partial.getBasementWebChrome().getExclusiveRowIfSuiteNormContains() != null) {
                bc.setExclusiveRowIfSuiteNormContains(
                        List.copyOf(partial.getBasementWebChrome().getExclusiveRowIfSuiteNormContains()));
            } else {
                bc.setExclusiveRowIfSuiteNormContains(d.getBasementWebChrome().getExclusiveRowIfSuiteNormContains());
            }
            if (partial.getBasementWebChrome().getBoilerSwitchRowMergeIfSuiteNormContains() != null) {
                bc.setBoilerSwitchRowMergeIfSuiteNormContains(
                        List.copyOf(partial.getBasementWebChrome().getBoilerSwitchRowMergeIfSuiteNormContains()));
            } else {
                bc.setBoilerSwitchRowMergeIfSuiteNormContains(
                        d.getBasementWebChrome().getBoilerSwitchRowMergeIfSuiteNormContains());
            }
            d.setBasementWebChrome(bc);
        }
        return d;
    }
}
