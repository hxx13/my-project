package com.example.demo.modules.me.dto;

import com.example.demo.modules.material.dto.MaterialRequestView;
import com.example.demo.modules.material.entity.MaterialDemand;
import lombok.Data;

import java.util.List;
import java.util.Map;

/** 学生审核工作台聚合数据（Web MaterialReviewPage / 小程序 studentReviewHub 共用） */
@Data
public class StudentReviewDashboardVo {
    private List<MaterialRequestView> pendingMaterials;
    private List<MaterialRequestView> allMaterials;
    private int allMaterialsTotal;
    private List<Map<String, Object>> scanDelayPending;
    private List<MaterialDemand> demands;
    private int demandsTotal;
    private boolean demandEntryVisible;
    private int pendingMaterialCount;
    private int scanDelayPendingCount;
    private int openDemandCount;
}
