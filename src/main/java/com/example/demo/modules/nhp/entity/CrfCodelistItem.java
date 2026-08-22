package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 码表项（采集存 item 不存 label）。 */
@Data
public class CrfCodelistItem {
    private Long id;
    private Long codelistId;
    /** 稳定码 SH/GTKO（改 label 不改 code） */
    private String itemCode;
    private String itemLabel;
    private Integer sortOrder;
    /** 校对四态 CONFIRM/MODIFY/DELETE/QUESTION（V36） */
    private String verdict;
    private String verdictNote;
    private Boolean active;
    private LocalDateTime createdAt;
}
