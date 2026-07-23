package com.example.demo.modules.accessfusion.service;

/**
 * 学生/工作人员标签：部门 ID 或部门映射名称含「学生」→ 学生，其余 → 工作人员。
 * 仅用于展示与统计分栏，清洗规则不得按此排除记录。
 */
public final class AccessAudienceConstants {

    public static final String AUDIENCE_STUDENT = "STUDENT";
    public static final String AUDIENCE_STAFF = "STAFF";

    private static final String STUDENT_MARKER = "学生";

    private AccessAudienceConstants() {}

    /** 部门 ID 文本含「学生」时视为学生部门（非纯数字 ID 场景） */
    public static boolean isStudentDepartmentId(String departmentId) {
        if (departmentId == null || departmentId.isBlank()) {
            return false;
        }
        return normalizeDeptId(departmentId).contains(STUDENT_MARKER);
    }

    /** 部门名称 / 大华部门缓存映射名含「学生」 */
    public static boolean isStudentDepartmentName(String departmentName) {
        if (departmentName == null || departmentName.isBlank()) {
            return false;
        }
        return departmentName.trim().contains(STUDENT_MARKER);
    }

    public static boolean isStudentDepartment(String departmentId, String departmentName) {
        return isStudentDepartmentId(departmentId) || isStudentDepartmentName(departmentName);
    }

    /** ARO 流水 {@code user_type_names} 含「学生」时视为学生 */
    public static boolean isStudentUserTypeNames(String userTypeNames) {
        if (userTypeNames == null || userTypeNames.isBlank()) {
            return false;
        }
        return userTypeNames.trim().contains(STUDENT_MARKER);
    }

    /** 部门或人员类型任一命中学生规则 */
    public static boolean isStudentPersonnel(
            String departmentId, String departmentName, String userTypeNames) {
        return isStudentDepartment(departmentId, departmentName) || isStudentUserTypeNames(userTypeNames);
    }

    public static String audienceFromDepartmentId(String departmentId) {
        return isStudentDepartmentId(departmentId) ? AUDIENCE_STUDENT : AUDIENCE_STAFF;
    }

    public static String audienceFromDepartment(String departmentId, String departmentName) {
        return isStudentDepartment(departmentId, departmentName) ? AUDIENCE_STUDENT : AUDIENCE_STAFF;
    }

    public static String studentRuleLabel() {
        return "部门ID/名称或人员类型含「学生」→学生，其余→工作人员";
    }

    private static String normalizeDeptId(String departmentId) {
        String norm = departmentId.trim();
        if (norm.startsWith("#")) {
            norm = norm.substring(1);
        }
        return norm;
    }
}
