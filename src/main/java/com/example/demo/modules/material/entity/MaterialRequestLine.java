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
    private LocalDateTime createdAt;
}
