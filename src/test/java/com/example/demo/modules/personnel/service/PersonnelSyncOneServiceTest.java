package com.example.demo.modules.personnel.service;

import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PersonnelSyncOneServiceTest {

    @Mock private JdbcTemplate jdbcTemplate;
    @Mock private PersonnelMapper personnelMapper;
    @Mock private UserMapper userMapper;

    private PersonnelService service() {
        return new PersonnelService(personnelMapper, userMapper, jdbcTemplate);
    }

    private static Personnel row() {
        Personnel p = new Personnel();
        p.setId(5L);
        p.setName("张三");
        p.setAroUserId("1960228514405916673");
        p.setHead("https://aro.example.com/old.png");
        return p;
    }

    @Test
    void syncOne_does_not_touch_head_when_local_avatar_exists() {
        Personnel p = row();
        p.setHeadOverride("/api/upload/files/mine.png");
        when(personnelMapper.findById(5L)).thenReturn(p);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("user_id", "1960228514405916673", "name", "张三",
                        "head", "https://aro.example.com/new.png")));

        service().syncOne(5L);

        assertEquals("https://aro.example.com/old.png", p.getHead(),
                "有本地头像时 head 不能被 ARO 值覆盖");
        verify(personnelMapper).update(p);
    }

    @Test
    void syncOne_updates_head_when_no_local_avatar() {
        Personnel p = row();
        when(personnelMapper.findById(5L)).thenReturn(p);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("user_id", "1960228514405916673", "name", "张三",
                        "head", "https://aro.example.com/new.png")));

        service().syncOne(5L);

        assertEquals("https://aro.example.com/new.png", p.getHead());
    }

    @Test
    void syncOne_rejects_unknown_person() {
        when(personnelMapper.findById(9L)).thenReturn(null);
        assertThrows(IllegalArgumentException.class, () -> service().syncOne(9L));
        verify(personnelMapper, never()).update(any());
    }

    @Test
    void syncOne_handles_person_without_aro_or_staff_account() {
        Personnel p = new Personnel();
        p.setId(7L);
        p.setName("孤零零");
        when(personnelMapper.findById(7L)).thenReturn(p);

        Map<String, Object> r = service().syncOne(7L);

        assertEquals(0, r.get("aroMatched"));
        assertEquals(0, r.get("staffMatched"));
        verify(personnelMapper).update(p);
    }
}
