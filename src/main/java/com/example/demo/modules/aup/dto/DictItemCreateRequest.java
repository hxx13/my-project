package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 新增字典项请求（POST /aup-dict/{dictKey}/items）。 */
@Data
public class DictItemCreateRequest {
    private String value;
    private String label;
    private Integer sortOrder;
}
