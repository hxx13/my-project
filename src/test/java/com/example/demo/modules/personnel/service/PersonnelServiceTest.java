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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.never;
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
    void updateName_rejects_when_name_taken_by_another() {
        PersonnelService service = service();
        Personnel self = new Personnel();
        self.setId(1L);
        self.setName("旧名");
        Personnel other = new Personnel();
        other.setId(2L);
        other.setName("已占用");
        when(personnelMapper.findById(1L)).thenReturn(self);
        when(personnelMapper.findByName("已占用")).thenReturn(other);
        RuntimeException ex = assertThrows(RuntimeException.class, () -> service.updateName(1L, "已占用"));
        assertEquals("姓名已被占用，请换一个或先处理同名人员", ex.getMessage());
        verify(jdbcTemplate, never()).update(startsWith("UPDATE personnel SET name"), any(), any());
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
        when(personnelMapper.findByName("新姓名")).thenReturn(null);
        when(jdbcTemplate.update(eq("UPDATE personnel SET name = ? WHERE id = ?"), eq("新姓名"), eq(1L))).thenReturn(1);
        when(jdbcTemplate.update(eq("UPDATE aro_personnel SET name = ? WHERE user_id = ?"), eq("新姓名"), eq("190001")))
                .thenReturn(1);

        service.updateName(1L, "  新姓名  ");

        verify(userMapper).updateNameById("STAFF_1", "新姓名");
        verify(userMapper).updateNameById("190001", "新姓名");
        verify(userMapper, never()).updateUsernameById(anyString(), anyString());
        verify(userMapper, never()).updateDisplayNicknameById(anyString(), anyString());
    }
}
