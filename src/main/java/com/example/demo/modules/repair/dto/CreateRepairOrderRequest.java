package com.example.demo.modules.repair.dto;

import lombok.Data;

import java.util.List;

@Data
public class CreateRepairOrderRequest {
    private String location;
    private String content;
    private List<String> requestImages;
    private Boolean isPublic;
}
