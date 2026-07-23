package com.example.demo.modules.material.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class MaterialRequestLine {
    private Long id;
    private String requestId;
    private Long itemId;
    private Integer qty;
    private String snapshotName;
    private Integer fulfilledQty;
    /** 规格快照 JSON，如 {"尺码":"S","颜色":"红"} */
    private String specSnapshot;
    private LocalDateTime createdAt;
}
