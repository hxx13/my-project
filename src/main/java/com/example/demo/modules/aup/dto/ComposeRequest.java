package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.util.List;

/** 新建组合域请求（POST /api/aup-template/compose）。 */
@Data
public class ComposeRequest {
    private String formKey;
    private String name;
    private String description;
    private Long folderId;
    private List<AtomRef> atoms;
}
