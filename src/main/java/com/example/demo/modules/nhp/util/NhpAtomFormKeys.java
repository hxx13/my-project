package com.example.demo.modules.nhp.util;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 原子模板 formKey 与数据域套（dictKey）的约定：
 * <ul>
 *   <li>猪套存量/默认：裸域码 {@code D1}（兼容种子与历史组合钉住）</li>
 *   <li>其它套：{@code {dictKey}__{domain}}，如 {@code monkey__D1}</li>
 * </ul>
 * 数据域套并排；域码仅在套内有意义，禁止把猪 D1–D10 当成全平台骨架。
 * 域码为 {@code D+}数字（D1、DD1、DDD10 均合法且互不相同）。
 */
public final class NhpAtomFormKeys {

    public static final String DEFAULT_DICT_KEY = "pig";
    /** 裸域码：一个或多个 D + 1~3 位数字（DD1 ≠ D1） */
    public static final Pattern BARE_DOMAIN = Pattern.compile("(?i)^D+\\d{1,3}$");
    private static final Pattern SCOPED = Pattern.compile("(?i)^([a-z0-9_-]+)__(D+\\d{1,3})$");
    /** 字段码首段域：D1.01.001 → D1；DD1.01.001 → DD1 */
    private static final Pattern FIELD_DOMAIN_PREFIX = Pattern.compile("(?i)^(D+\\d{1,3})(?:\\.|$)");

    private NhpAtomFormKeys() {}

    public record Parsed(String dictKey, String domainCode) {}

    /** 裸域码或套内作用域 formKey。 */
    public static boolean looksLikeAtomCode(String code) {
        if (code == null || code.isBlank()) return false;
        String c = code.trim();
        if (BARE_DOMAIN.matcher(c).matches()) return true;
        return SCOPED.matcher(c).matches();
    }

    public static boolean looksLikeBareDomain(String code) {
        return code != null && BARE_DOMAIN.matcher(code.trim()).matches();
    }

    public static Parsed parse(String formKey) {
        if (formKey == null || formKey.isBlank()) return null;
        String c = formKey.trim();
        var scoped = SCOPED.matcher(c);
        if (scoped.matches()) {
            return new Parsed(scoped.group(1).toLowerCase(Locale.ROOT), scoped.group(2).toUpperCase(Locale.ROOT));
        }
        if (BARE_DOMAIN.matcher(c).matches()) {
            return new Parsed(DEFAULT_DICT_KEY, c.toUpperCase(Locale.ROOT));
        }
        return null;
    }

    /**
     * 解析用户输入的「域码」：允许 {@code D1}/{@code DD1} 或已作用域的 {@code monkey__D1}。
     * 返回 domain 部分；非法则 null。
     */
    public static String extractDomainCode(String formKeyOrDomain) {
        Parsed p = parse(formKeyOrDomain);
        if (p != null) return p.domainCode();
        if (looksLikeBareDomain(formKeyOrDomain)) {
            return formKeyOrDomain.trim().toUpperCase(Locale.ROOT);
        }
        return null;
    }

    /**
     * 从字段编码取出域段（{@code DD1.01.001} → {@code DD1}）。
     * 必须整段相等匹配，禁止用 {@code startsWith("D1")} 误伤 {@code DD1}。
     */
    public static String domainOfFieldCode(String fieldCode) {
        if (fieldCode == null || fieldCode.isBlank()) return null;
        Matcher m = FIELD_DOMAIN_PREFIX.matcher(fieldCode.trim());
        return m.find() ? m.group(1).toUpperCase(Locale.ROOT) : null;
    }

    /** 字段是否属于指定套内数据域（DD1 仅匹配 DD1.*，不匹配 D1.*）。 */
    public static boolean fieldBelongsToDomain(String fieldCode, String domainCode) {
        if (domainCode == null || domainCode.isBlank()) return false;
        String fieldDomain = domainOfFieldCode(fieldCode);
        if (fieldDomain == null) return false;
        return fieldDomain.equals(domainCode.trim().toUpperCase(Locale.ROOT));
    }

    /**
     * 生成原子 formKey。猪套用裸 {@code D1}/{@code DD1}（兼容存量）；其它套用 {@code dictKey__Dn}。
     */
    public static String atomFormKey(String dictKey, String domainCode) {
        String domain = domainCode == null ? null : domainCode.trim().toUpperCase(Locale.ROOT);
        if (domain == null || !BARE_DOMAIN.matcher(domain).matches()) {
            throw new IllegalArgumentException("域编码须为 Dn 形式（如 D1、DD1）");
        }
        String dk = normalizeDictKey(dictKey);
        if (DEFAULT_DICT_KEY.equals(dk)) {
            return domain;
        }
        return dk + "__" + domain;
    }

    public static String normalizeDictKey(String dictKey) {
        if (dictKey == null || dictKey.isBlank()) return DEFAULT_DICT_KEY;
        return dictKey.trim().toLowerCase(Locale.ROOT);
    }

    /** 组合模板 formKey（非原子），用于排除误标 DOMAIN 的存量行。 */
    public static boolean looksLikeCompositeTemplateCode(String code) {
        if (code == null || code.isBlank()) return false;
        String c = code.trim().toLowerCase(Locale.ROOT);
        return "nhp-crf".equals(c) || c.startsWith("nhp-crftpl-");
    }

    /**
     * 列表过滤：裸 D* / 套内 x__D* 按 parse；语义化原子码（donor_profile 等）无 __ 前缀时归猪套默认域。
     */
    public static boolean matchesDictKey(String formKey, String dictKey) {
        if (dictKey == null || dictKey.isBlank()) return true;
        if (formKey == null || formKey.isBlank() || looksLikeCompositeTemplateCode(formKey)) return false;
        Parsed p = parse(formKey);
        if (p != null) return normalizeDictKey(dictKey).equals(p.dictKey());
        if (!formKey.contains("__") && DEFAULT_DICT_KEY.equals(normalizeDictKey(dictKey))) {
            return true;
        }
        return false;
    }

    public static String displayLabel(String formKey, String title) {
        Parsed p = parse(formKey);
        if (p == null) return title != null ? title : formKey;
        String base = title != null && !title.isBlank() ? title : p.domainCode();
        if (DEFAULT_DICT_KEY.equals(p.dictKey()) && looksLikeBareDomain(formKey)) {
            return base;
        }
        return p.dictKey() + " · " + base;
    }

    /**
     * 猪套规范域码：字段为 {@code D1.*} 时，将历史误写的 {@code DD1}/{@code DDD10} 折叠为 {@code D1}/{@code D10}。
     * 其它套不折叠（用户可自建 DD1）。非法则 null。
     */
    public static String canonicalPigDomainCode(String domainCode) {
        if (domainCode == null || domainCode.isBlank()) return null;
        String upper = domainCode.trim().toUpperCase(Locale.ROOT);
        Matcher multi = Pattern.compile("^D{2,}(\\d{1,3})$").matcher(upper);
        if (multi.matches()) {
            return "D" + multi.group(1);
        }
        return looksLikeBareDomain(upper) ? upper : null;
    }

    /** 裸码是否为误种双 D（DD1、DDD2…）；套作用域 monkey__DD1 不算。 */
    public static boolean isBogusDoubleDBareAtom(String formKey) {
        if (formKey == null || formKey.isBlank()) return false;
        String c = formKey.trim();
        if (c.contains("__")) return false;
        return Pattern.compile("^D{2,}\\d{1,3}$", Pattern.CASE_INSENSITIVE).matcher(c).matches();
    }
}
