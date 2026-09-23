package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 卡片上「逐规格显示剩余量」的批量查询。
 *
 * <p>**为什么批量**：一张卡有 1..k 个规格，一屏有若干张卡；逐规格发请求会把订购页打成
 * 「一屏几十个请求 × 轮询」。规格由前端枚举（它本来就知道自己渲染了哪些行），
 * 所以这里收的是精确的 (refDataId, spec) 对，服务端不必再猜有哪些规格。
 *
 * <p>{@code cycle} 为空 = 本周期（服务端解析为当前周期后按它统计）。
 */
@Data
public class RefQuotaBatchRequest {
    private List<Row> items = new ArrayList<>();
    /** 空 = 本周期 */
    private LocalDate cycle;
    private String campus;

    @Data
    public static class Row {
        private Long refDataId;
        /** "模板名: 选项"；无规格物品留空 */
        private String spec;
    }
}
