package com.example.demo.modules.aup.dto;

import lombok.Data;

/**
 * 专家候选（身份标签 → staff_id；姓名经 UserDisplayNameService，部门经 personnel）。
 */
@Data
public class ExpertCandidate {
    private String userId;
    private String name;
    private String dept;
}
