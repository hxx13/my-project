package com.example.demo.modules.aup.dto;

import com.example.demo.modules.aup.entity.AupRecord;
import lombok.Data;

import java.util.List;

/**
 * 计划书详情。draftData 各阶段都返回（非 draft 阶段供只读渲染）；template 结构由模板子模块组装（此处不重复）。
 */
@Data
public class AupDetailVO {

    private AupRecord record;
    /** 计划书内容 JSON（draft 为可编辑草稿，其余阶段为已定稿内容） */
    private String draftData;
    private Integer snapshotCount;
    private List<AupSnapshotVO> snapshots;
    private List<AupTraceVO> traces;
}
