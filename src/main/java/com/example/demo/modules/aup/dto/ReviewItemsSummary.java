package com.example.demo.modules.aup.dto;

import lombok.Data;

/**
 * 逐字段评审总览计数。
 */
@Data
public class ReviewItemsSummary {
    /** 已评审（去重字段数） */
    private int reviewedCount;
    private int nonCompliantCount;
    private int suggestCount;
    /** 该计划模板版本字段总数 */
    private long totalFields;
}
