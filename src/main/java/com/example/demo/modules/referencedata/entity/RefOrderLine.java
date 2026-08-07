package com.example.demo.modules.referencedata.entity;

import lombok.Data;

@Data
public class RefOrderLine {
    private Long id;
    private Long orderId;
    private Long refDataId;
    private String specSelections;
    private String hierarchyChain;
    private Integer quantity;
    private String lineRemark;
}
