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
        /** 规格快照 JSON，如 {"尺码":"S","颜色":"红"} */
        private String specSnapshot;
    }
}
