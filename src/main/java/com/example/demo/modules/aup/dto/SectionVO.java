package com.example.demo.modules.aup.dto;

import lombok.Data;
import java.util.List;

/** 大段节点（请求/响应共用）。subdivisible 为 true 时字段挂在 subsections 下，否则挂 fields 下。 */
@Data
public class SectionVO {
    private Long id;
    private String code;
    private String label;
    private Integer sortOrder;
    private Boolean subdivisible;
    private Object showWhen;
    private Boolean highlight;
    private List<SubsectionVO> subsections;
    private List<FieldVO> fields;
}
