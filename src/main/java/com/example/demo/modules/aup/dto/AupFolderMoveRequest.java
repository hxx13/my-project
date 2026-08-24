package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 换父节点请求（PUT /api/aup-folder/{id}/move）。 */
@Data
public class AupFolderMoveRequest {
    private Long parentId;
}
