package com.example.demo.modules.twin.dahua.support;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.accessfusion.service.AccessAudienceConstants;
import com.example.demo.modules.dahua.mapper.DahuaDepartmentCacheMapper;
import com.example.demo.modules.twin.dahua.entity.DahuaSwingRecord;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Collection;
import java.util.Map;

/**
 * 从大华刷卡 pageData 单行解析人员部门（仅 API 返回字段，不用任务 deptIds 筛选条件冒充）。
 */
@Component
public class DahuaSwingDepartmentSupport {

    private final DahuaDepartmentCacheMapper departmentCacheMapper;

    public DahuaSwingDepartmentSupport(DahuaDepartmentCacheMapper departmentCacheMapper) {
        this.departmentCacheMapper = departmentCacheMapper;
    }

    /** 拉取落库：只写入 API 行上的部门 ID/名称 */
    public void applyToRecord(DahuaSwingRecord record, Map<String, Object> apiRow) {
        Dept dept = extractFromApiRow(apiRow);
        if (StringUtils.hasText(dept.id()) && !StringUtils.hasText(dept.name())) {
            String cached = departmentCacheMapper.selectNameById(parseLongId(dept.id()));
            if (StringUtils.hasText(cached)) {
                dept = new Dept(dept.id(), cached);
            }
        }
        record.setDepartmentId(dept.id());
        record.setDepartmentName(dept.name());
        record.setAudienceType(classifyAudienceForRecord(record));
    }

    public static Dept extractFromApiRow(Map<String, Object> row) {
        if (row == null || row.isEmpty()) {
            return Dept.empty();
        }
        String id =
                firstScalarText(
                        row,
                        "deptId",
                        "departmentId",
                        "department_id",
                        "personDeptId",
                        "personDept",
                        "belongDeptId",
                        "belongDept",
                        "ownerDeptId",
                        "orgId");
        String name =
                firstScalarText(
                        row,
                        "deptName",
                        "departmentName",
                        "department_name",
                        "dept_name",
                        "orgName",
                        "org_name");
        Object nested = row.get("person");
        if (nested instanceof Map<?, ?> person) {
            @SuppressWarnings("unchecked")
            Map<String, Object> pm = (Map<String, Object>) person;
            if (!StringUtils.hasText(id)) {
                id =
                        firstScalarText(
                                pm,
                                "deptId",
                                "departmentId",
                                "department_id",
                                "personDeptId",
                                "orgId");
            }
            if (!StringUtils.hasText(name)) {
                name = firstScalarText(pm, "deptName", "departmentName", "department_name");
            }
        }
        return new Dept(normalizeId(id), blankToNull(name));
    }

    /** 已落库记录：列值为空时从 raw_json 再解析（仍是拉取时保存的原始报文） */
    public static Dept resolveForDisplay(DahuaSwingRecord record) {
        if (record == null) {
            return Dept.empty();
        }
        Dept dept = Dept.empty();
        if (StringUtils.hasText(record.getDepartmentId()) || StringUtils.hasText(record.getDepartmentName())) {
            dept = new Dept(record.getDepartmentId(), record.getDepartmentName());
        }
        if (!StringUtils.hasText(dept.id()) && StringUtils.hasText(record.getRawJson())) {
            try {
                Map<String, Object> parsed = JSON.parseObject(record.getRawJson(), Map.class);
                Dept fromJson = extractFromApiRow(parsed);
                if (StringUtils.hasText(fromJson.id())) {
                    dept =
                            new Dept(
                                    fromJson.id(),
                                    StringUtils.hasText(dept.name()) ? dept.name() : fromJson.name());
                } else if (!StringUtils.hasText(dept.name()) && StringUtils.hasText(fromJson.name())) {
                    dept = new Dept(null, fromJson.name());
                }
            } catch (Exception ignored) {
                // ignore
            }
        }
        return normalizeDeptFields(dept);
    }

    /**
     * 清洗/统计用：补全部门映射名称（大华部门缓存），受众按 ID/名称是否含「学生」判定。
     */
    public Dept resolveForClassification(DahuaSwingRecord record) {
        Dept dept = resolveForDisplay(record);
        if (StringUtils.hasText(dept.id()) && !StringUtils.hasText(dept.name())) {
            String cached = departmentCacheMapper.selectNameById(parseLongId(dept.id()));
            if (StringUtils.hasText(cached)) {
                dept = new Dept(dept.id(), cached);
            }
        }
        return dept;
    }

    /** 用于受众判定：优先记录上的部门名，否则用大华部门缓存映射名 */
    public String mappedDepartmentName(Dept dept) {
        if (dept == null) {
            return null;
        }
        if (StringUtils.hasText(dept.name())) {
            return dept.name().trim();
        }
        if (StringUtils.hasText(dept.id())) {
            String cached = departmentCacheMapper.selectNameById(parseLongId(dept.id()));
            if (StringUtils.hasText(cached)) {
                return cached.trim();
            }
        }
        return null;
    }

    public String classifyAudience(String departmentId, String departmentName) {
        return AccessAudienceConstants.audienceFromDepartment(departmentId, departmentName);
    }

    public String classifyAudienceForRecord(DahuaSwingRecord record) {
        Dept dept = resolveForClassification(record);
        String mappedName = mappedDepartmentName(dept);
        return AccessAudienceConstants.audienceFromDepartment(dept.id(), mappedName);
    }

    /** 误把部门名称写入 department_id 列时纠正 */
    private static Dept normalizeDeptFields(Dept dept) {
        if (dept == null || !StringUtils.hasText(dept.id())) {
            return dept == null ? Dept.empty() : dept;
        }
        String id = dept.id().trim();
        if (looksLikeNumericDeptId(id)) {
            return dept;
        }
        String name = StringUtils.hasText(dept.name()) ? dept.name() : id;
        return new Dept(null, name);
    }

    private static boolean looksLikeNumericDeptId(String id) {
        String norm = id.startsWith("#") ? id.substring(1) : id;
        return norm.matches("\\d+");
    }

    private static String firstScalarText(Map<String, Object> map, String... keys) {
        for (String key : keys) {
            Object v = map.get(key);
            if (v == null) {
                continue;
            }
            if (v instanceof Collection<?> || v instanceof Map<?, ?>) {
                continue;
            }
            String text = String.valueOf(v).trim();
            if (!text.isBlank() && !"null".equalsIgnoreCase(text)) {
                return text;
            }
        }
        return null;
    }

    private static String normalizeId(String id) {
        if (!StringUtils.hasText(id)) {
            return null;
        }
        String t = id.trim();
        if (t.startsWith("#")) {
            t = t.substring(1);
        }
        return t;
    }

    private static String blankToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }

    private static Long parseLongId(String id) {
        try {
            return Long.parseLong(id.trim());
        } catch (Exception e) {
            return null;
        }
    }

    public record Dept(String id, String name) {
        static Dept empty() {
            return new Dept(null, null);
        }
    }
}
