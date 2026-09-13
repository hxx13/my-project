package com.example.demo.modules.twin.obligation.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TwinObligation {
    private Long id;
    private String subjectUserId;
    private String sourceType;
    private String sourceId;
    private String title;
    private String contentHtml;
    /** ProseMirror/TipTap JSON 真源（期 6）；HTML 为派生缓存 */
    private String contentJson;
    private String dispositionType;
    private String dispositionConfigJson;
    /** 1 = 内容变更后需重新确认 */
    private Integer requireReconfirm;
    private String status;
    private LocalDateTime dueAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    /** 已提交处置次数（含失败）；答题重试上限据此判定 */
    private Integer attemptCount;
}
