package com.example.demo.modules.nhp.util;

import java.util.Comparator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * D1 / D1.02 / D1.02.003 等编码的数值序比较。
 * 避免字符串序把 D10 排到 D2 前面。
 */
public final class CodedIdOrder {

    private static final Pattern DOMAIN_NUM = Pattern.compile("^D+(\\d+)", Pattern.CASE_INSENSITIVE);

    public static final Comparator<String> COMPARATOR = CodedIdOrder::compare;

    private CodedIdOrder() {}

    public static int compare(String a, String b) {
        String[] pa = String.valueOf(a == null ? "" : a).split("\\.");
        String[] pb = String.valueOf(b == null ? "" : b).split("\\.");
        int n = Math.max(pa.length, pb.length);
        for (int i = 0; i < n; i++) {
            String sa = i < pa.length ? pa[i] : "";
            String sb = i < pb.length ? pb[i] : "";
            Integer na = segmentNum(sa);
            Integer nb = segmentNum(sb);
            if (na != null && nb != null && !na.equals(nb)) {
                return Integer.compare(na, nb);
            }
            if (na != null && nb == null) {
                return -1;
            }
            if (na == null && nb != null) {
                return 1;
            }
            int c = sa.compareToIgnoreCase(sb);
            if (c != 0) {
                return c;
            }
        }
        return 0;
    }

    private static Integer segmentNum(String seg) {
        if (seg == null || seg.isBlank()) {
            return null;
        }
        if (seg.chars().allMatch(Character::isDigit)) {
            return Integer.parseInt(seg);
        }
        // 支持套作用域原子码 monkey__D1
        int us = seg.lastIndexOf("__");
        String domainPart = us >= 0 ? seg.substring(us + 2) : seg;
        Matcher m = DOMAIN_NUM.matcher(domainPart);
        return m.find() ? Integer.parseInt(m.group(1)) : null;
    }
}
