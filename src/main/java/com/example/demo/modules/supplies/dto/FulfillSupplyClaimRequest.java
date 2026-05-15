package com.example.demo.modules.supplies.dto;

import lombok.Data;

import java.util.List;

@Data
public class FulfillSupplyClaimRequest {
    private List<Line> lines;

    @Data
    public static class Line {
        private Long lineId;
        private Boolean grant;
        private Integer fulfillQty;
    }
}
