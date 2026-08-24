package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 重命名/改排序请求（PUT /api/aup-folder/{id}）。 */
@Data
public class AupFolderUpdateRequest {
    private String name;
    private Integer sortOrder;
    private String description;
}
