package com.example.demo.modules.repair.dto;

import lombok.Data;

import java.util.List;

@Data
public class CompleteRepairOrderRequest {
    private String resultRemark;
    private List<String> resultImages;
}
