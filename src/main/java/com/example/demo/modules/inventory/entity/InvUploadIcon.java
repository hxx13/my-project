package com.example.demo.modules.inventory.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class InvUploadIcon {
    private Long id;
    private String name;
    private String url;
    private String mime;
    private String uploadedBy;
    private LocalDateTime createdAt;
}
