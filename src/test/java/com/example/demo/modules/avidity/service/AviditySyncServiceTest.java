package com.example.demo.modules.avidity.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 仪表盘 content 解析：三种通道各自引用了哪台设备，必须挖对。
 *
 * <p>下面的 content 是平台 2026-10-15 给的真实样本。解析器一旦被改坏，
 * 通道表就会空掉或挂错设备 —— 而这条路径没有网络也能验，所以钉在这里。
 */
class AviditySyncServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 交医-2：主画面块 + 告警统计块，两块都指 219021，去重后只应出一条。 */
    private static final String CONTENT_JIAOYI_2 = """
            [{"dashBoardContentType":0,"config":{"dragHandle":".handle","col":1,"row":1,"sizex":4,"sizey":7,"minCols":2,"minRows":4,"maxCols":8,"payload":0},"props":{"id":"7ae87323-ab6d-4c90-93ef-cee4d4ae27d7","timestamp":0,"title":"主画面","modalId":"configure_219021_902245","configureViewCode":"c411d35e-a9ce-468a-466c-08ddd3b474e6","virtualDeviceId":219021,"configureId":111965,"configureViewId":902245},"id":"7ae87323-ab6d-4c90-93ef-cee4d4ae27d7"},{"dashBoardContentType":11,"config":{"dragHandle":".handle","col":5,"row":1,"sizex":4,"sizey":7,"minCols":2,"minRows":4,"maxCols":8,"payload":1},"props":{"0":{"virtualDeviceId":219021,"deviceName":"交大医学院二楼"},"id":"24320fe0-ae77-4ae8-86a2-ab69f814d649","reportTitle":"AlarmStatisticsTable","deviceVariables":[{"virtualDeviceId":219021,"deviceName":"交大医学院二楼"}],"timestamp":100},"id":"24320fe0-ae77-4ae8-86a2-ab69f814d649"}]
            """;

    /** 交医-隔离包：只有主画面块，没有告警统计块 —— 设备信息只藏在 props.virtualDeviceId 里。 */
    private static final String CONTENT_ISOLATION = """
            [{"dashBoardContentType":0,"config":{"dragHandle":".handle","col":1,"row":1,"sizex":4,"sizey":7,"minCols":2,"minRows":4,"maxCols":8,"payload":0},"props":{"id":"d1ce17b7-f5fd-4fe6-a281-684d405068da","timestamp":0,"title":"隔离包主界面","modalId":"configure_219021_928456","configureViewCode":"95a2b9e4-24d1-4da1-7035-08de372c3904","virtualDeviceId":219021,"configureId":111965,"configureViewId":928456},"id":"d1ce17b7-f5fd-4fe6-a281-684d405068da"}]
            """;

    /** 交医-B1：另一台设备 219350，主画面里用的是 F-Box。 */
    private static final String CONTENT_B1 = """
            [{"dashBoardContentType":0,"config":{"dragHandle":".handle","col":1,"row":1,"sizex":4,"sizey":7,"minCols":2,"minRows":4,"maxCols":8,"payload":0},"props":{"id":"cb583a81-9c26-439c-82b6-19c677bc0af9","timestamp":0,"title":"主画面","modalId":"configure_219350_930084","virtualDeviceId":219350,"configureId":114773,"configureViewId":930084},"id":"cb583a81-9c26-439c-82b6-19c677bc0af9"},{"dashBoardContentType":11,"props":{"reportTitle":"AlarmStatisticsTable","deviceVariables":[{"virtualDeviceId":219350,"deviceName":"交大医学院-B1"}]},"id":"16bfb638-65ff-417d-9105-31d21ae468e9"}]
            """;

    @Test
    void mainPictureAndAlarmTablePointingAtSameDeviceYieldOneRow() {
        assertEquals(List.of(219021L), AviditySyncService.referencedDeviceIds(CONTENT_JIAOYI_2, objectMapper));
    }

    @Test
    void mainPictureOnlyStillYieldsItsDevice() {
        assertEquals(List.of(219021L), AviditySyncService.referencedDeviceIds(CONTENT_ISOLATION, objectMapper));
    }

    @Test
    void separateDeviceIsReportedSeparately() {
        assertEquals(List.of(219350L), AviditySyncService.referencedDeviceIds(CONTENT_B1, objectMapper));
    }

    @Test
    void blankContentYieldsNothing() {
        assertTrue(AviditySyncService.referencedDeviceIds("", objectMapper).isEmpty());
        assertTrue(AviditySyncService.referencedDeviceIds(null, objectMapper).isEmpty());
    }

    @Test
    void malformedContentYieldsNothingInsteadOfThrowing() {
        assertTrue(AviditySyncService.referencedDeviceIds("[{\"props\":", objectMapper).isEmpty());
    }

    /** 主画面块的 configureViewId 就是平面图布局的文件名；告警统计块没有这个字段，不能误取。 */
    @Test
    void configureViewIdComesFromTheMainPictureBlock() {
        assertEquals(902245L, AviditySyncService.configureViewIdOf(CONTENT_JIAOYI_2, objectMapper));
        assertEquals(930084L, AviditySyncService.configureViewIdOf(CONTENT_B1, objectMapper));
    }

    @Test
    void configureViewIdIsNullWhenAbsent() {
        assertEquals(null, AviditySyncService.configureViewIdOf(
                "[{\"props\":{\"title\":\"只有告警统计\"},\"dashBoardContentType\":11}]", objectMapper));
        assertEquals(null, AviditySyncService.configureViewIdOf("", objectMapper));
        assertEquals(null, AviditySyncService.configureViewIdOf(null, objectMapper));
    }
}
