package com.example.demo.modules.aup.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 结构化校验错误。code 为符号码（REQUIRED / MAX_LENGTH_EXCEEDED / B7_REQUIRED /
 * SIGNATURE_REQUIRED / LINKAGE_REQUIRED / DICT_ILLEGAL / ROW_INCOMPLETE ...），
 * rowIndex 仅表格行校验时存在。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AupValidationErrorDTO {

    private String fieldKey;
    private String code;
    private String message;
    /** 表格行号（从 1 开始），非表格错误为 null */
    private Integer rowIndex;

    public AupValidationErrorDTO(String fieldKey, String code, String message) {
        this(fieldKey, code, message, null);
    }
}
