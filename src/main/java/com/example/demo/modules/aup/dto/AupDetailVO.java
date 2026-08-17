package com.example.demo.modules.aup.dto;

import com.example.demo.modules.aup.entity.AupRecord;
import lombok.Data;

import java.util.List;

/**
 * 计划书详情。draftData 仅 draft 阶段返回；template 结构由模板子模块组装（此处不重复）。
 */
@Data
public class AupDetailVO {

    private AupRecord record;
    /** draft 阶段才返回的草稿 JSON */
    private String draftData;
    private Integer snapshotCount;
    private List<AupSnapshotVO> snapshots;
    private List<AupTraceVO> traces;
}
