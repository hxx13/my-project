package com.example.demo.modules.mp.dto;

import lombok.Data;

@Data
public class MpAnnouncementUpsertRequest {
    private String title;
    private String summary;
    private String bodyHtml;
    /** 1 上线 0 下线 */
    private Integer enabled;
    private Integer sortOrder;
}
