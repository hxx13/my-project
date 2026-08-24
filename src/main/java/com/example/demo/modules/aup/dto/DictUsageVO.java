package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.util.List;

/** 码表引用链（GET /api/aup-dict/{dictKey}/usage）。 */
@Data
public class DictUsageVO {
    private String dictKey;
    private Integer refCount;
    private List<DictUsageRef> refs;
}
