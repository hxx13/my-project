package com.example.demo.modules.identity.dto;

import lombok.Data;

/** 身份标签新建/更新请求体（新建时需 code + label；id 由后端自增生成）。 */
@Data
public class IdentityTagUpsertRequest {
    private String code;
    private String label;
    private Integer sortOrder;
    private Integer active;
}
