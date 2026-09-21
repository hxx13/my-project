package com.example.demo.modules.personnel.service;

import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PersonnelHeadServiceTest {

    @Mock private JdbcTemplate jdbcTemplate;
    @Mock private PersonnelMapper personnelMapper;
    @Mock private UserMapper userMapper;

    private PersonnelService service() {
        return new PersonnelService(personnelMapper, userMapper, jdbcTemplate);
    }

    private static Personnel row(Long id) {
        Personnel p = new Personnel();
        p.setId(id);
        p.setName("张三");
        return p;
    }

    @Test
    void updateHeadOverride_accepts_local_upload_path() {
        when(personnelMapper.findById(1L)).thenReturn(row(1L));
        service().updateHeadOverride(1L, "/api/upload/files/2026/09/a.png");
        verify(personnelMapper).updateHeadOverride(1L, "/api/upload/files/2026/09/a.png");
    }

    @Test
    void updateHeadOverride_accepts_https_url() {
        when(personnelMapper.findById(1L)).thenReturn(row(1L));
        service().updateHeadOverride(1L, "https://example.com/a.png");
        verify(personnelMapper).updateHeadOverride(1L, "https://example.com/a.png");
    }

    @Test
    void updateHeadOverride_null_clears_override() {
        when(personnelMapper.findById(1L)).thenReturn(row(1L));
        service().updateHeadOverride(1L, null);
        verify(personnelMapper).updateHeadOverride(1L, null);
    }

    @Test
    void updateHeadOverride_blank_clears_override() {
        when(personnelMapper.findById(1L)).thenReturn(row(1L));
        service().updateHeadOverride(1L, "   ");
        verify(personnelMapper).updateHeadOverride(1L, null);
    }

    @Test
    void updateHeadOverride_rejects_javascript_scheme() {
        when(personnelMapper.findById(1L)).thenReturn(row(1L));
        assertThrows(IllegalArgumentException.class,
                () -> service().updateHeadOverride(1L, "javascript:alert(1)"));
        verify(personnelMapper, never()).updateHeadOverride(any(), any());
    }

    @Test
    void updateHeadOverride_rejects_unknown_person() {
        when(personnelMapper.findById(9L)).thenReturn(null);
        assertThrows(IllegalArgumentException.class,
                () -> service().updateHeadOverride(9L, "/api/upload/files/a.png"));
    }

    @Test
    void updateHeadOverride_rejects_protocol_relative_url() {
        when(personnelMapper.findById(1L)).thenReturn(row(1L));
        assertThrows(IllegalArgumentException.class,
                () -> service().updateHeadOverride(1L, "//evil.com/x.png"));
        verify(personnelMapper, never()).updateHeadOverride(any(), any());
    }

    @Test
    void updateHeadOverride_rejects_overlong_url() {
        when(personnelMapper.findById(1L)).thenReturn(row(1L));
        String tooLong = "/api/upload/files/" + "a".repeat(600);
        assertThrows(IllegalArgumentException.class,
                () -> service().updateHeadOverride(1L, tooLong));
        verify(personnelMapper, never()).updateHeadOverride(any(), any());
    }
}
