package com.example.demo.modules.personnel.entity;

import lombok.Data;

/**
 * 课题组成员留痕（加入 JOIN / 移出 REMOVE）。
 */
@Data
public class ProjectGroupMemberLog {
    private Long id;
    private Long projectGroupId;
    private Long personnelId;       // 被操作的人
    private String action;          // JOIN / REMOVE
    private Long actorPersonnelId;  // 操作人：JOIN=审批 PI，REMOVE=踢人 PI
    private String reason;
    private String createdAt;
}
