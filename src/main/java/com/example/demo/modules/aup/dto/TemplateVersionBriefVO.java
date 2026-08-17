package com.example.demo.modules.aup.dto;

import lombok.Data;
import java.time.LocalDateTime;

/** 版本简要（版本历史 / 新建草稿 / 发布响应）。 */
@Data
public class TemplateVersionBriefVO {
    private Long id;
    private Integer version;
    private String status;
    private LocalDateTime publishedAt;
}
