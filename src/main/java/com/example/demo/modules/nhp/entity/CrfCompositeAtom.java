package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 组合模板对原子模板的钉版本引用。 */
@Data
public class CrfCompositeAtom {
    private Long id;
    private Long compositeFormId;
    private String atomCode;
    private Long atomFormId;
    private Integer sortOrder;
    private LocalDateTime createdAt;
}
