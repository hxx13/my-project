package com.example.demo.modules.material.dto;

import lombok.Data;
import java.util.List;

@Data
public class CreateMaterialRequestReq {
    private List<LineItem> lines;

    @Data
    public static class LineItem {
        private Long itemId;
        private Integer qty;
    }
}
