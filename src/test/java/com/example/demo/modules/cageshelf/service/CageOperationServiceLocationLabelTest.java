package com.example.demo.modules.cageshelf.service;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 转移/分笼通知里「目标笼位」的位置标签拼接（{@code CageOperationService.locationLabel}）。
 * 多目标必须全部列出，用「；」拼；空/解析不出的条目跳过，不能冒出多余的分隔符。
 */
class CageOperationServiceLocationLabelTest {

    private static Map<String, Object> loc(String campus, String room, String shelve, Integer x, Integer y) {
        Map<String, Object> m = new HashMap<>();
        m.put("campusName", campus);
        m.put("roomName", room);
        m.put("shelveName", shelve);
        m.put("positionX", x);
        m.put("positionY", y);
        return m;
    }

    @Test
    void 单个目标_返回那一条() {
        assertEquals("北校区 / 101 / A / A-1",
                CageOperationService.locationLabel(List.of(loc("北校区", "101", "A", 1, 1))));
    }

    @Test
    void 笼架名以房号开头时_省略房号那一层() {
        // 笼架 201A-1 本就属于房间 201A，中间再列一层房号是纯重复（2026-09-18 定的口径）
        assertEquals("浦东 / 201A-1 / F-4",
                CageOperationService.locationLabel(List.of(loc("浦东", "201A", "201A-1", 6, 4))));
    }

    @Test
    void 三个目标_三条全部拼出() {
        assertEquals("北校区 / 101 / A / A-1；北校区 / 101 / A / A-2；北校区 / 102 / B / B-1",
                CageOperationService.locationLabel(List.of(
                        loc("北校区", "101", "A", 1, 1),
                        loc("北校区", "101", "A", 1, 2),
                        loc("北校区", "102", "B", 2, 1))));
    }

    @Test
    void 空列表_返回空串() {
        assertEquals("", CageOperationService.locationLabel(List.of()));
    }

    @Test
    void 空白条目_跳过不留多余分隔符() {
        Map<String, Object> blank = Map.of();
        assertEquals("北校区 / 101 / A / A-1；北校区 / 102 / B / B-1",
                CageOperationService.locationLabel(List.of(
                        loc("北校区", "101", "A", 1, 1),
                        blank,
                        loc("北校区", "102", "B", 2, 1))));
    }

    @Test
    void null条目_也跳过() {
        assertEquals("北校区 / 101 / A / A-1",
                CageOperationService.locationLabel(Arrays.asList(null, loc("北校区", "101", "A", 1, 1))));
    }
}
