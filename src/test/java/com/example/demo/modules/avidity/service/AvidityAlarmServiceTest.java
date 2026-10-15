package com.example.demo.modules.avidity.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 厂平台告警名称的解析。平面图上每个点位就是靠这个从告警名反解出坐标身份，
 * 解错了点位就会被高亮到别人家去 —— 这条没有网络也能验，钉在这里。
 */
class AvidityAlarmServiceTest {

    @Test
    void twoFAlarmNameSplitsIntoRoomRackAndPoint() {
        // 交大医学院二楼：RM<房间>_<笼架>_SLV_<点位>
        assertArrayEquals(new String[]{"205-A", "13"}, AvidityAlarmService.splitAlarmName("RM205_A_SLV_13"));
        assertArrayEquals(new String[]{"201-B", "75"}, AvidityAlarmService.splitAlarmName("RM201_B_SLV_75"));
        assertArrayEquals(new String[]{"217-A", "1"}, AvidityAlarmService.splitAlarmName("RM217_A_SLV_1"));
    }

    @Test
    void b1AlarmNameKeepsItsOwnShape() {
        // B1 那台设备：RM_<区>_<笼架盒>_SLV_<点位>
        assertArrayEquals(new String[]{"A-B105", "1"}, AvidityAlarmService.splitAlarmName("RM_A_B105_SLV_1"));
        assertArrayEquals(new String[]{"A-B112", "27"}, AvidityAlarmService.splitAlarmName("RM_A_B112_SLV_27"));
    }

    @Test
    void positionLabelReadsAsHumanText() {
        assertEquals("205-A 第13点位", AvidityAlarmService.positionLabel(AvidityAlarmService.splitAlarmName("RM205_A_SLV_13")));
        assertEquals("A-B105 第1点位", AvidityAlarmService.positionLabel(AvidityAlarmService.splitAlarmName("RM_A_B105_SLV_1")));
        assertEquals("", AvidityAlarmService.positionLabel(AvidityAlarmService.splitAlarmName(null)));
    }

    @Test
    void oddNamesDoNotThrow() {
        assertArrayEquals(new String[]{"", ""}, AvidityAlarmService.splitAlarmName(""));
        // 没有 _SLV_ 段时整串当位置、点位留空
        assertArrayEquals(new String[]{"XYZ", ""}, AvidityAlarmService.splitAlarmName("XYZ"));
        assertArrayEquals(new String[]{"", "x"}, AvidityAlarmService.splitAlarmName("RM_SLV_x"));
    }
}
