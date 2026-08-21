package com.example.demo.modules.twin.dashboard.support;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.Objects;

/**
 * 违规文案模板变量渲染：${name}/${dept}/${date} 及可选扩展变量。
 * C-T2：合并原先散落在滞留检测 / 笼架判定 / 扫码展示等多处的 replace 逻辑。
 */
public final class ViolationTextTemplateRenderer {

    public static final String DEFAULT_STRANDED_TPL =
            "${name}(${dept})滞留未签退，系统自动登记";

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private ViolationTextTemplateRenderer() {
    }

    public static String today() {
        return LocalDate.now().format(DATE_FMT);
    }

    public static String render(String template, String name, String dept, String date) {
        String tpl = template != null ? template : "";
        if (!tpl.contains("${")) {
            return tpl;
        }
        return tpl
                .replace("${name}", Objects.toString(name, ""))
                .replace("${dept}", Objects.toString(dept, ""))
                .replace("${date}", Objects.toString(date, today()));
    }

    /** 先套标准三变量，再套 extras（如 ${status}/${cage}）。 */
    public static String render(String template, String name, String dept, String date, Map<String, String> extras) {
        String out = render(template, name, dept, date);
        if (extras == null || extras.isEmpty() || !out.contains("${")) {
            return out;
        }
        for (Map.Entry<String, String> e : extras.entrySet()) {
            if (e.getKey() == null || e.getKey().isBlank()) {
                continue;
            }
            String key = e.getKey().startsWith("${") ? e.getKey() : "${" + e.getKey() + "}";
            out = out.replace(key, Objects.toString(e.getValue(), ""));
        }
        return out;
    }
}
