package com.example.demo.modules.twin.dashboard.entity;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
public class TwinStudentViolation {
    private Long id;
    private String targetUserId;
    private String violationText;
    /** JSON array string */
    private String imageUrls;
    private Integer forbidEnter;
    private Integer maxEnterSuccess;
    private Integer enterSuccessCount;
    private Integer showNoticeEveryScan;
    private LocalDateTime expireAt;
    private String status;
    private String createdByUserId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime clearedAt;
    private String clearedByUserId;
    private String source;
    /** 交互式确认短语；null=普通公告，非空=扫码弹窗显示交互拼图 */
    private String interactiveChallenge;
    /** 交互拼图完成时间；非 null 表示已永久解除禁入 */
    private LocalDateTime interactiveChallengeVerifiedAt;
    /** 交互验证完成后是否自动解除禁入；1=是 */
    private Integer interactiveUnlockOnVerify;
    /** 关联触发规则ID */
    private Long ruleId;
    /** 关联笼架违规父记录ID，NULL=非笼架触发 */
    private Long cageViolationId;
}
