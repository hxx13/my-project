package com.example.demo.modules.aup.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** AUP 公共字典。 */
@Data
public class Dict {
    private Long id;
    private String dictKey;
    private String name;
    /** 分类（分组/文件夹；NULL=未分类） */
    private String category;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
