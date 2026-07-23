package com.example.demo.modules.supplies.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 智能合并提交：购物车行按独立下单规则拆组后，指定了目标的组并入本人对应待处理单，
 * 未指定目标的组各自新建工单。目标匹配规则由后端强校验（前端仅自动预选）。
 */
@Data
public class SupplyMergeSubmitRequest {
    /** 本次购物车行（口径与新建领用单一致） */
    private List<CreateSupplyClaimRequest.Line> lines;
    /** 常规组合并目标工单号；null/空白 = 新建 */
    private String regularTargetOrderId;
    /** 独立下单物资 itemId -> 目标工单号；缺省 = 新建 */
    private Map<Long, String> independentTargets;
}
