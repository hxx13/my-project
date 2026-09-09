package com.example.demo.modules.training.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** 报名资格占位（人级通用所有培训）：健康报告等「其他内容」的人工合格/不合格。 */
@Data
public class PersonQualification {
    private Long id;
    private String personId;
    private String itemKey;
    private Integer state;
    private String fileRef;
    private LocalDateTime updatedAt;
}
