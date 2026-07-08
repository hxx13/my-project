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
    /** 固定周期：窗口起始（MM-DD，如 "03-01"）；每年重复 */
    private String unblockWindowStart;
    /** 固定周期：窗口结束（MM-DD，如 "07-01"）；每年重复 */
    private String unblockWindowEnd;
    /** 达到上限时的公告文案模板（替换原违规文案）；支持 ${name} ${dept} ${date} */
    private String criticalNoticeText;
    private Integer autoSignoutEnabled;
    private String whitelistDepts;
    private String cronExpression;
    private LocalDateTime lastExecutionAt;
    private String lastExecutionResult;
    /** 监控的特殊状态类型 JSON */
    private String cageStatusCodes;
    /** 延迟天数 */
    private Integer cageDelayDays;
    /** 判定模式: AUTO_SYNC_LINKED / PURE_DAYS / PURE_MANUAL */
    private String cageJudgeMode;
    /** 手动执行也触发判定: 0=否 1=是 */
    private Integer cageManualTrigger;
    /** 区域筛选 JSON */
    private String cageAreaFilter;
    /** 课题组白名单 JSON */
    private String cageGroupWhitelist;
    /** 触发动作: VIOLATION_ONLY / NOTICE_ONLY / BOTH */
    private String cageTriggerAction;
    /** 违规图片 URL JSON 数组 */
    private String cageImageUrls;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
