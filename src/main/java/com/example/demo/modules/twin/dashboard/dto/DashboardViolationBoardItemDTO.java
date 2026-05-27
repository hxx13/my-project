package com.example.demo.modules.twin.dashboard.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 主页大屏「违规惩戒公示」单条 DTO，公开接口对未登录大屏返回；
 * summary 已在服务端折叠换行 + 截断，coverImageUrl 仅取附图第一张。
 */
@Data
public class DashboardViolationBoardItemDTO {
    private Long id;
    private String displayName;
    private String summary;
    private String coverImageUrl;
    private LocalDateTime createdAt;
}
