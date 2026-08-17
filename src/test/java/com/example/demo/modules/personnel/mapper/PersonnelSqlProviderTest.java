package com.example.demo.modules.personnel.mapper;

import com.example.demo.modules.personnel.dto.PersonnelFilter;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PersonnelSqlProviderTest {

    private PersonnelFilter base() {
        PersonnelFilter f = new PersonnelFilter();
        f.setLimit(20);
        f.setOffset(0);
        return f;
    }

    @Test
    void search_and_count_share_same_where_without_filters() {
        PersonnelFilter f = base();
        String search = PersonnelSqlProvider.search(f);
        String count = PersonnelSqlProvider.count(f);
        assertTrue(search.contains("SELECT"));
        assertTrue(count.contains("SELECT COUNT(1)"));
        assertTrue(search.contains("WHERE 1=1"));
        assertTrue(count.contains("WHERE 1=1"));
        // LIMIT/OFFSET 只在 search，count 不含
        assertTrue(search.contains("LIMIT #{limit} OFFSET #{offset}"));
        assertFalse(count.contains("LIMIT"));
    }

    @Test
    void all_filters_emit_expected_fragments() {
        PersonnelFilter f = base();
        f.setKeyword("张");
        f.setAccountType("sys");
        f.setProjectGroupName("生物信息");
        f.setDepartmentName("信息工程学院");
        f.setRole("STAFF");
        f.setStatus(1);
        f.setIsSchool(1);
        f.setRoomName("B5");
        f.setIdentityTagId(7L);
        String where = PersonnelSqlProvider.search(f);
        assertTrue(where.contains("p.name LIKE CONCAT('%', #{keyword}, '%')"));
        assertTrue(where.contains("su_staff.username LIKE CONCAT('%', #{keyword}, '%')"));
        assertTrue(where.contains("p.job_number LIKE CONCAT('%', #{keyword}, '%')"));
        assertTrue(where.contains("p.mobile_phone LIKE CONCAT('%', #{keyword}, '%')"));
        assertTrue(where.contains("p.staff_id IS NOT NULL AND p.staff_id <> ''"));
        assertTrue(where.contains("p.project_group_name = #{projectGroupName}"));
        assertTrue(where.contains("p.department_name = #{departmentName}"));
        assertTrue(where.contains("su_staff.role = #{role}"));
        assertTrue(where.contains("su_staff.status = #{status}"));
        assertTrue(where.contains("p.is_school = #{isSchool}"));
        assertTrue(where.contains("p.allowed_rooms_display_zh LIKE CONCAT('%', #{roomName}, '%')"));
        assertTrue(where.contains("EXISTS (SELECT 1 FROM person_identity pi WHERE pi.user_id = p.staff_id AND pi.tag_id = #{identityTagId})"));
    }

    @Test
    void nosys_uses_null_or_empty_staff_id() {
        PersonnelFilter f = base();
        f.setAccountType("nosys");
        assertTrue(PersonnelSqlProvider.search(f).contains("(p.staff_id IS NULL OR p.staff_id = '')"));
    }

    @Test
    void count_contains_same_filter_fragments_as_search() {
        PersonnelFilter f = base();
        f.setKeyword("李");
        f.setAccountType("nosys");
        f.setRole("ADMIN");
        f.setIdentityTagId(2L);
        String search = PersonnelSqlProvider.search(f);
        String count = PersonnelSqlProvider.count(f);
        assertTrue(count.contains("p.name LIKE CONCAT('%', #{keyword}, '%')"));
        assertTrue(count.contains("(p.staff_id IS NULL OR p.staff_id = '')"));
        assertTrue(count.contains("su_staff.role = #{role}"));
        assertTrue(count.contains("pi.user_id = p.staff_id AND pi.tag_id = #{identityTagId}"));
        assertTrue(search.startsWith("SELECT p.id,"));
    }
}
