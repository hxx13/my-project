package com.example.demo.modules.twin.scan.delay.entity;

import lombok.Data;

@Data
public class TwinScanDelayCarrierOption {
    private Long id;
    private Long carrierId;
    private Long optionId;
    private Integer sortOrder;
}
