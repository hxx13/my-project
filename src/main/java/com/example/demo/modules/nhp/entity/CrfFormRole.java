package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 表单级授权矩阵（角色×表单×capability）。 */
@Data
public class CrfFormRole {
    private Long id;
    private String roleKey;
    private Long formId;
    /** crf:entry/crf:verify/crf:freeze/crf:query/crf:export */
    private String capability;
    private LocalDateTime createdAt;
}
