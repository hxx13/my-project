package com.example.demo.modules.purchase.dto;

import lombok.Data;

import java.util.List;

@Data
public class CompletePurchaseOrderRequest {
    private String resultRemark;
    private List<String> resultImages;
}
