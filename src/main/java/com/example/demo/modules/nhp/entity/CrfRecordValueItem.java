package com.example.demo.modules.nhp.entity;

import lombok.Data;

/** NHP 多选枚举值项（ENUM_MULTI 落地）。 */
@Data
public class CrfRecordValueItem {
    private Long id;
    private Long recordValueId;
    private Long codelistItemId;
}
