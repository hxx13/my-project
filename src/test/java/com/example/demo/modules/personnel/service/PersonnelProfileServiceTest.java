package com.example.demo.modules.personnel.service;

import com.example.demo.modules.personnel.entity.Personnel;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PersonnelProfileServiceTest {

    @Mock private PersonnelService personnelService;
    @Mock private JdbcTemplate jdbcTemplate;

    private PersonnelProfileService service() {
        return new PersonnelProfileService(personnelService, jdbcTemplate);
    }

    private static Personnel row(Long id, String aroUserId) {
        Personnel p = new Personnel();
        p.setId(id);
        p.setAroUserId(aroUserId);
        p.setName("张三");
        return p;
    }

    @Test
    void updateMyProfile_onlyUpdatesNonEmptyFields() {
        when(personnelService.resolveByAccount("U1")).thenReturn(row(1L, "123"));

        service().updateMyProfile("U1", "张三", "   ", null, null);

        verify(jdbcTemplate).update("UPDATE personnel SET name = ? WHERE id = ?", "张三", 1L);
        verify(jdbcTemplate).update("UPDATE aro_personnel SET name = ? WHERE user_id = ?", "张三", "123");
        verify(jdbcTemplate, never()).update(startsWith("UPDATE personnel SET mobile_phone"), any(), any());
        verify(jdbcTemplate, never()).update(startsWith("UPDATE personnel SET gender"), any(), any());
        verify(jdbcTemplate, never()).update(startsWith("UPDATE personnel SET department"), any(), any(), any());
    }

    @Test
    void updateMyProfile_departmentWritesNameAndResolvedId() {
        when(personnelService.resolveByAccount("U1")).thenReturn(row(1L, "123"));
        when(jdbcTemplate.queryForObject(anyString(), eq(Long.class), eq("基础医学院"))).thenReturn(42L);

        service().updateMyProfile("U1", null, null, null, " 基础医学院 ");

        verify(jdbcTemplate).update(
                "UPDATE personnel SET department_name = ?, department_id = ? WHERE id = ?",
                "基础医学院", 42L, 1L);
        verify(jdbcTemplate).update(
                "UPDATE aro_personnel SET department_name = ? WHERE user_id = ?",
                "基础医学院", "123");
    }

    @Test
    void updateMyProfile_throwsWhenPersonnelNotFound() {
        when(personnelService.resolveByAccount("U1")).thenReturn(null);

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> service().updateMyProfile("U1", "张三", null, null, null));

        assertEquals("未找到人员档案", ex.getMessage());
        verify(jdbcTemplate, never()).update(anyString(), any(), any());
    }
}
