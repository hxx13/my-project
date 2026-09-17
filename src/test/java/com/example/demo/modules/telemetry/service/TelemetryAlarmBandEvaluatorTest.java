package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.service.TelemetryAlarmBandEvaluator.EventType;
import com.example.demo.modules.telemetry.service.TelemetryAlarmBandEvaluator.Input;
import com.example.demo.modules.telemetry.service.TelemetryAlarmBandEvaluator.Outcome;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 状态机：一个测点从正常到越限、到持续、到恢复的全过程。
 * 重点覆盖改造前会走错的四条路径。
 */
class TelemetryAlarmBandEvaluatorTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 9, 17, 12, 0);

    private static Input in(String lastBand, LocalDateTime lastNotifiedAt, Double min, Double max,
                            double current, double hysteresis, int renotifyMin) {
        return new Input(lastBand, lastNotifiedAt, null, NOW, current, min, max,
                hysteresis, renotifyMin);
    }

    @Test
    void 无历史且超上限_产生新报警() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in(null, null, 18.0, 23.0, 24.5, 0.3, 360));
        assertEquals(EventType.ALARM, o.eventType());
        assertEquals("HIGH", o.band());
        assertEquals("偏高", o.direction());
    }

    @Test
    void 无历史且低于下限_产生新报警() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in(null, null, 18.0, 23.0, 17.0, 0.3, 360));
        assertEquals(EventType.ALARM, o.eventType());
        assertEquals("LOW", o.band());
        assertEquals("偏低", o.direction());
    }

    @Test
    void 无历史且在区间内_无事件() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in(null, null, 18.0, 23.0, 21.0, 0.3, 360));
        assertEquals(EventType.NONE, o.eventType());
    }

    /** 核心回归：持续越限但未到重提醒间隔，不能产生任何事件。改造前这里会每 30 分钟报一次。 */
    @Test
    void 持续越限且未到重提醒间隔_无事件() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in("HIGH", NOW.minusMinutes(10), 18.0, 23.0, 24.5, 0.3, 360));
        assertEquals(EventType.NONE, o.eventType());
    }

    @Test
    void 持续越限且到达重提醒间隔_产生重提醒() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in("HIGH", NOW.minusMinutes(400), 18.0, 23.0, 24.5, 0.3, 360));
        assertEquals(EventType.RENOTIFY, o.eventType());
        assertEquals("HIGH", o.band());
    }

    @Test
    void 重提醒间隔为0_永不重提醒() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in("HIGH", NOW.minusMinutes(99999), 18.0, 23.0, 24.5, 0.3, 0));
        assertEquals(EventType.NONE, o.eventType());
    }

    @Test
    void 上限报警后回落进区间_产生恢复() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in("HIGH", NOW.minusMinutes(30), 18.0, 23.0, 22.0, 0.3, 360));
        assertEquals(EventType.RECOVERY, o.eventType());
        assertEquals("OK", o.band());
    }

    /** 滞回带内不算恢复：曾 HIGH，只降了一点点，仍要保持报警状态。 */
    @Test
    void 曾HIGH但仍在上限减滞回值之上_保持报警不恢复() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in("HIGH", NOW.minusMinutes(30), 18.0, 23.0, 22.9, 0.3, 360));
        assertEquals(EventType.NONE, o.eventType());
    }

    @Test
    void 曾LOW但仍在下限加滞回值之下_保持报警不恢复() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in("LOW", NOW.minusMinutes(30), 18.0, 23.0, 18.1, 0.3, 360));
        assertEquals(EventType.NONE, o.eventType());
    }

    /** 边界精确等号：current 正好等于 max - hysteresis 时要保持报警，不能判成恢复。
     *  这条把 `>=` 钉死 —— 写成 `>` 就会挂。 */
    @Test
    void 曾HIGH且正好等于上限减滞回值_保持报警() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in("HIGH", NOW.minusMinutes(30), 18.0, 23.0, 22.7, 0.3, 360));
        assertEquals(EventType.NONE, o.eventType());
    }

    /** 边界精确等号：current 正好等于 min + hysteresis 时要保持报警，把 `<=` 钉死。 */
    @Test
    void 曾LOW且正好等于下限加滞回值_保持报警() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in("LOW", NOW.minusMinutes(30), 18.0, 23.0, 18.3, 0.3, 360));
        assertEquals(EventType.NONE, o.eventType());
    }

    /** 刚跌破边界就要判恢复，与上面两条一起把等号从两侧钉死。 */
    @Test
    void 曾HIGH且刚跌破上限减滞回值_产生恢复() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in("HIGH", NOW.minusMinutes(30), 18.0, 23.0, 22.69, 0.3, 360));
        assertEquals(EventType.RECOVERY, o.eventType());
    }

    @Test
    void 恢复后再次越限_产生新报警而不是恢复() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in("OK", NOW.minusMinutes(5), 18.0, 23.0, 24.0, 0.3, 360));
        assertEquals(EventType.ALARM, o.eventType());
    }

    /** 直接从上限翻到下限：直接报下限报警，不先写一条假的"恢复正常"台账。 */
    @Test
    void 曾HIGH且一路跌穿下限_直接报下限报警() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in("HIGH", NOW.minusMinutes(30), 18.0, 23.0, 17.0, 0.3, 360));
        assertEquals(EventType.ALARM, o.eventType());
        assertEquals("LOW", o.band());
    }

    @Test
    void 上限为空只判下限() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in(null, null, 40.0, null, 39.0, 2.0, 360));
        assertEquals(EventType.ALARM, o.eventType());
        assertEquals("LOW", o.band());
    }

    @Test
    void 重提醒带持续时长_能算出来() {
        Input i = new Input("HIGH", NOW.minusMinutes(400), NOW.minusHours(9), NOW,
                24.5, 18.0, 23.0, 0.3, 360);
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(i);
        assertEquals(EventType.RENOTIFY, o.eventType());
        assertEquals(540L, o.sustainedMinutes());
    }

    @Test
    void 曾LOW且到达重提醒间隔_产生重提醒() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in("LOW", NOW.minusMinutes(400), 18.0, 23.0, 17.0, 0.3, 360));
        assertEquals(EventType.RENOTIFY, o.eventType());
        assertEquals("LOW", o.band());
    }

    @Test
    void 曾LOW后回升进区间_产生恢复() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in("LOW", NOW.minusMinutes(30), 18.0, 23.0, 19.0, 0.3, 360));
        assertEquals(EventType.RECOVERY, o.eventType());
    }

    /** 下限为空时只判上限；曾LOW 但下限为空，按不满足保持条件走恢复。 */
    @Test
    void 下限为空只判上限() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in(null, null, null, 23.0, 24.0, 0.3, 360));
        assertEquals(EventType.ALARM, o.eventType());
        assertEquals("HIGH", o.band());
    }

    /** 曾LOW且下限为空：无下限可判，回升到上限之上直接翻成上限报警。 */
    @Test
    void 曾LOW且下限为空回升到上限之上_直接报上限报警() {
        Outcome o = TelemetryAlarmBandEvaluator.evaluate(
                in("LOW", NOW.minusMinutes(30), null, 23.0, 24.0, 0.3, 360));
        assertEquals(EventType.ALARM, o.eventType());
        assertEquals("HIGH", o.band());
    }
}
