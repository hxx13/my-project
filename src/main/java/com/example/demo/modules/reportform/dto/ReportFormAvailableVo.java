package com.example.demo.modules.reportform.dto;

import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/** 填报中心列表项：在表单定义上附带当前用户/协同表的填报时间摘要 */
@Data
@EqualsAndHashCode(callSuper = true)
public class ReportFormAvailableVo extends ReportFormDefinition {

    private LocalDateTime lastFillUpdatedAt;

    private LocalDateTime lastSubmittedAt;

    /** draft | submitted */
    private String myFillStatus;

    private Long mySubmissionId;

    /** 个人多份填报是否开启 */
    private Boolean allowMultipleInstances;

    /** 当前用户已创建的子文件数（个人表） */
    private Integer myInstanceCount;

    /** 当前用户是否为该报表发布者/创建者 */
    private Boolean publisher;

    /** 发布者视角：填报人数 */
    private Integer totalFillerCount;

    /** 发布者视角：子文件总数 */
    private Integer totalSubmissionCount;
}
