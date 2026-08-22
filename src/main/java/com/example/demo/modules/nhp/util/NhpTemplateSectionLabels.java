package com.example.demo.modules.nhp.util;

import java.util.Locale;
import java.util.Map;

/** crf_template_section.label 非空约束下的展示名解析。 */
public final class NhpTemplateSectionLabels {

    public static final String UNNAMED = "未命名章节";

    private static final Map<String, String> DOMAIN_LABELS = Map.ofEntries(
            Map.entry("D1", "供体猪域"), Map.entry("D2", "受体NHP域"), Map.entry("D3", "配型与手术域"),
            Map.entry("D4", "样本与检测域"), Map.entry("D5", "随访与事件域"), Map.entry("D6", "免疫抑制用药域"),
            Map.entry("D7", "麻醉术中监护域"), Map.entry("D8", "病理诊断域"), Map.entry("D9", "心脏移植模块"),
            Map.entry("D10", "体外肝灌注模块"), Map.entry("D11", "公共数据层"), Map.entry("D12", "标准与版本域"),
            Map.entry("D13", "用户与权限域"));

    private NhpTemplateSectionLabels() {
    }

    /**
     * 解析章节 label：显式 label → code → 原子/表单标题 → 数据域中文名 → {@link #UNNAMED}。
     */
    public static String resolve(String code, String label, String atomTitle) {
        String trimmed = trimToNull(label);
        if (trimmed != null) return trimmed;
        trimmed = trimToNull(code);
        if (trimmed != null) return trimmed;
        trimmed = trimToNull(atomTitle);
        if (trimmed != null) return trimmed;
        String domainLabel = domainLabelForCode(code);
        if (domainLabel != null) return domainLabel;
        return UNNAMED;
    }

    public static String resolve(String code, String label) {
        return resolve(code, label, null);
    }

    private static String domainLabelForCode(String code) {
        if (code == null || code.isBlank()) return null;
        String domain = NhpAtomFormKeys.extractDomainCode(code);
        if (domain == null) {
            int dot = code.indexOf('.');
            domain = dot > 0 ? code.substring(0, dot) : code;
        }
        String canon = NhpAtomFormKeys.canonicalPigDomainCode(domain);
        if (canon != null) {
            domain = canon;
        }
        return DOMAIN_LABELS.get(domain.toUpperCase(Locale.ROOT));
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
