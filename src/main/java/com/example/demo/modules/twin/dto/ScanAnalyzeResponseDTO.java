package com.example.demo.modules.twin.dto;

import com.example.demo.modules.twin.dto.scan.ScanUserInfoDTO;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class ScanAnalyzeResponseDTO {
    private boolean success;
    private String message;
    private String currentState;
    private List<Map<String, Object>> pendingRooms;
    private List<Map<String, Object>> allowedRooms;
    private Integer globalUserState;
    private List<Map<String, Object>> disciplinaryRecords;
    private ScanUserInfoDTO userInfo;
    /** 是否在 twin_card_mapping 中有该人员的物理卡映射（有则前端指示「自带校园卡」，无则「领用公卡」） */
    private Boolean hasPhysicalCardMapping;
    /** 门禁联动配置：是否启用扫码弹窗入口时段限制 */
    private Boolean scanPopupEntryWindowEnabled;
    /** 当前是否处于允许打卡的时段内（未启用限制时为 true） */
    private Boolean scanPopupEntryAllowedNow;
    /** 学生违规通告（管理员下发）；无则 null */
    private ScanStudentViolationNoticeDTO studentViolationNotice;
}
