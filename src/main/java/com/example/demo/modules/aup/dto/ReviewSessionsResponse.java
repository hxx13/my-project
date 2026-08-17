package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.util.List;

/**
 * 评审总览数据（GET /aup/{id}/review/sessions）：
 * 全轮次每次评审记录（整体结论 + 逐字段意见）+ 逐字段汇总。
 */
@Data
public class ReviewSessionsResponse {
    private ReviewItemsSummary summary;
    private List<ReviewSessionVO> sessions;
}
