package com.example.demo.modules.supplies.dto;

import lombok.Data;

import java.util.List;

@Data
public class FulfillSupplyClaimRequest {
    private List<Line> lines;
    /** 领用楼层（订单级，领用单表头那栏）：出库时手填，不填就留白手写。 */
    private String claimFloor;

    @Data
    public static class Line {
        private Long lineId;
        private Boolean grant;
        private Integer fulfillQty;
        private String remark;
    }
}
