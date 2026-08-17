package com.example.demo.modules.aup.dto;

import com.example.demo.modules.aup.entity.AupReviewItem;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 单次评审记录（一次专家投票或一次秘书格式审查 = 1 条整体结论 aup_review + N 条逐字段意见 aup_review_item）。
 * 供「评审总览」按 专家 + 日期 + 轮次 分组展示；含 agree/拒评/回避 等无逐条批注的场景。
 */
@Data
public class ReviewSessionVO {
    /** 评审人 userId */
    private String reviewer;
    /** 评审人姓名（后端解析） */
    private String reviewerName;
    /** secretary（格式）/ expert（内容） */
    private String role;
    /** agree/disagree/modify/recuse/abstain（整体结论） */
    private String verdict;
    /** 整体审核反馈 */
    private String comment;
    private Integer roundNo;
    private LocalDateTime createdAt;
    /** 逐字段意见（可能为空：整体同意/弃权/回避时无逐条批注） */
    private List<AupReviewItem> items;
}
