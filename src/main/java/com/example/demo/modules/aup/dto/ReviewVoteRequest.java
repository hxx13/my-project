package com.example.demo.modules.aup.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * 专家投票请求：整体 verdict（可选，正常评审由 items 推导）+ N 条逐字段意见。
 */
@Data
public class ReviewVoteRequest {
    /** 仅 abstain/recuse 需要显式传；正常评审由 items 逐字段推导为 agree/modify/disagree */
    @Schema(description = "仅 abstain/recuse 需要显式传；正常评审由 items 逐字段推导", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String verdict;
    /** 整体审核反馈 */
    private String comment;
    /** 逐字段评审意见（可选；推导为 disagree 时须含 >=1 条 nonCompliant 且带 reason） */
    private List<VoteItem> items;

    @Data
    public static class VoteItem {
        private String fieldKey;
        private String sectionKey;
        private String fieldLabel;
        /** compliant/nonCompliant/suggest */
        private String verdict;
        private String reason;
        private String suggestion;
    }
}
