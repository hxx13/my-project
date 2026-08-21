package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 字段字典套（猪/猴等种属级目录）。 */
@Data
public class CrfFieldDictionary {
    private Long id;
    /** 稳定键 pig / monkey / custom-xxx */
    private String dictKey;
    private String name;
    /** 种属标签：猪 / 猴 / 其它 */
    private String species;
    private String description;
    /** 域/子模块大纲 JSON：{domains:[{code,name,sortOrder,submodules:[{code,name,sortOrder}]}]}；code=表码，sortOrder=展示序 */
    private String structureJson;
    private Integer version;
    /** ACTIVE/ARCHIVED */
    private String status;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /** 列表展示：该套下活跃字段数（非持久列） */
    private Integer fieldCount;
}
