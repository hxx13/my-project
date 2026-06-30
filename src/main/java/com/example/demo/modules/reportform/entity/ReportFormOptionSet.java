package com.example.demo.modules.reportform.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ReportFormOptionSet {
    private Long id;
    private String name;
    private String scope;
    private Long formId;
    private String itemsJson;
    /** 创建人登录名（个人预设 scope=user） */
    private String createdBy;
    /** 账号体系：WECHAT_ARO | WEB_PASSWORD */
    private String authProfile;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
