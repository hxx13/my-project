package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 新建原子域请求（POST /api/aup-template/atom）。 */
@Data
public class AtomCreateRequest {
    /** 调用方给定 formKey；缺省用 atom:{code}（或 atom:{name}）。 */
    private String formKey;
    private String name;
    private String code;
    private String description;
    private Long folderId;
}
