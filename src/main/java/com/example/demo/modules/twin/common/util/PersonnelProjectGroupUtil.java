package com.example.demo.modules.twin.common.util;

import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * aro_personnel.project_group_name 可能为逗号/顿号分隔的多课题组字段。
 */
public final class PersonnelProjectGroupUtil {

    private PersonnelProjectGroupUtil() {
    }

    public static List<String> splitGroups(String raw) {
        if (!StringUtils.hasText(raw)) {
            return List.of();
        }
        return Arrays.stream(raw.split("[,，、;；]"))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .distinct()
                .toList();
    }

    /** 主课题组名（多组时取第一个）；空返回 null。用于只存单值的字段（aup_record/ref_order 的课题组列）。 */
    public static String primaryGroup(String raw) {
        List<String> groups = splitGroups(raw);
        return groups.isEmpty() ? null : groups.get(0);
    }

    /**
     * 两个课题组字段是否同组。两侧都可能是多组拼接串，逐个组名**精确**比对。
     *
     * <p>与 {@link #belongsToGroup} 的区别：本方法不做子串/前缀模糊 —— 鉴权与归属判定要确定性，
     * 否则「33」这类组名会匹配到任何含 33 的组上。
     */
    public static boolean sameGroup(String a, String b) {
        Set<String> left = new LinkedHashSet<>(splitGroups(a));
        if (left.isEmpty()) {
            return false;
        }
        for (String g : splitGroups(b)) {
            if (left.contains(g)) {
                return true;
            }
        }
        return false;
    }

    public static boolean belongsToGroup(String projectGroupNameField, String targetGroup) {
        if (!StringUtils.hasText(targetGroup)) {
            return false;
        }
        String tg = targetGroup.trim();
        for (String g : splitGroups(projectGroupNameField)) {
            // 1) Exact match (fast path)
            if (g.equals(tg)) {
                return true;
            }
            // 2) Substring containment — cage shelf stores bare PI name ("张老师")
            //    while personnel archive stores full group name ("张老师的课题组")
            if (tg.length() >= 2 && g.length() >= 2) {
                if (g.contains(tg) || tg.contains(g)) {
                    return true;
                }
            }
            // 3) Extract PI prefix from group name ("张老师的课题组" → "张老师")
            //    and compare against target
            String extracted = extractPiPrefixFromGroupName(g);
            if (!extracted.isEmpty() && extracted.length() >= 2) {
                if (extracted.equals(tg) || extracted.contains(tg) || tg.contains(extracted)) {
                    return true;
                }
            }
            // 4) Also try extracting from target in case target is the full group name
            String targetExtracted = extractPiPrefixFromGroupName(tg);
            if (!targetExtracted.isEmpty() && targetExtracted.length() >= 2) {
                if (targetExtracted.equals(g) || g.contains(targetExtracted) || targetExtracted.contains(g)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * 笼位是否属于用户课题组：以课题 PI 姓名与用户课题组名称是否一致/包含为准。
     * 例：笼盒 PI「徐楠杰」↔ 本人课题组「徐楠杰的课题组」。
     */
    public static boolean cellBelongsToAnyUserGroup(List<String> userGroupNames,
                                                    String cellPiName,
                                                    String cellDepartmentName) {
        if (userGroupNames == null || userGroupNames.isEmpty()) {
            return false;
        }
        String pi = normalizeToken(cellPiName);
        String dept = normalizeToken(cellDepartmentName);
        if (pi.isEmpty() && dept.isEmpty()) {
            return false;
        }
        for (String rawGroup : userGroupNames) {
            if (matchesSingleGroup(rawGroup, pi, dept)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 归纳一处笼位的课题组名：优先 AUP 的 projectGroupName，退回 project_pi_name + department_name。
     * 与 {@code CageOperationService#cageGroupNames} 同规则，提取出来供多处复用。
     */
    public static List<String> groupNames(String aupGroupName, String projectPiName, String departmentName) {
        if (aupGroupName != null && !aupGroupName.isBlank()) {
            return splitGroups(aupGroupName);
        }
        List<String> out = new ArrayList<>();
        out.addAll(splitGroups(projectPiName));
        out.addAll(splitGroups(departmentName));
        return out.stream().filter(s -> s != null && !s.isBlank()).distinct().toList();
    }

    /** 从「XXX的课题组」提取 PI 前缀（XXX） */
    public static String extractPiPrefixFromGroupName(String groupName) {
        String g = normalizeToken(groupName);
        if (g.isEmpty()) {
            return "";
        }
        if (g.endsWith("的课题组")) {
            return g.substring(0, g.length() - "的课题组".length()).trim();
        }
        if (g.endsWith("课题组") && g.length() > 3) {
            return g.substring(0, g.length() - 3).trim();
        }
        int idx = g.indexOf('的');
        if (idx > 0) {
            return g.substring(0, idx).trim();
        }
        return "";
    }

    private static boolean matchesSingleGroup(String rawGroup, String pi, String dept) {
        String group = normalizeToken(rawGroup);
        if (group.isEmpty()) {
            return false;
        }
        if (!pi.isEmpty() && group.equals(pi)) {
            return true;
        }
        if (!dept.isEmpty() && group.equals(dept)) {
            return true;
        }
        if (!pi.isEmpty() && pi.length() >= 2 && group.contains(pi)) {
            return true;
        }
        if (!dept.isEmpty() && dept.length() >= 2 && group.contains(dept)) {
            return true;
        }
        if (!pi.isEmpty() && pi.length() >= 2 && pi.contains(group)) {
            return true;
        }
        String extracted = extractPiPrefixFromGroupName(group);
        if (!extracted.isEmpty()) {
            if (!pi.isEmpty() && (pi.equals(extracted) || pi.contains(extracted) || extracted.contains(pi))) {
                return true;
            }
            if (!dept.isEmpty() && (dept.equals(extracted) || dept.contains(extracted))) {
                return true;
            }
        }
        return false;
    }

    private static String normalizeToken(String raw) {
        return raw == null ? "" : raw.trim();
    }

    /** 从档案库 project_group_name 列值中拆分并去重，按关键字过滤（不区分大小写包含） */
    public static List<String> distinctGroupsMatchingKeyword(List<String> rawFields, String keyword, int max) {
        if (rawFields == null || rawFields.isEmpty()) {
            return List.of();
        }
        String kw = keyword == null ? "" : keyword.trim().toLowerCase(Locale.ROOT);
        Set<String> seen = new LinkedHashSet<>();
        List<String> out = new ArrayList<>();
        for (String field : rawFields) {
            for (String token : splitGroups(field)) {
                if (!StringUtils.hasText(token) || seen.contains(token)) {
                    continue;
                }
                if (!kw.isEmpty() && !token.toLowerCase(Locale.ROOT).contains(kw)) {
                    continue;
                }
                seen.add(token);
                out.add(token);
                if (out.size() >= max) {
                    return out;
                }
            }
        }
        return out;
    }

    /**
     * 一个字都没精确命中时的兜底：按**姓名相似度**挑出最像的几个组名。
     *
     * <p>为什么不能退回「按姓氏子串搜」（2026-10-13 真机）：用户找「郑均克」的组（库里叫「郑俊克的课题组」），
     * 子串搜一个字都不命中，于是退成按「郑」搜 —— 回来的「郑杰的课题组」「郑铨的课题组」只跟用户
     * 共一个姓，跟要找的人毫无关系，用户的原话是「我是三个音节，问我两个音节的，太死板」。
     * 换成相似度（同字优先、同音次之、长度差不超过一个字）之后，三字名只会对上三字名。
     *
     * <p>比的是组名里的 **PI 前缀**（「郑俊克的课题组」→「郑俊克」），不是整个组名 ——
     * 否则「的课题组」这四个字会白送四分，把只共一个姓的人一起抬上来。
     *
     * @param rawFields 宽口径捞回来的 project_group_name 原值（含逗号分隔的多组）
     * @return 按相似度降序，最多 {@code max} 个；一个都不像就空
     */
    public static List<String> rankGroupsBySimilarity(List<String> rawFields, String keyword, int max) {
        if (rawFields == null || rawFields.isEmpty()) {
            return List.of();
        }
        String kw = keyword == null ? "" : keyword.trim();
        if (kw.length() < 2) {
            return List.of();
        }
        Map<String, Integer> scored = new LinkedHashMap<>();
        for (String field : rawFields) {
            for (String token : splitGroups(field)) {
                if (!StringUtils.hasText(token)) {
                    continue;
                }
                String pi = extractPiPrefixFromGroupName(token);
                int score = ChineseNameSimilarity.score(pi.isEmpty() ? token : pi, kw);
                if (score > 0) {
                    scored.merge(token, score, Math::max);
                }
            }
        }
        return scored.entrySet().stream()
                .sorted((x, y) -> Integer.compare(y.getValue(), x.getValue()))
                .map(Map.Entry::getKey)
                .limit(Math.max(max, 1))
                .toList();
    }
}
