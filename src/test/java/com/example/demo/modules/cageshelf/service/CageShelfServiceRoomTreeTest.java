package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

/**
 * 房间树组装：SQL 已按 campus→area→floor→room 全字段排序，服务端单趟建树。
 * 这里只测组装逻辑，mapper 用 mock。
 */
@ExtendWith(MockitoExtension.class)
class CageShelfServiceRoomTreeTest {

    @Mock
    private CageShelfMapper cageShelfMapper;

    private static Map<String, Object> row(String campusId, String campusName, String areaId, String areaName,
                                           String floorId, String floorName, String roomId, String roomName) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("campusId", campusId);
        m.put("campusName", campusName);
        m.put("areaId", areaId);
        m.put("areaName", areaName);
        m.put("floorId", floorId);
        m.put("floorName", floorName);
        m.put("roomId", roomId);
        m.put("roomName", roomName);
        return m;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> children(Map<String, Object> node) {
        return (List<Map<String, Object>>) node.get("children");
    }

    @Test
    void roomTree_groupsIntoCampusAreaFloorRoom() {
        when(cageShelfMapper.listRoomTreeRows()).thenReturn(List.of(
                row("1", "浦西", "1", "6号楼", "f1", "6A", "r1", "601"),
                row("1", "浦西", "1", "6号楼", "f1", "6A", "r2", "602"),
                row("1", "浦西", "1", "6号楼", "f2", "5A", "r3", "501"),
                row("2", "浦东", "2", "浦东", "f3", "1F", "r4", "101")));

        List<Map<String, Object>> tree = new CageShelfService(cageShelfMapper, null, null, null, null, null, null).roomTree();

        assertEquals(2, tree.size(), "两个校区");
        Map<String, Object> puxi = tree.get(0);
        assertEquals("浦西", puxi.get("name"));
        assertEquals("CAMPUS", puxi.get("level"));

        assertEquals(1, children(puxi).size(), "浦西只有一个区域");
        Map<String, Object> area = children(puxi).get(0);
        assertEquals("6号楼", area.get("name"));

        assertEquals(2, children(area).size(), "6号楼两个楼层");
        Map<String, Object> floor6A = children(area).get(0);
        assertEquals("6A", floor6A.get("name"));
        assertEquals(2, children(floor6A).size(), "6A 两间房");
        assertEquals("601", children(floor6A).get(0).get("name"));
        assertEquals("ROOM", children(floor6A).get(0).get("level"));
        assertEquals("room:r1", children(floor6A).get(0).get("id"));
        assertEquals(0, children(children(floor6A).get(0)).size(), "房间是叶子");

        assertEquals("5A", children(area).get(1).get("name"));
        assertEquals("浦东", tree.get(1).get("name"));
    }

    @Test
    void roomTree_sameAreaIdDifferentName_doesNotMerge() {
        // area_id=1 同时映射「6号楼」「浦西」——键必须带名称，否则两棵子树会被并成一棵
        when(cageShelfMapper.listRoomTreeRows()).thenReturn(List.of(
                row("1", "浦西", "1", "6号楼", "f1", "6A", "r1", "601"),
                row("1", "浦西", "1", "浦西", "f9", "B1", "r9", "B101")));

        List<Map<String, Object>> tree = new CageShelfService(cageShelfMapper, null, null, null, null, null, null).roomTree();

        assertEquals(1, tree.size());
        assertEquals(2, children(tree.get(0)).size(), "同名 area_id 不应合并");
        assertEquals("6号楼", children(tree.get(0)).get(0).get("name"));
        assertEquals("浦西", children(tree.get(0)).get(1).get("name"));
    }

    @Test
    void roomTree_skipsRowsWithoutRoomOrCampus() {
        when(cageShelfMapper.listRoomTreeRows()).thenReturn(new ArrayList<>(List.of(
                row("1", "浦西", "1", "6号楼", "f1", "6A", "", ""),
                row("", "", "1", "6号楼", "f1", "6A", "r1", "601"))));

        List<Map<String, Object>> tree = new CageShelfService(cageShelfMapper, null, null, null, null, null, null).roomTree();

        assertEquals(0, tree.size(), "缺房间名或校区 id 的行整体跳过");
    }
}
