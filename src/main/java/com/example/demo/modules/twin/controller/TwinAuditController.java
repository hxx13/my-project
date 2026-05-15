package com.example.demo.modules.twin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.accessrule.service.AccessRuleDispatchHintHelper;
import com.example.demo.modules.accessrule.service.AccessRuleDispatchResult;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.entity.TwinCardMapping;
import com.example.demo.modules.twin.service.DahuaSwingRuleEngineService;
import com.example.demo.modules.twin.service.TwinCardMappingService;
import com.example.demo.modules.twin.service.TwinAuditService;
import com.example.demo.modules.twin.service.TwinScanService;
import com.example.demo.modules.twin.service.WebScanExitDahuaLinkageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/twin/audit")
@Tag(name = "孪生审核", description = "在馆人员与卡控审核聚合")
public class TwinAuditController {
    private static final Logger log = LoggerFactory.getLogger(TwinAuditController.class);

    private final AuthContextService authContextService;
    private final TwinAuditService twinAuditService;
    private final AroService aroService;
    private final DahuaSwingRuleEngineService dahuaSwingRuleEngineService;
    private final TwinScanService twinScanService;
    private final TwinCardMappingService twinCardMappingService;
    private final WebScanExitDahuaLinkageService webScanExitDahuaLinkageService;

    public TwinAuditController(
            AuthContextService authContextService,
            TwinAuditService twinAuditService,
            AroService aroService,
            DahuaSwingRuleEngineService dahuaSwingRuleEngineService,
            TwinScanService twinScanService,
            TwinCardMappingService twinCardMappingService,
            WebScanExitDahuaLinkageService webScanExitDahuaLinkageService) {
        this.authContextService = authContextService;
        this.twinAuditService = twinAuditService;
        this.aroService = aroService;
        this.dahuaSwingRuleEngineService = dahuaSwingRuleEngineService;
        this.twinScanService = twinScanService;
        this.twinCardMappingService = twinCardMappingService;
        this.webScanExitDahuaLinkageService = webScanExitDahuaLinkageService;
    }

    @GetMapping("/pending-by-floor")
    @Operation(summary = "按校区楼层聚合今日在馆人员及卡映射")
    public Result<?> pendingByFloor(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireSenior(user);
        if (denied != null) {
            return denied;
        }
        Map<String, Object> data = twinAuditService.buildPendingByFloor();
        return Result.success(data);
    }

    @PostMapping("/manual-exit")
    @Operation(summary = "审核页手动确认离开（官方接口直连）")
    public Result<?> manualExit(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> payload) {
        User operator = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireSenior(operator);
        if (denied != null) {
            return denied;
        }

        String userId = payload.get("userId") != null ? String.valueOf(payload.get("userId")).trim() : "";
        String roomId = payload.get("roomId") != null ? String.valueOf(payload.get("roomId")).trim() : "";
        String roomName = payload.get("roomName") != null ? String.valueOf(payload.get("roomName")).trim() : "";
        String userName = payload.get("userName") != null ? String.valueOf(payload.get("userName")).trim() : "";
        if (userId.isEmpty()) {
            return Result.error("缺少 userId");
        }

        // 关键：用官方 noLeaveRoom 结果反解 officialRoomId，避免把本地 room_config.id 误传给官方接口。
        String officialRoomId = resolveOfficialRoomIdFromAro(userId, roomId, roomName);
        if (officialRoomId == null || officialRoomId.isBlank()) {
            log.warn("[twin] audit manual-exit resolve official room failed operator={} userId={} roomId={} roomName={}",
                    operator.getId(), userId, roomId, roomName);
            return Result.error("未能定位官方房间ID，请刷新后重试");
        }

        TwinCardMapping mapping = twinCardMappingService.getByAroUserId(userId);
        String dahuaSeq = mapping != null ? mapping.getDahuaSeq() : null;
        String physicalCardNo = mapping != null ? mapping.getCardNo() : null;

        // 对齐 web 扫码离开：ARO 登记 + 流水异步同步
        boolean ok = twinScanService.executeAccessAction(userId, officialRoomId, 2, false, false, dahuaSeq, false);
        if (!ok) {
            log.warn("[twin] audit manual-exit rejected by aro operator={} userId={} officialRoomId={} roomName={}",
                    operator.getId(), userId, officialRoomId, roomName);
            return Result.error("离开登记失败，官方系统拒绝操作");
        }
        // 对齐 web 扫码离开：规则命中后执行大华权限回收
        int defer = webScanExitDahuaLinkageService.resolveDeferSeconds();
        AccessRuleDispatchResult dispatchResult = webScanExitDahuaLinkageService.revokeAndFreezeAfterExit(
                userId, officialRoomId, physicalCardNo, false, defer);
        // 文档约束：所有离开成功入口必须清理联动状态，避免后续定时任务重复签退
        dahuaSwingRuleEngineService.clearActivationStatesForUser(userId);
        log.info("[twin] audit manual-exit success operator={} userId={} officialRoomId={} roomId={} roomName={} userName={}",
                operator.getId(), userId, officialRoomId, roomId, roomName, userName);
        Map<String, Object> resp = new HashMap<>();
        resp.put("success", true);
        resp.put("message", defer > 0 ? ("已确认其离开；大华回收与卡冻结将在 " + defer + " 秒后执行") : "已确认其离开");
        resp.put("officialRoomId", officialRoomId);
        resp.put("dispatchResult", dispatchResult != null ? dispatchResult.name() : null);
        resp.put("dahuaHint", AccessRuleDispatchHintHelper.humanHint(dispatchResult, 2));
        return Result.success(resp);
    }

    private String resolveOfficialRoomIdFromAro(String userId, String localRoomId, String roomName) {
        List<Map<String, Object>> noLeaveRooms = aroService.getNoLeaveRoom(userId);
        if (noLeaveRooms == null || noLeaveRooms.isEmpty()) {
            return null;
        }
        // 1) 先尝试 payload 里的 roomId（如果本身就是官方ID）
        if (localRoomId != null && !localRoomId.isBlank()) {
            for (Map<String, Object> r : noLeaveRooms) {
                String id = r.get("id") != null ? String.valueOf(r.get("id")).trim() : "";
                if (localRoomId.equals(id)) {
                    return id;
                }
            }
        }
        // 2) 按房间名匹配（审核页常见）
        if (roomName != null && !roomName.isBlank()) {
            for (Map<String, Object> r : noLeaveRooms) {
                String name = r.get("name") != null ? String.valueOf(r.get("name")).trim() : "";
                if (roomName.equals(name) || normalizeRoomName(roomName).equals(normalizeRoomName(name))) {
                    return r.get("id") != null ? String.valueOf(r.get("id")).trim() : null;
                }
            }
        }
        // 3) 兜底：仅当唯一待离开房间时直接采用
        if (noLeaveRooms.size() == 1) {
            Object idObj = noLeaveRooms.get(0).get("id");
            return idObj != null ? String.valueOf(idObj).trim() : null;
        }
        return null;
    }

    private String normalizeRoomName(String name) {
        if (name == null) {
            return "";
        }
        String s = name.trim();
        int idx = s.indexOf('-');
        if (idx >= 0 && idx + 1 < s.length()) {
            s = s.substring(idx + 1).trim();
        }
        return s.replaceAll("\\s+", "").toUpperCase();
    }

    private Result<?> requireSenior(User user) {
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.SENIOR.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
