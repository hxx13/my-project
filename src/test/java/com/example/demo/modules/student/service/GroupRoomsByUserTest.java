package com.example.demo.modules.student.service;

import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.cageshelf.entity.CageShelfIndex;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import com.example.demo.modules.cageshelf.service.CageShelfLocalAggCache;
import com.example.demo.modules.cageshelf.service.CageVisibilityPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * 刷卡弹窗中栏平面图的房间来源：按【被扫人课题组】取笼架房间，
 * 不是按门禁授权房间（allowedRooms）——那套 ID/命名与笼架房间对不上，会渲染成空房间。
 */
@ExtendWith(MockitoExtension.class)
class GroupRoomsByUserTest {

    private static final String USER_ID = "1971062188583956482"; // 李劲松的课题组

    @Mock private AroPersonnelMapper aroPersonnelMapper;
    @Mock private CageShelfMapper cageShelfMapper;
    @Mock private CageShelfLocalAggCache localAggCache;

    private StudentCageShelfService service;

    @BeforeEach
    void setUp() {
        // 末位 cageOperationService 只被 markMine（学生每格归属标记）用，本测试不触及房间分组，传 null 即可
        service = new StudentCageShelfService(null, null, aroPersonnelMapper, null, cageShelfMapper,
                null, null, null, null, null, localAggCache, null, new CageVisibilityPolicy());
    }

    private Map<String, Object> attribution(String shelveId, String projectPi, String pi, String dept) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("shelveId", shelveId);
        m.put("projectPiName", projectPi);
        m.put("piName", pi);
        m.put("departmentName", dept);
        return m;
    }

    private CageShelfIndex shelf(long shelveId, long roomId, String roomName) {
        CageShelfIndex s = new CageShelfIndex();
        s.setShelveId(shelveId);
        s.setRoomId(roomId);
        s.setRoomName(roomName);
        return s;
    }

    /** 模拟真实 mapper：只回请求的那几个笼架（否则「不属于本组的笼架被排除」这条断言形同虚设）。 */
    private void stubShelfIndexes(Map<String, CageShelfIndex> all) {
        when(cageShelfMapper.listIndexesByShelveIds(any())).thenAnswer(inv -> {
            List<?> ids = inv.getArgument(0);
            List<CageShelfIndex> out = new ArrayList<>();
            for (Object id : ids) {
                CageShelfIndex s = all.get(String.valueOf(id));
                if (s != null) out.add(s);
            }
            return out;
        });
    }

    @Test
    void roomsForUserGroup_returnsDistinctRoomsOfOwnGroupShelves() {
        AroPersonnel p = new AroPersonnel();
        p.setProjectGroupName("李劲松的课题组");
        when(aroPersonnelMapper.findByUserId(USER_ID)).thenReturn(p);

        // 11/12 属本组（pi 两种字段来源），13 属别人，14 靠部门字段命中；11、12 同房间
        when(localAggCache.attribution()).thenReturn(new ArrayList<>(List.of(
                attribution("11", "李劲松", null, "基础医学院-组织胚胎学与遗传发育学系"),
                attribution("12", null, "李劲松", null),
                attribution("13", "张三", null, null),
                attribution("14", null, null, "李劲松")
        )));
        stubShelfIndexes(Map.of(
                "11", shelf(11L, 201L, "201B"),
                "12", shelf(12L, 201L, "201B"),
                "13", shelf(13L, 203L, "201D"),
                "14", shelf(14L, 204L, "201E")
        ));

        List<Map<String, Object>> rooms = service.roomsForUserGroup(USER_ID);

        assertEquals(List.of("201", "204"),
                rooms.stream().map(r -> String.valueOf(r.get("roomId"))).toList());
    }

    @Test
    void roomsForUserGroup_noGroup_yieldsNothing() {
        when(aroPersonnelMapper.findByUserId(USER_ID)).thenReturn(null);
        assertEquals(List.of(), service.roomsForUserGroup(USER_ID));
    }

    /**
     * 行政组（如「DLAS-实验动物管理」）在笼位上没有同名 PI，笼位 PI 是「DLAS-实验动物科学部管理组」；
     * 组名永远对不上。这类账号要按**部门**补一维，否则有课题组却什么都看不见、只剩身份区域。
     */
    @Test
    void roomsForUserGroup_administrativeGroup_fallsBackToDepartment() {
        AroPersonnel p = new AroPersonnel();
        p.setProjectGroupName("DLAS-实验动物管理");
        p.setDepartmentName("基础医学院-实验动物科学部");
        when(aroPersonnelMapper.findByUserId(USER_ID)).thenReturn(p);

        when(localAggCache.attribution()).thenReturn(new ArrayList<>(List.of(
                attribution("21", "DLAS-实验动物科学部管理组", null, "基础医学院-实验动物科学部"),
                attribution("22", "张三", null, "药理学与化学生物学系")
        )));
        stubShelfIndexes(Map.of(
                "21", shelf(21L, 301L, "301A"),
                "22", shelf(22L, 302L, "302A")
        ));

        List<Map<String, Object>> rooms = service.roomsForUserGroup(USER_ID);

        assertEquals(List.of("301"),
                rooms.stream().map(r -> String.valueOf(r.get("roomId"))).toList());
    }
}
