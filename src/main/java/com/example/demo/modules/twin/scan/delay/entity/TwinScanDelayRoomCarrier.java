package com.example.demo.modules.twin.scan.delay.entity;

import lombok.Data;

@Data
public class TwinScanDelayRoomCarrier {
    private Long id;
    private String roomId;
    private Long carrierId;
    private Integer sortOrder;
}
