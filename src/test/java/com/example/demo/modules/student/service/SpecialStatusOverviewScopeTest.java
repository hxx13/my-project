package com.example.demo.modules.student.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageShelfIndex;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import com.example.demo.modules.cageshelf.service.CageRegionGrantService;
import com.example.demo.modules.cageshelf.service.CageShelfService;
import com.example.demo.modules.cageshelf.service.CageVisibilityPolicy;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 回归：特殊状态总览要与笼架网格同口径。
 *
 * <p>网格对非全局可见者是「课题组 ∪ 负责范围（校区/楼层/房间）」放行；总览原先只按课题组过滤，
 * 于是配了负责范围、却不在任何课题组的人出现「网格里有笼位、统计页全空」。
 */
class SpecialStatusOverviewScopeTest {

    private final CageShelfService cageShelfService = mock(CageShelfService.class);
    private final AroPersonnelMapper aroPersonnelMapper = mock(AroPersonnelMapper.class);
    private final CageShelfMapper cageShelfMapper = mock(CageShelfMapper.class);
    private final CageRegionGrantService regionGrantService = mock(CageRegionGrantService.class);
    private final CageVisibilityPolicy visibilityPolicy = new CageVisibilityPolicy();

    private final StudentCageShelfService service = new StudentCageShelfService(
            cageShelfService, null, aroPersonnelMapper, null, cageShelfMapper, null, null, null, null,
            regionGrantService, null, null, visibilityPolicy);

    private static Map<String, Object> cage(String shelveId, String piName) {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("shelveId", shelveId);
        c.put("projectPiName", piName);
        c.put("piName", piName);
        c.put("departmentName", "某部门");
        return c;
    }

    private static Map<String, Object> overview() {
        List<Map<String, Object>> cages = new ArrayList<>();
        cages.add(cage("S1", "别的组"));
        cages.add(cage("S2", "别的组"));
        Map<String, Object> group = new LinkedHashMap<>();
        group.put("statusCode", "C1");
        group.put("statusLabel", "合笼");
        group.put("count", 2);
        group.put("cages", cages);
        return Map.of("groups", List.of(group), "totalAbnormal", 2, "scannedAt", "2026-10-15 10:00:00");
    }

    private User user() {
        User u = new User();
        u.setId("U1");
        u.setRole(RoleEnum.ADMIN);
        return u;
    }

    private static CageShelfIndex index(long shelveId, Long roomId) {
        CageShelfIndex idx = new CageShelfIndex();
        idx.setShelveId(shelveId);
        idx.setRoomId(roomId);
        return idx;
    }

    @Test
    @SuppressWarnings("unchecked")
    void keepsCagesInsideRegionGrantEvenWithoutProjectGroup() {
        when(cageShelfService.getSpecialStatusOverview(null)).thenReturn(overview());
        // ADMIN 不是全局可见者；无课题组（映射为 null）；只配了 R9 这个房间
        when(aroPersonnelMapper.findByUserId("U1")).thenReturn(null);
        when(regionGrantService.visibilityScopes("U1")).thenReturn(Map.of("ROOM", List.of("9")));
        when(cageShelfMapper.findByShelveId("S1")).thenReturn(index(1L, 9L));
        when(cageShelfMapper.findByShelveId("S2")).thenReturn(index(2L, 1L));

        Map<String, Object> out = service.getSpecialStatusOverview(user(), false);

        List<Map<String, Object>> groups = (List<Map<String, Object>>) out.get("groups");
        List<Map<String, Object>> cages = (List<Map<String, Object>>) groups.get(0).get("cages");
        assertEquals(1, cages.size(), "只有落在负责范围内的笼位应当保留");
        assertEquals("S1", cages.get(0).get("shelveId"));
        assertEquals(1, groups.get(0).get("count"));
        assertEquals(1, out.get("totalAbnormal"));
    }
}
