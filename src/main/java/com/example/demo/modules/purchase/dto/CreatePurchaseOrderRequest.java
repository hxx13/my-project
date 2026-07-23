package com.example.demo.modules.purchase.dto;

import lombok.Data;

import java.util.List;

@Data
public class CreatePurchaseOrderRequest {
    private String location;
    private String content;
    private List<String> requestImages;
    private Boolean isPublic;
}
