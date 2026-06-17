package com.example.demo.modules.twin.dashboard.entity;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
public class TwinViolationRule {
    private Long id;
    private String ruleCode;
    private String ruleName;
    private Integer enabled;
    private String sourceTag;
    private String violationTextTpl;
    private Integer forbidEnter;
    private Integer expireAfterDays;
    private Integer showNoticeEveryScan;
    private String interactiveChallenge;
    private Integer interactiveUnlockOnVerify;
    /** 解禁方式：自助解禁 / 仅工作人员 */
    private String unblockMethod;
    /** 窗口内最大违规次数；NULL=不限制 */
    private Integer unblockMaxCount;
    /** 窗口类型：滑动窗口 / 固定周期 */
    private String unblockWindowType;
    /** 滑动天数 或 固定周期编号(1=自然月 2=自然周 3=学期) */
    private Integer unblockWindowValue;
    private Integer autoSignoutEnabled;
    private String whitelistDepts;
    private String cronExpression;
    private LocalDateTime lastExecutionAt;
    private String lastExecutionResult;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
