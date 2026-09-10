package com.example.demo.modules.me.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.me.dto.MiniPreferencesVo;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * 回归：mini_preferences 是一份被多个客户端/模块共用的 JSON，
 * 各自只提交自己负责的字段。任何一次部分提交都不得清空别人的字段。
 *
 * <p>请求体一律走 JSON 反序列化（与真实 wire 一致）——若有人给 VO 字段加回
 * {@code new ArrayList<>()} 之类的初值，「没提交」就变成「空列表」，
 * 合并会失效、别人的数据被清空，这里会立刻红。</p>
 */
@ExtendWith(MockitoExtension.class)
class MiniPreferencesServiceTest {

    private static final String UID = "u1";

    @Mock private UserMapper userMapper;

    private final ObjectMapper om = new ObjectMapper();
    private MiniPreferencesService service;
    private String stored;

    @BeforeEach
    void setUp() {
        service = new MiniPreferencesService(userMapper, om);
        when(userMapper.findById(UID)).thenAnswer(inv -> {
            User u = new User();
            u.setId(UID);
            u.setMiniPreferencesJson(stored);
            return u;
        });
        when(userMapper.updateMiniPreferencesJsonById(eq(UID), any())).thenAnswer(inv -> {
            stored = inv.getArgument(1);
            return 1;
        });
    }

    private MiniPreferencesVo saveJson(String bodyJson) throws Exception {
        return service.save(UID, om.readValue(bodyJson, MiniPreferencesVo.class));
    }

    @Test
    void 小程序只提交房间关注时不冲掉后台侧栏与主题() throws Exception {
        stored = "{\"adminNavRecent\":[\"/admin/cage-shelves\"],\"adminNavStars\":[\"/admin/aup\"],"
                + "\"adminNavLock\":\"/admin/aup\",\"studentNavRecent\":[\"/student/rooms\"],"
                + "\"appearanceSchedule\":{\"autoScheduleEnabled\":false,\"manualThemeId\":\"standard-dark\"}}";

        MiniPreferencesVo out = saveJson("{\"roomWatch\":{\"selections\":[{\"campus\":\"浦东\",\"floor\":\"\"}]}}");

        assertEquals(List.of("/admin/cage-shelves"), out.getAdminNavRecent());
        assertEquals(List.of("/admin/aup"), out.getAdminNavStars());
        assertEquals("/admin/aup", out.getAdminNavLock());
        assertEquals(List.of("/student/rooms"), out.getStudentNavRecent());
        assertEquals("standard-dark", out.getAppearanceSchedule().getManualThemeId());
        assertEquals("浦东", out.getRoomWatch().getSelections().get(0).getCampus());
    }

    @Test
    void 只提交主题时不冲掉侧栏字段() throws Exception {
        stored = "{\"adminNavRecent\":[\"/admin/cage-shelves\"],\"adminNavStars\":[\"/admin/aup\"]}";

        MiniPreferencesVo out = saveJson("{\"appearanceSchedule\":{\"autoScheduleEnabled\":false,\"manualThemeId\":\"standard-dark\"}}");

        assertEquals(List.of("/admin/cage-shelves"), out.getAdminNavRecent());
        assertEquals(List.of("/admin/aup"), out.getAdminNavStars());
        assertEquals("standard-dark", out.getAppearanceSchedule().getManualThemeId());
    }

    @Test
    void 只提交学生端侧栏时不冲掉主题() throws Exception {
        stored = "{\"appearanceSchedule\":{\"autoScheduleEnabled\":false,\"manualThemeId\":\"standard-dark\"}}";

        MiniPreferencesVo out = saveJson("{\"studentNavRecent\":[\"/student/rooms\"],\"studentNavStars\":[\"/student/aup\"],\"studentNavLock\":\"/student/rooms\"}");

        assertEquals("standard-dark", out.getAppearanceSchedule().getManualThemeId());
        assertEquals(List.of("/student/rooms"), out.getStudentNavRecent());
        assertEquals("/student/rooms", out.getStudentNavLock());
    }

    @Test
    void 显式提交空列表才是清空() throws Exception {
        stored = "{\"adminNavRecent\":[\"/admin/cage-shelves\"],\"adminNavStars\":[\"/admin/aup\"],\"adminNavLock\":\"/admin/aup\"}";

        MiniPreferencesVo out = saveJson("{\"adminNavRecent\":[],\"adminNavStars\":[],\"adminNavLock\":\"\"}");

        assertEquals(List.of(), out.getAdminNavRecent());
        assertEquals(List.of(), out.getAdminNavStars());
        assertNull(out.getAdminNavLock());
    }

    @Test
    void 学生端侧栏只接受_student_前缀路径() throws Exception {
        MiniPreferencesVo out = saveJson(
                "{\"studentNavRecent\":[\"/student/rooms\",\"/admin/personnel\",\"javascript:alert(1)\"],"
                        + "\"studentNavLock\":\"/admin/aup\"}");

        assertEquals(List.of("/student/rooms"), out.getStudentNavRecent());
        assertNull(out.getStudentNavLock());
    }
}
