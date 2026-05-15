package com.example.demo.modules.supplies.dto;

import lombok.Data;

import java.util.List;

@Data
public class CreateSupplyClaimRequest {
    private List<Line> lines;

    @Data
    public static class Line {
        private Long itemId;
        private Integer qty;
    }
}
