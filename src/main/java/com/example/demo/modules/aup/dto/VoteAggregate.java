package com.example.demo.modules.aup.dto;

import lombok.Data;

/**
 * 某轮次投票聚合（分配数/回避数/各 verdict 计数），结算判定输入。
 */
@Data
public class VoteAggregate {
    private Long assignCount;
    private Long recusedCount;
    private Long agreeCount;
    private Long disagreeCount;
    private Long modifyCount;
    private Long abstainCount;
}
