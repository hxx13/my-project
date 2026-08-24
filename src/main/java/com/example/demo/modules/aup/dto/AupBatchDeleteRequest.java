package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.util.List;

/** 批量删除请求：selectAll=true 按筛选条件全删（含未加载分页）；否则按 ids 删。 */
@Data
public class AupBatchDeleteRequest {
    private boolean selectAll;
    private List<Long> ids;
    /** 筛选条件（与 GET /aup/list 同参数，selectAll=true 时生效） */
    private String keyword;
    private String registerNo;
    private String stage;
    private List<String> excludeStages;
    private String projectGroupName;
    private String draftSource;
    private Integer roundNo;
    private String submitterName;
    private String reviewerName;
    private boolean relatedToMe;
    private String sortBy;
    private String sortDir;
}
