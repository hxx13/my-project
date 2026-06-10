package com.example.demo.modules.material.dto;

import lombok.Data;
import java.util.List;

@Data
public class CreateMaterialRequestReq {
    /** 申请人所属课题组（前端传入） */
    private String applicantGroup;
    private List<LineItem> lines;

    @Data
    public static class LineItem {
        private Long itemId;
        private Integer qty;
    }
}
