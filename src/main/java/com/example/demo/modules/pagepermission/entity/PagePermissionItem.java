package com.example.demo.modules.pagepermission.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class PagePermissionItem {
    private Long id;
    private String platform;
    private String nodeKey;
    private String nodeType;
    private String displayName;
    private String pathOrRoute;
    private String entrySource;
    private String minRole;
    private String defaultMinRole;
    private Integer enabled;
    private String parentNodeKey;
    private String chainKey;
    private Integer autoDiscovered;
    private Integer manualOverride;
    private LocalDateTime lastDiscoveredAt;
    private LocalDateTime createdTime;
    private LocalDateTime updatedTime;
}

