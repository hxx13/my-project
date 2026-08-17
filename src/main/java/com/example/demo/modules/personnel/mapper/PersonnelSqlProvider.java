package com.example.demo.modules.personnel.mapper;

import com.example.demo.modules.personnel.dto.PersonnelFilter;

/** 统一人员查询动态 SQL：search 与 count 共享同一 WHERE 构建，保证条件一致。 */
public class PersonnelSqlProvider {

    private static final String COLUMNS = "SELECT p.id, p.name, p.staff_id AS staffId, p.aro_user_id AS aroUserId, " +
            "p.job_number AS jobNumber, p.department_name AS departmentName, p.project_group_name AS projectGroupName, " +
            "p.institution_id AS institutionId, p.user_type_names AS userTypeNames, p.head, p.gender, " +
            "p.mobile_phone AS mobilePhone, p.email, p.is_school AS isSchool, " +
            "p.allowed_rooms_display_zh AS allowedRoomsDisplayZh, p.has_official_room_permission AS hasOfficialRoomPermission, " +
            "su_staff.role AS role, su_staff.status AS status, su_staff.username AS staffUsername, " +
            "su_student.username AS studentUsername, su_staff.open_id AS staffOpenId, " +
            "su_staff.account_source AS staffAccountSource, su_staff.display_nickname AS staffDisplayNickname, " +
            "su_staff.create_time AS staffCreateTime, " +
            "COALESCE(su_staff.contact_email, ap_student.contact_email, su_student.contact_email) AS contactEmail, " +
            "COALESCE(su_staff.send_key, ap_student.send_key, su_student.send_key) AS sendKey, " +
            "COALESCE(su_staff.wx_pusher_uid, ap_student.wx_pusher_uid, su_student.wx_pusher_uid) AS wxPusherUid ";

    private static final String FROM = "FROM personnel p " +
            "LEFT JOIN sys_user su_staff ON su_staff.id = p.staff_id " +
            "LEFT JOIN aro_personnel ap_student ON ap_student.user_id = p.aro_user_id " +
            "LEFT JOIN sys_user su_student ON su_student.id = p.aro_user_id ";

    public static String search(PersonnelFilter f) {
        return COLUMNS + FROM + where(f) + " ORDER BY p.id ASC LIMIT #{limit} OFFSET #{offset}";
    }

    public static String count(PersonnelFilter f) {
        return "SELECT COUNT(1) " + FROM + where(f);
    }

    /** 所有条件参数化（#{…}），结构拼接用白名单常量，杜绝注入。 */
    private static String where(PersonnelFilter f) {
        StringBuilder sb = new StringBuilder("WHERE 1=1 ");
        if (hasText(f.getKeyword())) {
            sb.append("AND (p.name LIKE CONCAT('%', #{keyword}, '%') ")
              .append("OR p.staff_id LIKE CONCAT('%', #{keyword}, '%') ")
              .append("OR p.aro_user_id LIKE CONCAT('%', #{keyword}, '%') ")
              .append("OR p.job_number LIKE CONCAT('%', #{keyword}, '%') ")
              .append("OR p.mobile_phone LIKE CONCAT('%', #{keyword}, '%') ")
              .append("OR p.department_name LIKE CONCAT('%', #{keyword}, '%') ")
              .append("OR p.project_group_name LIKE CONCAT('%', #{keyword}, '%') ")
              .append("OR su_staff.username LIKE CONCAT('%', #{keyword}, '%') ")
              .append("OR su_student.username LIKE CONCAT('%', #{keyword}, '%')) ");
        }
        if ("sys".equals(f.getAccountType())) {
            sb.append("AND p.staff_id IS NOT NULL AND p.staff_id <> '' ");
        } else if ("nosys".equals(f.getAccountType())) {
            sb.append("AND (p.staff_id IS NULL OR p.staff_id = '') ");
        }
        if (hasText(f.getProjectGroupName())) {
            sb.append("AND p.project_group_name = #{projectGroupName} ");
        }
        if (hasText(f.getDepartmentName())) {
            sb.append("AND p.department_name = #{departmentName} ");
        }
        if (hasText(f.getRole())) {
            sb.append("AND su_staff.role = #{role} ");
        }
        if (f.getStatus() != null) {
            sb.append("AND su_staff.status = #{status} ");
        }
        if (f.getIsSchool() != null) {
            sb.append("AND p.is_school = #{isSchool} ");
        }
        if (hasText(f.getRoomName())) {
            sb.append("AND p.allowed_rooms_display_zh LIKE CONCAT('%', #{roomName}, '%') ");
        }
        if (f.getIdentityTagId() != null) {
            sb.append("AND EXISTS (SELECT 1 FROM person_identity pi WHERE pi.user_id = p.staff_id AND pi.tag_id = #{identityTagId}) ");
        }
        return sb.toString();
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }
}
