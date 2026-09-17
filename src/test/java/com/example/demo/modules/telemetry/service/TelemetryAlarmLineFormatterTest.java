package com.example.demo.modules.telemetry.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class TelemetryAlarmLineFormatterTest {

    @Test
    void 温度补摄氏度() {
        assertEquals("22.4℃", TelemetryAlarmLineFormatter.appendUnit("22.4", "TEMP"));
    }

    @Test
    void 湿度补百分号() {
        assertEquals("52.38%", TelemetryAlarmLineFormatter.appendUnit("52.38", "HUM"));
    }

    @Test
    void 压强补帕() {
        assertEquals("60.9Pa", TelemetryAlarmLineFormatter.appendUnit("60.9", "PRESSURE"));
    }

    @Test
    void 风量补立方米每小时() {
        assertEquals("3068.427m³/h", TelemetryAlarmLineFormatter.appendUnit("3068.427", "WIND"));
    }

    @Test
    void 已带单位时不重复补() {
        assertEquals("22.4℃", TelemetryAlarmLineFormatter.appendUnit("22.4℃", "TEMP"));
    }

    /** 位置格保留完整房间名（含「兔饲养室」这类描述），不缩成代号。 */
    @Test
    void 报警行保留完整房间名_状态红色() {
        assertEquals("| 101A-兔饲养室 | 温度 | <span style=\"color:#dc2626\">高</span> | 22.45℃ | 15 |",
                TelemetryAlarmLineFormatter.alarmRow("101A-兔饲养室", "温度", "HIGH", "22.45℃", "15"));
    }

    /** 低限也是越限，同样用红色——绿只留给"已恢复"。 */
    @Test
    void 低限报警行_同样用红色() {
        assertEquals("| 102A-兔饲养室 | 湿度 | <span style=\"color:#dc2626\">低</span> | 38.1% | 40 |",
                TelemetryAlarmLineFormatter.alarmRow("102A-兔饲养室", "湿度", "LOW", "38.1%", "40"));
    }

    @Test
    void 重提醒行_红色加粗_带时长() {
        assertEquals("| 216A-饲养室 | 温度 | <span style=\"color:#dc2626\"><b>持续高 6小时</b></span> | 24.2℃ | 23 |",
                TelemetryAlarmLineFormatter.renotifyRow("216A-饲养室", "温度", "HIGH", 400L, "24.2℃", "23"));
    }

    @Test
    void 重提醒行_不足一小时按分钟() {
        assertEquals("| 216A-饲养室 | 湿度 | <span style=\"color:#dc2626\"><b>持续低 40分</b></span> | 38.1% | 40 |",
                TelemetryAlarmLineFormatter.renotifyRow("216A-饲养室", "湿度", "LOW", 40L, "38.1%", "40"));
    }

    @Test
    void 重提醒行_时长未知时省掉那一段() {
        assertEquals("| 216A-饲养室 | 温度 | <span style=\"color:#dc2626\"><b>持续高</b></span> | 24.2℃ | 23 |",
                TelemetryAlarmLineFormatter.renotifyRow("216A-饲养室", "温度", "HIGH", 0L, "24.2℃", "23"));
    }

    @Test
    void 恢复行_绿色_阈值格留空() {
        assertEquals("| 101A-兔饲养室 | 温度 | <span style=\"color:#16a34a\">已恢复</span> | 22.5℃ |  |",
                TelemetryAlarmLineFormatter.recoveryRow("101A-兔饲养室", "温度", "22.5℃"));
    }

    @Test
    void 变化行_红色_旧值到新值() {
        assertEquals("| 4F-MAU03 | 开关 | <span style=\"color:#dc2626\">变化</span> | 开 → 关 | — |",
                TelemetryAlarmLineFormatter.changeRow("4F-MAU03", "开关", "开", "关"));
    }

    /** 房间名为 null 不能让整行拼出 "null"。 */
    @Test
    void 房间名为空时位置格为空() {
        assertEquals("|  | 温度 | <span style=\"color:#dc2626\">高</span> | 22.45℃ | 15 |",
                TelemetryAlarmLineFormatter.alarmRow(null, "温度", "HIGH", "22.45℃", "15"));
    }

    @Test
    void 表头是两行() {
        assertEquals("| 位置 | 类型 | 状态 | 读数 | 阈值 |\n|:--|:--|:--|--:|--:|",
                TelemetryAlarmLineFormatter.tableHeader());
    }

    // ── 布尔归一化 ──

    @Test
    void 开关归一化_大小写不敏感() {
        assertEquals("开", TelemetryAlarmLineFormatter.normalizeBoolean("SWITCH", "true"));
        assertEquals("开", TelemetryAlarmLineFormatter.normalizeBoolean("SWITCH", "TRUE"));
        assertEquals("关", TelemetryAlarmLineFormatter.normalizeBoolean("SWITCH", "false"));
        assertEquals("关", TelemetryAlarmLineFormatter.normalizeBoolean("SWITCH", "False"));
    }

    @Test
    void 状态归一化() {
        assertEquals("是", TelemetryAlarmLineFormatter.normalizeBoolean("STATUS", "true"));
        assertEquals("否", TelemetryAlarmLineFormatter.normalizeBoolean("STATUS", "false"));
    }

    @Test
    void 非布尔或未知类型_归一化为空() {
        assertNull(TelemetryAlarmLineFormatter.normalizeBoolean("SWITCH", "on"));
        assertNull(TelemetryAlarmLineFormatter.normalizeBoolean("SWITCH", "1"));
        assertNull(TelemetryAlarmLineFormatter.normalizeBoolean("TEMP", "true"));
        assertNull(TelemetryAlarmLineFormatter.normalizeBoolean("SWITCH", null));
    }

    // ── 布尔变化判定 ──

    @Test
    void 布尔变化判定_首次观测写基准() {
        TelemetryAlarmLineFormatter.BooleanChange c =
                TelemetryAlarmLineFormatter.booleanChange("SWITCH", "false", null);
        assertEquals(TelemetryAlarmLineFormatter.BooleanChangeKind.BASELINE, c.kind());
        assertEquals("关", c.normalized());
    }

    @Test
    void 布尔变化判定_值变了() {
        TelemetryAlarmLineFormatter.BooleanChange c =
                TelemetryAlarmLineFormatter.booleanChange("SWITCH", "true", "关");
        assertEquals(TelemetryAlarmLineFormatter.BooleanChangeKind.CHANGE, c.kind());
        assertEquals("开", c.normalized());
    }

    @Test
    void 布尔变化判定_值没变() {
        TelemetryAlarmLineFormatter.BooleanChange c =
                TelemetryAlarmLineFormatter.booleanChange("SWITCH", "true", "开");
        assertEquals(TelemetryAlarmLineFormatter.BooleanChangeKind.NO_CHANGE, c.kind());
    }

    @Test
    void 布尔变化判定_取不到值跳过() {
        TelemetryAlarmLineFormatter.BooleanChange c =
                TelemetryAlarmLineFormatter.booleanChange("SWITCH", "on", "开");
        assertEquals(TelemetryAlarmLineFormatter.BooleanChangeKind.SKIP, c.kind());
        assertNull(c.normalized());
    }
}
