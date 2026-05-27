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
