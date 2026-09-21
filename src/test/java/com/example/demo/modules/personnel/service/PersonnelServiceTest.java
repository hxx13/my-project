package com.example.demo.modules.personnel.service;

import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.*;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PersonnelServiceTest {

    @Mock private JdbcTemplate jdbcTemplate;
    @Mock private PersonnelMapper personnelMapper;
    @Mock private UserMapper userMapper;

    private PersonnelService service() {
        return new PersonnelService(personnelMapper, userMapper, jdbcTemplate);
    }

    @Test
    void listRooms_splits_all_delimiters_dedups_and_keeps_order() {
        PersonnelService service = service();
        when(jdbcTemplate.queryForList(anyString())).thenReturn(List.of(
                Map.of("allowed_rooms_display_zh", "B5-101、B5-102，B6-201,B6-202"),
                Map.of("allowed_rooms_display_zh", "B5-101; B6-202")
        ));
        assertEquals(List.of("B5-101", "B5-102", "B6-201", "B6-202"), service.listRooms());
    }

    @Test
    void listRooms_skips_blank_or_null_rows() {
        PersonnelService service = service();
        Map<String, Object> nullRow = new HashMap<>();
        nullRow.put("allowed_rooms_display_zh", null);
        when(jdbcTemplate.queryForList(anyString())).thenReturn(List.of(
                Map.of("allowed_rooms_display_zh", ""),
                Map.of("allowed_rooms_display_zh", "，；"),
                nullRow
        ));
        assertEquals(List.of(), service.listRooms());
    }

    @Test
    void listRooms_splits_fullwidth_semicolon_and_skips_whitespace_tokens() {
        PersonnelService service = service();
        when(jdbcTemplate.queryForList(anyString())).thenReturn(List.of(
                Map.of("allowed_rooms_display_zh", "B5-101；B6-202,   ,B5-102；  ")
        ));
        assertEquals(List.of("B5-101", "B6-202", "B5-102"), service.listRooms());
    }

    @Test
    void updateName_rejects_blank() {
        PersonnelService service = service();
        assertThrows(RuntimeException.class, () -> service.updateName(1L, "  "));
        assertThrows(RuntimeException.class, () -> service.updateName(1L, null));
    }

    @Test
    void updateName_allows_duplicate_name() {
        PersonnelService service = service();
        Personnel self = new Personnel();
        self.setId(1L);
        self.setName("旧名");
        when(personnelMapper.findById(1L)).thenReturn(self);
        when(jdbcTemplate.update(eq("UPDATE personnel SET name = ? WHERE id = ?"), eq("李四"), eq(1L))).thenReturn(1);

        // 允许改成与其他人员相同的姓名：姓名已不是唯一键
        service.updateName(1L, "李四");

        verify(jdbcTemplate).update(eq("UPDATE personnel SET name = ? WHERE id = ?"), eq("李四"), eq(1L));
    }

    @Test
    void updateName_writes_personnel_and_linked_sources_not_username() {
        PersonnelService service = service();
        Personnel self = new Personnel();
        self.setId(1L);
        self.setName("旧名");
        self.setStaffId("STAFF_1");
        self.setAroUserId("190001");
        when(personnelMapper.findById(1L)).thenReturn(self);
        when(jdbcTemplate.update(eq("UPDATE personnel SET name = ? WHERE id = ?"), eq("新姓名"), eq(1L))).thenReturn(1);
        when(jdbcTemplate.update(eq("UPDATE aro_personnel SET name = ? WHERE user_id = ?"), eq("新姓名"), eq("190001")))
                .thenReturn(1);

        service.updateName(1L, "  新姓名  ");

        verify(userMapper).updateNameById("STAFF_1", "新姓名");
        verify(userMapper).updateNameById("190001", "新姓名");
        verify(userMapper, never()).updateUsernameById(anyString(), anyString());
        verify(userMapper, never()).updateDisplayNicknameById(anyString(), anyString());
    }

    @Test
    void resolveIdByAccount_prefersStaffId_thenAroUserId_thenNull() {
        PersonnelService service = service();
        Personnel p = new Personnel();
        p.setId(7L);
        when(personnelMapper.findByStaffId("STAFF_0001")).thenReturn(p);
        assertEquals("7", service.resolveIdByAccount("STAFF_0001"));

        when(personnelMapper.findByStaffId("1234567890123456789")).thenReturn(null);
        when(personnelMapper.findByAroUserId("1234567890123456789")).thenReturn(p);
        assertEquals("7", service.resolveIdByAccount("1234567890123456789"));

        when(personnelMapper.findByStaffId("NOPE")).thenReturn(null);
        when(personnelMapper.findByAroUserId("NOPE")).thenReturn(null);
        assertNull(service.resolveIdByAccount("NOPE"));
    }

    @Test
    void resolveStaffIds_skipsBlankAndNoStaff() {
        PersonnelService service = service();
        Personnel withStaff = new Personnel(); withStaff.setId(1L); withStaff.setStaffId("STAFF_A");
        Personnel noStaff = new Personnel(); noStaff.setId(2L);
        when(personnelMapper.findById(1L)).thenReturn(withStaff);
        when(personnelMapper.findById(2L)).thenReturn(noStaff);
        assertEquals(List.of("STAFF_A"), service.resolveStaffIds(List.of("1", "2", "999", "")));
    }

    @Test
    void syncUnified_keys_students_by_aro_user_id_not_by_name() {
        PersonnelService service = service();
        // 两个同名但 aro_user_id 不同的学生
        when(jdbcTemplate.queryForList(anyString())).thenReturn(List.of(
                Map.of("user_id", "1960228514405916673", "name", "李洋", "job_number", "025723910598"),
                Map.of("user_id", "1995389058993467393", "name", "李洋", "job_number", "184854")
        ));
        when(personnelMapper.findByAroUserId(anyString())).thenReturn(null);

        service.syncUnified();

        // 两个李洋各自插入一行，绝不合并
        verify(personnelMapper, times(2)).insert(any(Personnel.class));
        verify(personnelMapper, never()).findByNameAll(anyString());
    }

    @Test
    void syncUnified_updates_existing_row_matched_by_aro_user_id() {
        PersonnelService service = service();
        when(jdbcTemplate.queryForList(anyString())).thenReturn(List.of(
                Map.of("user_id", "1960228514405916673", "name", "李洋", "job_number", "025723910598")
        ));
        Personnel existing = new Personnel();
        existing.setId(7L);
        existing.setAroUserId("1960228514405916673");
        existing.setName("李洋");
        when(personnelMapper.findByAroUserId("1960228514405916673")).thenReturn(existing);

        service.syncUnified();

        verify(personnelMapper, never()).insert(any(Personnel.class));
        verify(personnelMapper).update(existing);
    }

    @Test
    void syncUnified_keys_staff_by_staff_id() {
        PersonnelService service = service();
        when(jdbcTemplate.queryForList(anyString())).thenReturn(List.of(
                Map.of("id", "STAFF_abc", "name", "张老师")
        ));
        when(personnelMapper.findByStaffId(anyString())).thenReturn(null);

        service.syncUnified();

        verify(personnelMapper).insert(any(Personnel.class));
        verify(personnelMapper, never()).findByNameAll(anyString());
    }

    @Test
    void syncUnified_does_not_clear_official_room_permission_on_merged_row() {
        PersonnelService service = service();
        // 一个历史上已合并的行：同时带 aro_user_id 与 staff_id，且授权为 1
        Personnel merged = new Personnel();
        merged.setId(9L);
        merged.setAroUserId("1960228514405916673");
        merged.setStaffId("STAFF_merged");
        merged.setName("李洋");
        merged.setHasOfficialRoomPermission(1);

        // 学生查询返回带授权的行；教职工查询返回不含该列的行
        when(jdbcTemplate.queryForList(contains("FROM aro_personnel")))
                .thenReturn(List.of(Map.of(
                        "user_id", "1960228514405916673",
                        "name", "李洋",
                        "has_official_room_permission", 1)));
        when(jdbcTemplate.queryForList(contains("FROM sys_user")))
                .thenReturn(List.of(Map.of(
                        "id", "STAFF_merged",
                        "name", "李洋")));
        when(personnelMapper.findByAroUserId("1960228514405916673")).thenReturn(merged);
        when(personnelMapper.findByStaffId("STAFF_merged")).thenReturn(merged);

        service.syncUnified();

        assertEquals(1, merged.getHasOfficialRoomPermission(),
                "已合并行的官方房间授权不能被教职工同步分支清零");
    }

    @Test
    void resolveIdByName_returns_id_when_name_is_unique() {
        PersonnelService service = service();
        Personnel p = new Personnel();
        p.setId(42L);
        p.setName("独一份");
        when(personnelMapper.findByNameAll("独一份")).thenReturn(List.of(p));

        assertEquals("42", service.resolveIdByName("独一份"));
    }

    @Test
    void resolveIdByName_returns_null_when_name_is_ambiguous() {
        PersonnelService service = service();
        Personnel a = new Personnel(); a.setId(1L); a.setName("张燕");
        Personnel b = new Personnel(); b.setId(2L); b.setName("张燕");
        when(personnelMapper.findByNameAll("张燕")).thenReturn(List.of(a, b));

        assertNull(service.resolveIdByName("张燕"), "同名必须返回 null，绝不能猜");
    }

    @Test
    void resolveIdByName_returns_null_when_not_found() {
        PersonnelService service = service();
        when(personnelMapper.findByNameAll("查无此人")).thenReturn(List.of());

        assertNull(service.resolveIdByName("查无此人"));
    }

    @Test
    void ensureStaffPersonnel_does_not_claim_row_by_name() {
        PersonnelService service = service();
        when(personnelMapper.findByStaffId("STAFF_new")).thenReturn(null);

        service.ensureStaffPersonnel("STAFF_new", "张燕", "STAFF", "");

        // 姓名不再参与认人：不得按姓名去认领别人的行
        verify(personnelMapper, never()).findByNameAll(anyString());
        verify(personnelMapper).insert(any(Personnel.class));
    }

    // ─────────── 回收站 ───────────

    @Test
    void moveToTrash_marks_deleted_at_and_operator() {
        PersonnelService service = service();
        Personnel row = new Personnel();
        row.setId(9L);
        row.setName("张三");
        when(personnelMapper.findById(9L)).thenReturn(row);

        service.moveToTrash(9L, "STAFF_admin");

        verify(jdbcTemplate).update(contains("deleted_at = NOW()"), eq("STAFF_admin"), eq(9L));
    }

    @Test
    void moveToTrash_rejects_already_deleted() {
        PersonnelService service = service();
        Personnel row = new Personnel();
        row.setId(9L);
        row.setDeletedAt("2026-09-21 10:00:00");
        when(personnelMapper.findById(9L)).thenReturn(row);

        assertThrows(IllegalArgumentException.class, () -> service.moveToTrash(9L, "STAFF_admin"));
    }

    @Test
    void restoreFromTrash_clears_the_mark() {
        PersonnelService service = service();
        Personnel row = new Personnel();
        row.setId(9L);
        row.setDeletedAt("2026-09-21 10:00:00");
        when(personnelMapper.findById(9L)).thenReturn(row);

        service.restoreFromTrash(9L);

        verify(jdbcTemplate).update(contains("deleted_at = NULL"), eq(9L));
    }

    @Test
    void purge_deletes_personnel_and_both_accounts_and_aro_row() {
        PersonnelService service = service();
        Personnel row = new Personnel();
        row.setId(9L);
        row.setName("张三");
        row.setAroUserId("2101882605434470400");
        row.setStaffId("STAFF_x");
        when(personnelMapper.findById(9L)).thenReturn(row);

        service.purge(9L);

        // 切断"下次同步重建"的源头：aro_personnel 行与两个登录账号都要删
        verify(jdbcTemplate).update(contains("aro_personnel"), eq("2101882605434470400"));
        verify(jdbcTemplate).update(contains("sys_user"), eq("2101882605434470400"));
        verify(jdbcTemplate).update(contains("sys_user"), eq("STAFF_x"));
        verify(personnelMapper).deleteById(9L);
    }
}
