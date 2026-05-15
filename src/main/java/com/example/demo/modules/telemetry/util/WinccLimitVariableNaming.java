package com.example.demo.modules.telemetry.util;

import org.springframework.util.StringUtils;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * WinCC 限值变量后缀解析（与前端 {@code telemetryWatchlistLimitNaming}、现场命名约定一致）。
 * 用于变量库配对映射与 Facade 按主测量叠加手填缓存限值；不包含 WinCC 拉取限值等业务调度逻辑。
 */
public final class WinccLimitVariableNaming {

    private WinccLimitVariableNaming() {
    }

    public record Parsed(String base, String metricKindCode, boolean minSlot) {
    }

    private record Spec(String suffix, String metricCode, boolean minSlot) {
    }

    private static final List<Spec> SPECS_SORTED = List.of(
            new Spec("_PT_Floor", "PRESSURE", true),
            new Spec("_PT_Top", "PRESSURE", false),
            new Spec("_TT_Floor", "TEMP", true),
            new Spec("_TT_Top", "TEMP", false),
            new Spec("_RH_Floor", "HUM", true),
            new Spec("_RH_Top", "HUM", false)
    ).stream().sorted(Comparator.comparingInt((Spec s) -> s.suffix.length()).reversed()).toList();

    public static Parsed parseLimitSuffix(String rawName) {
        if (!StringUtils.hasText(rawName)) {
            return null;
        }
        String vn = rawName.trim();
        String lower = vn.toLowerCase(Locale.ROOT);
        for (Spec sp : SPECS_SORTED) {
            String suf = sp.suffix.toLowerCase(Locale.ROOT);
            if (lower.endsWith(suf)) {
                String base = vn.substring(0, vn.length() - sp.suffix.length()).trim();
                if (!StringUtils.hasText(base)) {
                    return null;
                }
                return new Parsed(base, sp.metricCode, sp.minSlot);
            }
        }
        return null;
    }

    public static boolean isLimitSuffixVariable(String rawName) {
        return parseLimitSuffix(rawName) != null;
    }
}
