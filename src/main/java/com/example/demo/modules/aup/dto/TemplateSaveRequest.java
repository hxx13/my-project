package com.example.demo.modules.aup.dto;

import lombok.Data;
import java.util.List;

/** 整树快照式保存请求（PUT /aup-template/{id}）。 */
@Data
public class TemplateSaveRequest {
    private String name;
    private String description;
    private List<SectionVO> sections;
}
