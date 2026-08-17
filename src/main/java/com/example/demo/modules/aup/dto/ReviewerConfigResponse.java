package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.util.List;

/**
 * 审查人名册配置读取结果。
 */
@Data
public class ReviewerConfigResponse {
    private List<ExpertCandidate> formatReviewers;
    private List<ExpertCandidate> expertCandidates;
}
