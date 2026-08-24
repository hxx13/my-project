package com.example.demo.modules.aup.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** AUP 组合域钉住的原子域版本引用。 */
@Data
public class AupCompositeAtom {
    private Long id;
    /** → form_template.id(kind=COMPOSITE) */
    private Long compositeTemplateId;
    /** 原子域 form_key */
    private String atomFormKey;
    /** 钉住的原子域版本行 id */
    private Long atomTemplateId;
    private Integer sortOrder;
    private LocalDateTime createdAt;
}
