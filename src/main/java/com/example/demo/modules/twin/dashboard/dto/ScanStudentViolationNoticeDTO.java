package com.example.demo.modules.twin.dashboard.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 扫码 analyze 返回：当前人员生效中的违规通告（供弹窗覆盖层与进房按钮锁定）。
 */
@Data
public class ScanStudentViolationNoticeDTO {
    private Long id;
    private String violationText;
    private List<String> imageUrls;
    /** 是否每次扫码都展示通告（否则前端可「已知悉」后本会话收起文案区，仍保留进房限制逻辑） */
    private Boolean showNoticeEveryScan;
    /** 综合 forbid_enter 与进入次数上限后的进房禁止 */
    private Boolean enterLocked;
    /** 剩余允许成功进入次数；null 表示未配置上限 */
    private Integer remainingEnterAllowance;
    /** 交互式确认短语（如 "一人一卡,严禁尾随"）；null 表示普通公告 */
    private String interactiveChallenge;
    /** 是否已完成交互拼图并永久解除禁入 */
    private Boolean interactiveChallengeVerified;
    /** 违规期限；NULL 表示不按时间过期 */
    private LocalDateTime expireAt;
    /** 已超过违规期限且交互验证仍未完成（须先完成验证才能结束） */
    private Boolean pastExpireAwaitingInteractive;
    /** 触发规则名称 */
    private String ruleName;
    /** 解禁方式：自助解禁 / 仅工作人员 */
    private String unblockMethod;
    /** 是否关键记录（达到解禁上限，自助通道已关闭） */
    private Boolean critical;
    /** 当前是否允许自助解禁 */
    private Boolean canSelfUnblock;
}
