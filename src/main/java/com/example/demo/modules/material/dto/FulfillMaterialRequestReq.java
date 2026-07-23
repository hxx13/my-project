package com.example.demo.modules.material.dto;

import lombok.Data;
import java.util.List;

@Data
public class FulfillMaterialRequestReq {
    private List<LineFulfill> lines;

    @Data
    public static class LineFulfill {
        private Long lineId;
        private Boolean grant;
        private Integer fulfillQty;
    }
}
