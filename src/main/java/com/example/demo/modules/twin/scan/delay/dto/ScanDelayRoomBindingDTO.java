package com.example.demo.modules.twin.scan.delay.dto;

import lombok.Data;

import java.util.List;

@Data
public class ScanDelayRoomBindingDTO {
    private String roomId;
    /** 房间已绑定的载体按钮 ID 列表 */
    private List<Long> carrierIds;
}
