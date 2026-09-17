package com.example.demo.modules.telemetry.service;

/**
 * 聚合明细的单行文案。纯函数，只拼字符串。
 *
 * <p>输出是 **Markdown 表格的一行**（以 {@code |} 开头结尾），由 {@link DigestScheduler} 拼进表体
 * （表头由 {@link #tableHeader()} 提供，跟着行走）。单独成类是为了让"改措辞"不动状态机：判定逻辑在
 * {@link TelemetryAlarmBandEvaluator}。
 *
 * <p>位置格放**完整房间名**（{@code 101A-兔饲养室}）。实测带描述在表格单元里会折成两行，但房间描述
 * 是给人看的必要信息，折行可以接受；只写代号虽然能挤进一行，却丢掉了「手术室 / 猴饲养室」这类场景。
 * 指标词不写（℃ / % / Pa 已经说明了）。
 *
 * <p>配色只表达"是否越限"：高与低都上红色（两者都是异常），只有已恢复是绿色。方向靠文字区分，
 * 颜色是冗余增强而非唯一信号，色盲用户靠文字仍能读懂。
 */
public final class TelemetryAlarmLineFormatter {

    private TelemetryAlarmLineFormatter() {}

    private static final String RED = "#dc2626";
    private static final String GREEN = "#16a34a";

    /** 按指标类型补单位。currentValue 是原始读数，可能已经带单位，所以只在缺单位时补。 */
    public static String appendUnit(String currentValue, String metricKind) {
        if (currentValue == null) return "";
        if (metricKind == null) return currentValue;
        String mk = metricKind.trim().toUpperCase(java.util.Locale.ROOT);
        boolean hasUnit = currentValue.endsWith("℃") || currentValue.endsWith("%")
                || currentValue.endsWith("Pa") || currentValue.endsWith("m³/h");
        if (hasUnit) return currentValue;
        return switch (mk) {
            case "TEMP" -> currentValue + "℃";
            case "HUM", "RH" -> currentValue + "%";
            case "PRESSURE" -> currentValue + "Pa";
            case "WIND" -> currentValue + "m³/h";
            default -> currentValue;
        };
    }

    /**
     * 新报警行：{@code | 101A-兔饲养室 | 温度 | <span style="color:#dc2626">高</span> | 22.15℃ | 23 |}
     *
     * @param metricKindDisplay 类型格文字（温度/湿度/压强/风量/开关/状态）
     * @param band 报警方向，取 HIGH 或 LOW（就是台账里的 alarm_band）
     */
    public static String alarmRow(String roomName, String metricKindDisplay, String band,
                                  String currentValue, String limitValue) {
        return row(roomName, metricKindDisplay, colored(shortDir(band)), currentValue, nullToEmpty(limitValue));
    }

    /** 重提醒行：红色 + 加粗，并标出已持续多久。时长未知时省掉那一段。 */
    public static String renotifyRow(String roomName, String metricKindDisplay, String band,
                                     long sustainedMinutes, String currentValue, String limitValue) {
        String dur = sustainedMinutes > 0 ? " " + shortDuration(sustainedMinutes) : "";
        String cell = "<span style=\"color:" + RED + "\"><b>持续" + shortDir(band) + dur + "</b></span>";
        return row(roomName, metricKindDisplay, cell, currentValue, nullToEmpty(limitValue));
    }

    /** 恢复行：绿色，阈值格留空。 */
    public static String recoveryRow(String roomName, String metricKindDisplay, String currentValue) {
        return row(roomName, metricKindDisplay, "<span style=\"color:" + GREEN + "\">已恢复</span>", currentValue, "");
    }

    /** 变化行：布尔量（开关/状态）值翻转，红色"变化"，读数为 旧→新，阈值恒为 —。 */
    public static String changeRow(String roomName, String metricKindDisplay, String oldValue, String newValue) {
        return row(roomName, metricKindDisplay, colored("变化"),
                nullToEmpty(oldValue) + " → " + nullToEmpty(newValue), "—");
    }

    /** 布尔量本轮该怎么做。 */
    public enum BooleanChangeKind { SKIP, BASELINE, CHANGE, NO_CHANGE }

    /** 布尔变化判定结果：normalized 是归一化后的新显示值（SKIP 时为 null）。 */
    public record BooleanChange(String normalized, BooleanChangeKind kind) {}

    /**
     * 布尔量（开关/状态）的归一化 + 变化判定。纯函数，便于测试。
     *
     * <p>真实值是小写字符串 {@code true}/{@code false}，大小写不敏感地判。开关归一化为 开/关，
     * 状态归一化为 是/否。取不到值（null）或不是布尔量（既非 true 也非 false）时返回 {@code SKIP}。
     * 无历史（{@code lastValue == null}）是首次观测，返回 {@code BASELINE}；与上次相同是
     * {@code NO_CHANGE}，不同是 {@code CHANGE}。
     */
    public static BooleanChange booleanChange(String metricKind, String rawValue, String lastValue) {
        String norm = normalizeBoolean(metricKind, rawValue);
        if (norm == null) return new BooleanChange(null, BooleanChangeKind.SKIP);
        if (lastValue == null) return new BooleanChange(norm, BooleanChangeKind.BASELINE);
        if (norm.equals(lastValue)) return new BooleanChange(norm, BooleanChangeKind.NO_CHANGE);
        return new BooleanChange(norm, BooleanChangeKind.CHANGE);
    }

    /** 布尔值归一化：SWITCH → 开/关，STATUS → 是/否；非布尔或未知类型返回 null。 */
    public static String normalizeBoolean(String metricKind, String rawValue) {
        if (rawValue == null) return null;
        String mk = metricKind == null ? "" : metricKind.trim().toUpperCase(java.util.Locale.ROOT);
        String v = rawValue.trim();
        if ("SWITCH".equals(mk)) {
            if ("true".equalsIgnoreCase(v)) return "开";
            if ("false".equalsIgnoreCase(v)) return "关";
        } else if ("STATUS".equals(mk)) {
            if ("true".equalsIgnoreCase(v)) return "是";
            if ("false".equalsIgnoreCase(v)) return "否";
        }
        return null;
    }

    /**
     * 聚合表格的表头（含对齐分隔行）。
     *
     * <p>由写入方拼在该源本轮**第一条**明细前面，而不是放在聚合模板里：表头属于"这张表"，
     * 跟着行走才能保证任意源混排时表格不被打断。
     */
    public static String tableHeader() {
        return "| 位置 | 类型 | 状态 | 读数 | 阈值 |\n|:--|:--|:--|--:|--:|";
    }

    private static String row(String roomName, String metricKindDisplay, String statusCell,
                              String reading, String limit) {
        return "| " + nullToEmpty(roomName) + " | " + nullToEmpty(metricKindDisplay) + " | "
                + statusCell + " | " + reading + " | " + limit + " |";
    }

    private static String colored(String text) {
        return "<span style=\"color:" + RED + "\">" + text + "</span>";
    }

    private static String shortDir(String band) {
        return "HIGH".equals(band) ? "高" : "低";
    }

    /** 短时长：不足一小时用"分"，满一小时用"小时"，都不带空格以压字数。 */
    private static String shortDuration(long minutes) {
        return minutes >= 60 ? (minutes / 60) + "小时" : minutes + "分";
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }
}
