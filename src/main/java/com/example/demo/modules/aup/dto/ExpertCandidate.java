package com.example.demo.modules.aup.dto;

import lombok.Data;

/**
 * 专家候选（名册 aup_reviewer 关联人员库 aro_personnel 补姓名/部门）。
 */
@Data
public class ExpertCandidate {
    private String userId;
    private String name;
    private String dept;
}
