package com.example.demo.modules.aup.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** AUP 配置面通用文件夹（码表 CODELIST / 字段 FIELD / 原子域 ATOM 三处共用）。 */
@Data
public class AupFolder {
    private Long id;
    /** CODELIST / FIELD / ATOM */
    private String ownerType;
    /** 自引用父文件夹；0=根 */
    private Long parentId;
    private String name;
    private Integer sortOrder;
    private String description;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
