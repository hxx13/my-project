package com.example.demo.modules.aup.dto;

import lombok.Data;

/**
 * 单条专家投票（aup_review，role=expert），供投票进度卡逐人展示。
 */
@Data
public class ReviewVoteVO {
    private String reviewer;
    private String role;
    private String verdict;
    private String comment;
}
