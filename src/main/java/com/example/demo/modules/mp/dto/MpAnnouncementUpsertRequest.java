package com.example.demo.modules.mp.dto;

import lombok.Data;

@Data
public class MpAnnouncementUpsertRequest {
    private String title;
    private String summary;
    private String bodyHtml;
    /** 期 6：ProseMirror/TipTap JSON 真源（可选；有则服务端派生 bodyHtml） */
    private String contentJson;
    /** 1 上线 0 下线 */
    private Integer enabled;
    private Integer sortOrder;
}
