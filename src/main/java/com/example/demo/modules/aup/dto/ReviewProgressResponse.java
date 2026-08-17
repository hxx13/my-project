package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 投票进度：应投/已投/回避/未投名单 + 分 verdict 计数。
 */
@Data
public class ReviewProgressResponse {
    private int assignCount;
    private int votedCount;
    private int recusedCount;
    /** agree/modify/disagree/abstain 计数 */
    private Map<String, Integer> byVerdict;
    /** 尚未投票（status=pending）的专家 userId 列表 */
    private List<String> unvoted;
    /** 已投专家逐人记录（reviewer/verdict/comment），投票进度卡逐人展示 */
    private List<ReviewVoteVO> votes;
}
