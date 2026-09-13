package com.example.demo.modules.twin.obligation.entity;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/** 答题题库（违规「答题」处置策略用）。 */
@Getter
@Setter
public class TwinQuizBank {
    private Long id;
    /** 题库编码，策略配置 disposition_config_json.questionBankId 填这个 */
    private String bankId;
    private String name;
    /** 1=启用 */
    private Integer enabled;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
