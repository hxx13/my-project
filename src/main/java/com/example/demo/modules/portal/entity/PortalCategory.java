package com.example.demo.modules.portal.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class PortalCategory {
    private Long id;
    private String name;
    private String scope;
    private Long parentId;
    private Integer sortOrder;
    private Integer status;
    private String coverUrl;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
