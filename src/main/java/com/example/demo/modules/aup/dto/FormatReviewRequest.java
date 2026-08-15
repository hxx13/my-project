package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.util.List;

/**
 * 格式审查请求：结论由 items 推导 —— items 非空 = 返修（逐字段格式建议）；items 空 = 通过并分配专家。
 */
@Data
public class FormatReviewRequest {
    /** 已废弃：结论由 items 推导（前端 Task 3.3 同步移除，此处保留避免反序列化失败） */
    @Deprecated
    private String action;
    /** 整体意见（返修时为退回说明；通过时可选） */
    private String comment;
    /** 专家审查形式 member | meeting（通过时必填） */
    private String reviewForm;
    /** 被选专家 userId 列表（通过时填；为空则默认沿用上一轮专家） */
    private List<String> expertIds;
    /** 逐字段格式建议（非空 → 返修） */
    private List<Item> items;

    @Data
    public static class Item {
        private String fieldKey;
        private String sectionKey;
        private String fieldLabel;
        private String reason;
        private String suggestion;
    }
}
