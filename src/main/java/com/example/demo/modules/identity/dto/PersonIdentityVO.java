package com.example.demo.modules.identity.dto;

import lombok.Data;

import java.util.List;

/** 单个人员（学生/员工）持有的身份标签集合。 */
@Data
public class PersonIdentityVO {
    private String userId;
    private String scope;
    private List<IdentityTagVO> tags;
}
