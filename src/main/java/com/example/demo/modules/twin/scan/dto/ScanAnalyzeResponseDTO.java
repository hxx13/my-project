package com.example.demo.modules.twin.scan.dto;

import com.example.demo.modules.twin.dashboard.dto.ScanPopupAnnouncementBundleDTO;
import com.example.demo.modules.twin.dashboard.dto.ScanStudentViolationNoticeDTO;
import com.example.demo.modules.twin.scan.dto.scan.ScanUserInfoDTO;
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
    /** 当前是否处于允许扫码进入的时段内（未启用限制时为 true；仅影响进入，不影响离开） */
    private Boolean scanPopupEntryAllowedNow;
    /** 免冻结扫码进入授权房间 ID（来自 twin_card_mapping.freeze_exempt_room_ids，供前端按房间解锁） */
    private List<String> scanPopupExemptRoomIds;
    /** 学生违规通告（管理员下发）；无则 null */
    private ScanStudentViolationNoticeDTO studentViolationNotice;
    /** 未绑卡扫码提示（全局配置）；无则 null */
    private ScanStudentViolationNoticeDTO unboundCardNotice;
    /** 扫码弹窗公告（多条翻页）；无则 null */
    private ScanPopupAnnouncementBundleDTO scanPopupAnnouncements;
    /** 违规交互确认短语（直接透传，不经过子DTO序列化） */
    private String violationInteractiveChallenge;
    /** 自动签退计时器状态：PENDING_ACTIVATION / AUTO_EXIT_SCHEDULED；无计时器时为 null */
    private String autoSignoutState;
    /** 计划自动签退时刻 (yyyy-MM-dd HH:mm:ss)；无计时器时为 null */
    private String autoSignoutScheduledAt;
    /** 距离自动签退剩余秒数；无计时器或已到期时为 null */
    private Integer autoSignoutSecondsRemaining;
    /** 扫码延迟按钮总开关（与 scanner.delay.enabled 一致） */
    private Boolean scanDelayEnabled;
    /** 扫码弹窗公用「延迟」载体按钮文案 */
    private String scanDelayButtonLabel;
    /** 按房间 ID 分组的延迟二级菜单项 */
    private Map<String, List<Map<String, Object>>> scanDelayOptionsByRoom;
}
