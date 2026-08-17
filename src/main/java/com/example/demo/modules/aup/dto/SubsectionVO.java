package com.example.demo.modules.aup.dto;

import lombok.Data;
import java.util.List;

/** 小章节节点（请求/响应共用）。 */
@Data
public class SubsectionVO {
    private Long id;
    private String code;
    private String label;
    private Integer sortOrder;
    private String description;
    /** 小节说明高亮变体 info/warn/danger/muted（与字段级 config.tone 语义一致） */
    private String descriptionTone;
    private Object showWhen;
    private List<FieldVO> fields;
}
