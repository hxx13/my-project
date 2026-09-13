package com.example.demo.modules.twin.obligation.entity;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/** 题库题目。{@code optionsJson} 是字符串数组的 JSON，{@code correctIndex} 从 0 起。 */
@Getter
@Setter
public class TwinQuizQuestion {
    private Long id;
    private String bankId;
    private String prompt;
    /** 选项数组 JSON，如 ["A","B"] */
    private String optionsJson;
    private Integer correctIndex;
    /** 1=启用（抽题只取启用题） */
    private Integer enabled;
    /** 同库内唯一，兼作种子幂等键 */
    private Integer sortOrder;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
