package com.example.demo.modules.referencedata.dto;

import lombok.Data;

/** 订单行周期占用投影：某物品某规格在某周期的已下单行（数量 + 订单状态）。 */
@Data
public class OrderLineCycleUsage {
    private int quantity;
    private String orderStatus;
}
