package com.example.demo.modules.twin.dashboard.entity;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
public class ViolationTextTemplate {
    private Long id;
    private String name;
    private String violationText;
    /** ProseMirror/TipTap JSON 真源；violationText 为派生 HTML 缓存 */
    private String contentJson;
    private Integer sortOrder;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
