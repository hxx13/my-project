package com.example.demo.modules.identity.dto;

import lombok.Data;

/** 身份标签视图对象（对外暴露 id + code + label）。 */
@Data
public class IdentityTagVO {
    private Long id;
    private String code;
    private String label;
}
