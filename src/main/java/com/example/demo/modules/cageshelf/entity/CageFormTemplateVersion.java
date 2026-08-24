package com.example.demo.modules.cageshelf.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 笼位表单发布版本快照。 */
@Data
public class CageFormTemplateVersion {
    private Long id;
    private String formKey;
    private Integer versionNo;
    private Integer fieldCount;
    private String publishedBy;
    private LocalDateTime publishedAt;
}
