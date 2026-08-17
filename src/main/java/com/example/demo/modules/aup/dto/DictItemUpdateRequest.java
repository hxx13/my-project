package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 修改字典项请求（PUT /aup-dict/{dictKey}/items/{itemId}）。 */
@Data
public class DictItemUpdateRequest {
    private String value;
    private String label;
}
