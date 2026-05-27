package com.example.demo.modules.twin.dahua.entity;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class DahuaSwingRecord {
    private Long id;
    private Long taskId;
    /** REALTIME=即时拉取任务 | STATS=统计批量拉取任务 */
    private String pullTaskType;
    private String recordId;
    private String cardNumber;
    private Integer cardStatus;
    private String channelCode;
    private String channelName;
    private Integer openType;
    private String personCode;
    private Long personId;
    private String personName;
    /** 大华部门 ID（拉取落库），26=学生 */
    private String departmentId;
    private String departmentName;
    /** STUDENT | STAFF */
    private String audienceType;
    private String swingTime;
    private String createTime;
    private Integer openResult;
    private Integer enterOrExit;
    private String mappingUserId;
    private String mappingCardNo;
    private Integer mappingHit;
    private Integer freezeExemptFlag;
    private String rawJson;
    private String ingestedAt;
}
