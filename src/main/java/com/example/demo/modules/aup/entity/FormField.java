package com.example.demo.modules.aup.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** AUP 表单字段。section_id 与 subsection_id 二选一。 */
@Data
public class FormField {
    private Long id;
    private Long sectionId;
    private Long subsectionId;
    private String fieldKey;
    private String label;
    /** 说明文字（可空，支持富文本 HTML） */
    private String description;
    /** text/textarea/number/date/choice/checkbox/table/group/file/signature/personPicker 等 */
    private String type;
    /** 字段角色快照 VALUE/DERIVED/PK/FK（对齐 cage/NHP，缺省 VALUE） */
    private String role;
    /** 选项 JSON：[{value,label}]，value=label 可简写字符串数组（String 存原始 JSON） */
    private String options;
    /** 引用 dict.dict_key */
    private String dictKey;
    /** 发布时钉住的 dict 版本；NULL=跟随最新已发布 */
    private Integer dictVersion;
    private Boolean required;
    private String showWhen;
    private Integer sortOrder;
    /** maxLength/choiceType/columns/unit/min/max/accept 等 JSON */
    private String config;
    private LocalDateTime createdAt;
}
