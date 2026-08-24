package com.example.demo.modules.aup.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** AUP 公共字典。 */
@Data
public class Dict {
    private Long id;
    private String dictKey;
    private String name;
    /** 分类（分组/文件夹；NULL=未分类，迁移数据源，新数据写入 folder_id） */
    private String category;
    /** 整表版本，同 dict_key 多行 */
    private Integer version;
    /** DRAFT / PENDING_REVIEW / PUBLISHED / ARCHIVED */
    private String status;
    /** → aup_folder(owner_type=CODELIST)；NULL=未分类 */
    private Long folderId;
    private LocalDateTime publishedAt;
    private String publishedBy;
    private String reviewComment;
    /** LOCAL/EXTERNAL（外部引用码表头，值域不在 AUP 管理） */
    private String source;
    /** 外部引用类型：projectGroup/ANIMAL_BREED/ANIMAL_STRAIN */
    private String sourceRef;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
