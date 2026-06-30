package com.example.demo.modules.twin.common.util;

import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
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

    public static boolean belongsToGroup(String projectGroupNameField, String targetGroup) {
        if (!StringUtils.hasText(targetGroup)) {
            return false;
        }
        String tg = targetGroup.trim();
        for (String g : splitGroups(projectGroupNameField)) {
            if (g.equals(tg)) {
                return true;
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
}
