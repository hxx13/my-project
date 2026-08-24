package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 字段移动到别的文件夹请求（PUT /api/aup-field/{id}/move）。 */
@Data
public class AupFieldMoveRequest {
    private Long folderId;
    private Integer sortOrder;
}
