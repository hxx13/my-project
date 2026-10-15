package com.example.demo.modules.dahua.service;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 上墙方案里取流档位的自检。
 *
 * 起因：密排（64 宫格那种）上墙后大片黑屏，而用 ICC 客户端自己上墙是好的。
 * 逐属性比对过客户端存下来的预设 XML，唯一的差别就是每个窗口的 {@code subStream}：
 * 客户端按**本屏窗口数**选档位（≤9 用 1，再多退到 2），我们原来写死 1，
 * 解码器拉不住那么多路 704×576 就黑屏了。
 *
 * 这里不碰网络，只对生成的 XML 断言，防止以后又被改回写死。
 */
class DahuaTvWallSchemeTest {

    private static Map<String, Object> win(int index, String code) {
        Map<String, Object> w = new LinkedHashMap<>();
        w.put("index", index);
        w.put("channelCode", code);
        w.put("channelName", "ch" + index);
        return w;
    }

    private static List<Map<String, Object>> windows(int n) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            list.add(win(i, "1000016$1$0$" + i));
        }
        return list;
    }

    private static String scheme(int windowCount) {
        Map<String, Object> screen = new LinkedHashMap<>();
        screen.put("screenId", "100");
        screen.put("decodeId", "1000072");
        screen.put("left", 0);
        screen.put("top", 0);
        screen.put("width", 100);
        screen.put("height", 100);
        screen.put("name", "大屏");

        Map<String, Object> req = new LinkedHashMap<>();
        req.put("screenId", "100");
        req.put("splitNum", windowCount);
        req.put("windows", windows(windowCount));

        DahuaTvWallService svc = new DahuaTvWallService(null, null, null);
        return svc.buildScheme("5", List.of(screen), List.of(req), "test", Map.of());
    }

    private static String subStreamOf(String xml) {
        int at = xml.indexOf("subStream=\"");
        return at < 0 ? "" : xml.substring(at + 11, xml.indexOf('"', at + 11));
    }

    @Test
    void smallGridUsesSubStreamOne() {
        // 9 宫格及以下：客户端实测都是 1
        assertEquals("1", subStreamOf(scheme(9)));
        assertEquals("1", subStreamOf(scheme(4)));
        assertEquals("1", subStreamOf(scheme(1)));
    }

    @Test
    void denseGridFallsBackToSubStreamTwo() {
        // 13/16/25/36 宫格：客户端实测都退到 2，不退就黑屏
        assertEquals("2", subStreamOf(scheme(13)));
        assertEquals("2", subStreamOf(scheme(16)));
        assertEquals("2", subStreamOf(scheme(36)));
        assertEquals("2", subStreamOf(scheme(64)));
    }

    @Test
    void taskCarriesTheWallConfigId() {
        // tvWallCfgId 必须是本墙的 id —— 写死 1 的话，除了「大屏」之外每面墙都在告诉平台
        // 一份对不上的墙配置（实测客户端 7 面墙逐个都是填墙号）
        assertTrue(scheme(4).contains("tvWallCfgId=\"5\""));
        assertTrue(scheme(4).contains("isCombined=\"true\""));
    }

    @Test
    void everyWindowGetsAChannelElement() {
        String xml = scheme(16);
        int n = 0;
        int at = 0;
        while ((at = xml.indexOf("<Channel ", at)) >= 0) {
            n++;
            at++;
        }
        assertEquals(16, n);
        assertTrue(xml.contains("splitNum=\"16\""));
    }
}
