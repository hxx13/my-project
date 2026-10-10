package com.example.demo.modules.telemetry.util;

import org.springframework.util.StringUtils;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 遥测值解析：从原始串里取**前缀数字**。
 *
 * <p>归档表（telemetry_value_archive）与长期归档共用这一处实现 —— 两份正则必然漂移，
 * 而漂移的表现是「同一时刻两条链存下的数值不一样」，极难查。
 *
 * <p>语义与 {@code TelemetryArchiveService#parseItemNumeric} 原实现逐字一致：
 * 先去空白、把逗号归一成小数点，再用前缀数字正则；正则匹配不到时退回裸 {@code Double.parseDouble}
 * （兜住 {@code ".5"} 这类无前导整数的小数）。
 */
public final class TelemetryNumericParseUtil {

    private static final Pattern LEADING_NUMBER = Pattern.compile("^(-?\\d+(?:\\.\\d*)?)");

    private TelemetryNumericParseUtil() {
    }

    public static Double parseNumeric(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        String t = raw.trim().replace(',', '.');
        Matcher m = LEADING_NUMBER.matcher(t);
        if (m.find()) {
            try {
                return Double.parseDouble(m.group(1));
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        try {
            return Double.parseDouble(t);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
