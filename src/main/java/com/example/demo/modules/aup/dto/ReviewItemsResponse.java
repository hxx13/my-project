package com.example.demo.modules.aup.dto;

import com.example.demo.modules.aup.entity.AupReviewItem;
import lombok.Data;

import java.util.List;

/**
 * 逐字段评审意见（总览 = 不带 fieldKey；快捷入口 = 带 fieldKey）。
 */
@Data
public class ReviewItemsResponse {
    private ReviewItemsSummary summary;
    private List<AupReviewItem> items;
}
