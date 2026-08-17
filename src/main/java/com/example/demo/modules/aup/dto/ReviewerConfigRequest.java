package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.util.List;

/**
 * 审查人名册配置（全量替换写入 aup_reviewer）。
 */
@Data
public class ReviewerConfigRequest {
    /** 格式审查人（秘书）userId 列表 */
    private List<String> formatReviewers;
    /** 专家 userId 列表 */
    private List<String> expertCandidates;
}
