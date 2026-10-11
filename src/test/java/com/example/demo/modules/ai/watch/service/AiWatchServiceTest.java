package com.example.demo.modules.ai.watch.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 条件判定的闸。
 *
 * <p>它是「条件成立就自动执行一个动作」的唯一裁判，判错的两个方向都很贵：
 * 判成成立 → **没人看着的时候动了一次不该动的**（比如把门开了）；判成不成立 → 该动的没动。
 * 所以每个比较符都钉一条，尤其是「比开始时多了」——它带着基线，最容易写反。
 */
class AiWatchServiceTest {

    private static final String RECORDS = "{\"ok\":true,\"total\":4}";

    @Test
    @DisplayName("比开始时多了：多一条就算成立，一样多不算")
    void increasedComparesAgainstBaseline() {
        assertTrue(AiWatchService.evaluate(RECORDS, "total", "INCREASED", null, "3"));
        assertFalse(AiWatchService.evaluate(RECORDS, "total", "INCREASED", null, "4"), "一样多不算多了");
        assertFalse(AiWatchService.evaluate(RECORDS, "total", "INCREASED", null, "5"), "比开始时少更不算");
    }

    @Test
    @DisplayName("开始时没有记录、现在有了 —— 基线 0 也算得出来")
    void increasedFromZero() {
        assertTrue(AiWatchService.evaluate(RECORDS, "total", "INCREASED", null, "0"));
    }

    @Test
    @DisplayName("有内容 / 为空：0 和空数组都算「为空」")
    void emptyAndNotEmpty() {
        assertTrue(AiWatchService.evaluate(RECORDS, "total", "NOT_EMPTY", null, null));
        assertFalse(AiWatchService.evaluate("{\"total\":0}", "total", "NOT_EMPTY", null, null), "0 算空");
        assertTrue(AiWatchService.evaluate("{\"total\":0}", "total", "EMPTY", null, null));
        assertTrue(AiWatchService.evaluate("{\"records\":[]}", "records", "EMPTY", null, null));
        assertTrue(AiWatchService.evaluate("{\"records\":[{\"a\":1}]}", "records", "NOT_EMPTY", null, null),
                "非空数组要有内容");
    }

    @Test
    @DisplayName("大于 / 小于 / 等于 / 不等于 按数字比")
    void compareOps() {
        assertTrue(AiWatchService.evaluate(RECORDS, "total", "GT", "3", null));
        assertFalse(AiWatchService.evaluate(RECORDS, "total", "GT", "4", null));
        assertTrue(AiWatchService.evaluate(RECORDS, "total", "EQ", "4", null));
        assertTrue(AiWatchService.evaluate(RECORDS, "total", "NE", "5", null));
        assertTrue(AiWatchService.evaluate(RECORDS, "total", "LT", "5", null));
    }

    @Test
    @DisplayName("字段支持 a.b 路径，取不到就是空")
    void nestedFieldAndMissing() {
        assertTrue(AiWatchService.evaluate("{\"data\":{\"count\":7}}", "data.count", "GT", "5", null));
        assertFalse(AiWatchService.evaluate("{\"data\":{}}", "data.count", "INCREASED", null, "0"), "取不到不该当成涨了");
        assertTrue(AiWatchService.evaluate("{\"data\":{}}", "data.count", "EMPTY", null, null));
    }

    @Test
    @DisplayName("结果不是 JSON 时判不成立（宁可不动，也别乱动）")
    void badJsonIsFalse() {
        assertFalse(AiWatchService.evaluate("这不是 JSON", "total", "NOT_EMPTY", null, null));
        assertFalse(AiWatchService.evaluate("", "total", "NOT_EMPTY", null, null));
    }

    @Test
    @DisplayName("和开始时不一样")
    void changedComparesToString() {
        assertTrue(AiWatchService.evaluate("{\"state\":\"OPEN\"}", "state", "CHANGED", null, "CLOSED"));
        assertFalse(AiWatchService.evaluate("{\"state\":\"OPEN\"}", "state", "CHANGED", null, "OPEN"));
    }

    @Test
    @DisplayName("字段路径里的数字段在数组上按**下标**取 —— path(\"0\") 在数组上取不到，这是个静默坑")
    void arrayIndexInFieldPath() {
        String r = "{\"records\":[{\"state\":\"OPEN\"},{\"state\":\"CLOSED\"}]}";
        assertTrue(AiWatchService.evaluate(r, "records.0.state", "EQ", "OPEN", null));
        assertTrue(AiWatchService.evaluate(r, "records.1.state", "EQ", "CLOSED", null));
    }

    @Test
    @DisplayName("动作参数里的 {check.字段} 换成实际值 —— 这一条让动作「跟着事件走」而不是写死")
    void resolvesPlaceholders() {
        String check = "{\"total\":4,\"records\":[{\"channelName\":\"大厅-137-MK02-MJ02\",\"personCode\":\"1001\"}]}";

        // 数组元素里的占位符：开「刚查到的那扇门」
        assertEquals("{\"channels\":[\"大厅-137-MK02-MJ02\"]}",
                AiWatchService.resolveActArgs("{\"channels\":[\"{check.records.0.channelName}\"]}", check));

        // 混在文字里
        assertEquals("{\"note\":\"来自 大厅-137-MK02-MJ02 的记录\"}",
                AiWatchService.resolveActArgs("{\"note\":\"来自 {check.records.0.channelName} 的记录\"}", check));

        // 整串就是一个占位符、取到的是数字 → **保留数字类型**，别变成字符串传下去
        assertEquals("{\"count\":4}",
                AiWatchService.resolveActArgs("{\"count\":\"{check.total}\"}", check));

        // 取不到的路径**原样留着**：让下游工具自己报「参数不对」，比悄悄换成空串好
        //（空串可能被当成合法值，把动作打到一个不该打的对象上）
        assertEquals("{\"x\":\"{check.nope.y}\"}",
                AiWatchService.resolveActArgs("{\"x\":\"{check.nope.y}\"}", check));

        // 没占位符就原样返回
        assertEquals("{\"mode\":\"OPEN\"}", AiWatchService.resolveActArgs("{\"mode\":\"OPEN\"}", check));
    }

    @Test
    @DisplayName("基线是**字段值**而不是整份结果的 JSON —— 这条钉的就是「比开始时多了」永远不成立的根因")
    void baselineMustBeFieldValue() throws Exception {
        String before = "{\"ok\":true,\"total\":3,\"records\":[]}";
        String after = "{\"ok\":true,\"total\":4,\"records\":[{\"channel\":\"大厅-137-MK02-MJ02\"}]}";

        assertEquals("3", AiWatchService.fieldText(before, "total"));
        assertEquals("0", AiWatchService.fieldText(before, "records"), "容器取元素个数，不是空串");

        assertTrue(AiWatchService.evaluate(after, "total", "INCREASED", null,
                AiWatchService.fieldText(before, "total")), "基线存字段值时才判得出来");
        assertFalse(AiWatchService.evaluate(after, "total", "INCREASED", null, before),
                "老写法把整份 JSON 当基线存 → 解析不出数字 → 永不成立（这就是修之前的现场）");
    }

    @Test
    @DisplayName("取不到的字段返回 null —— 建计划时据此当场退回，而不是静默存个空串")
    void fieldTextNullWhenMissing() throws Exception {
        assertNull(AiWatchService.fieldText("{\"ok\":true,\"total\":0}", "nope"));
        assertNull(AiWatchService.fieldText("{\"records\":[]}", "records.0.channel"), "越界也取不到");
        assertEquals("0", AiWatchService.fieldText("{\"records\":[]}", "records"));
    }

    @Test
    @DisplayName("和开始时不一样：基线也必须是字段值，否则一建出来就误判成「变了」")
    void changedNeedsFieldValueBaseline() throws Exception {
        String before = "{\"state\":\"CLOSED\"}";
        String base = AiWatchService.fieldText(before, "state");
        assertFalse(AiWatchService.evaluate("{\"state\":\"CLOSED\"}", "state", "CHANGED", null, base));
        assertTrue(AiWatchService.evaluate("{\"state\":\"OPEN\"}", "state", "CHANGED", null, base));
        assertTrue(AiWatchService.evaluate("{\"state\":\"CLOSED\"}", "state", "CHANGED", null, before),
                "把整份 JSON 当基线 → 与字段值永不相等 → 一建出来就误触发（这就是修之前的现场）");
    }
}
