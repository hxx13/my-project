package com.example.demo.modules.referencedata.dto;

import lombok.Data;

@Data
public class RefOrderLineView {
    private Long id;
    private Long orderId;
    private Long refDataId;
    private String specSelections;
    private Object hierarchyChain;
    private Integer quantity;
    private String lineRemark;
}
