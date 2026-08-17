package com.example.demo.modules.aup.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** AUP 字典项。 */
@Data
public class DictItem {
    private Long id;
    private Long dictId;
    /** 落库值 */
    private String value;
    /** 展示文本 */
    private String label;
    private Integer sortOrder;
    private LocalDateTime createdAt;
}
