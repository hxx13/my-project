package com.example.demo.modules.referencedata.service;

import com.example.demo.modules.referencedata.dto.RefOrderLineView;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 「领用方式/房间」列的取值契约。
 *
 * <p>取走（TAKE）既不占笼位也不选房间，房间与笼位都是空。只凭「房间为空」无法把它与
 * 「历史单丢了房间快照」区分开，所以这一列必须读 pickup_mode，否则导出里两种单长得一模一样。
 */
class AnimalOrderExportPickupTextTest {

    private static RefOrderLineView line(String pickupMode, String roomName) {
        RefOrderLineView v = new RefOrderLineView();
        v.setPickupMode(pickupMode);
        v.setPickupRoomName(roomName);
        return v;
    }

    @Test
    void 取走行印取走_不印空() {
        assertEquals("取走", AnimalOrderExportService.pickupText(line("TAKE", null)));
    }

    @Test
    void 取走行即使意外带回房间_也以方式为准() {
        assertEquals("取走", AnimalOrderExportService.pickupText(line("take", "浦东 / A101")));
    }

    @Test
    void 饲养行印房间全路径() {
        assertEquals("浦东 / A101", AnimalOrderExportService.pickupText(line("FARM", "浦东 / A101")));
    }

    @Test
    void 饲养但房间快照缺失_留空而不是误判成取走() {
        assertEquals("", AnimalOrderExportService.pickupText(line("FARM", null)));
        assertEquals("", AnimalOrderExportService.pickupText(line(null, null)));
    }

    @Test
    void 空行不抛() {
        assertEquals("", AnimalOrderExportService.pickupText(null));
    }
}
