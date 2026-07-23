package com.example.demo.modules.twin.dashboard.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.twin.dashboard.dto.CageStatusViolationDTO;
import com.example.demo.modules.twin.dashboard.entity.TwinCageStatusViolation;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.entity.TwinViolationRule;
import com.example.demo.modules.twin.dashboard.mapper.TwinCageStatusViolationMapper;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import com.example.demo.modules.twin.dashboard.service.CageStatusViolationCheckService;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import com.example.demo.modules.twin.dashboard.service.TwinViolationRuleService;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin/twin/cage-status-violations")
public class AdminCageStatusViolationController {

    private final TwinCageStatusViolationMapper mapper;
    private final TwinStudentViolationMapper violationMapper;
    private final TwinStudentViolationService violationService;
    private final CageStatusViolationCheckService checkService;
    private final TwinViolationRuleService ruleService;
    private final UserDisplayNameService userDisplayNameService;

    public AdminCageStatusViolationController(
            TwinCageStatusViolationMapper mapper,
            TwinStudentViolationMapper violationMapper,
            TwinStudentViolationService violationService,
            CageStatusViolationCheckService checkService,
            TwinViolationRuleService ruleService,
            UserDisplayNameService userDisplayNameService) {
        this.mapper = mapper;
        this.violationMapper = violationMapper;
        this.violationService = violationService;
        this.checkService = checkService;
        this.ruleService = ruleService;
        this.userDisplayNameService = userDisplayNameService;
    }

    /** 手动创建父记录（用于手动提交违规时关联笼位状态） */
    @PostMapping
    public Result<CageStatusViolationDTO> create(@RequestBody Map<String, Object> body) {
        TwinCageStatusViolation row = new TwinCageStatusViolation();
        Object ruleIdObj = body.get("ruleId");
        if (ruleIdObj instanceof Number) {
            row.setRuleId(((Number) ruleIdObj).longValue());
        }
        // ruleId 为空时回退到 MANUAL 默认规则，避免 DB NOT NULL 约束报错
        if (row.getRuleId() == null && ruleService != null) {
            TwinViolationRule manualRule = ruleService.getByCode("MANUAL");
            if (manualRule != null) {
                row.setRuleId(manualRule.getId());
            }
        }
        if (row.getRuleId() == null) {
            return Result.error("缺少 ruleId 且无 MANUAL 默认规则可用");
        }
        row.setStatusCode(objToStr(body.get("statusCode")));
        row.setPositionLabel(objToStr(body.get("positionLabel")));
        row.setProjectGroupName(objToStr(body.get("projectGroupName")));
        row.setProjectPiName(objToStr(body.get("projectPiName")));
        row.setCampusName(objToStr(body.get("campusName")));
        row.setRoomName(objToStr(body.get("roomName")));
        Object sId = body.get("cageShelveId");
        if (sId instanceof Number) row.setCageShelveId(((Number) sId).longValue());
        Object px = body.get("positionX");
        if (px instanceof Number) row.setPositionX(((Number) px).intValue());
        Object py = body.get("positionY");
        if (py instanceof Number) row.setPositionY(((Number) py).intValue());
        row.setTriggeredAt(LocalDateTime.now());
        row.setStatus("ACTIVE");
        mapper.insert(row);
        return Result.success(toDTO(row));
    }

    /** 父记录列表 */
    @GetMapping
    public Result<List<CageStatusViolationDTO>> list() {
        List<TwinCageStatusViolation> rows = mapper.selectAll();
        List<CageStatusViolationDTO> dtos = rows.stream().map(this::toDTO).collect(Collectors.toList());
        return Result.success(dtos);
    }

    /** 父记录详情（含子记录成员） */
    @GetMapping("/{id}")
    public Result<CageStatusViolationDTO> detail(@PathVariable long id) {
        TwinCageStatusViolation row = mapper.selectById(id);
        if (row == null) return Result.error("记录不存在");
        CageStatusViolationDTO dto = toDTO(row);
        dto.setMembers(loadMembers(id));
        return Result.success(dto);
    }

    /** 解除父记录及其所有子记录 */
    @PostMapping("/{id}/clear")
    public Result<?> clear(@PathVariable long id) {
        mapper.updateStatus(id, "CLEARED");
        List<TwinStudentViolation> children = violationMapper.selectByCageViolationId(id);
        for (TwinStudentViolation v : children) {
            if ("ACTIVE".equals(v.getStatus())) {
                violationService.clear(v.getId(), "system");
            }
        }
        return Result.success(null);
    }

    /** 删除父记录及其所有子记录 */
    @DeleteMapping("/{id}")
    public Result<?> delete(@PathVariable long id) {
        List<TwinStudentViolation> children = violationMapper.selectByCageViolationId(id);
        for (TwinStudentViolation v : children) {
            violationMapper.deleteById(v.getId());
        }
        mapper.deleteById(id);
        return Result.success(null);
    }

    /** 添加成员到父记录 */
    @PostMapping("/{id}/members")
    public Result<?> addMember(@PathVariable long id, @RequestBody Map<String, String> body) {
        String userId = body.get("userId");
        if (userId == null || userId.isBlank()) return Result.error("userId 不能为空");

        TwinCageStatusViolation parent = mapper.selectById(id);
        if (parent == null) return Result.error("父记录不存在");

        TwinViolationRule rule = ruleService.getById(parent.getRuleId());
        if (rule == null) return Result.error("关联规则不存在");

        try {
            TwinStudentViolation violation = violationService.create(
                    userId.trim(),
                    rule.getViolationTextTpl() != null ? rule.getViolationTextTpl() : "",
                    parseJsonArray(rule.getCageImageUrls()),
                    rule.getForbidEnter() != null && rule.getForbidEnter() == 1,
                    null,
                    rule.getShowNoticeEveryScan() != null && rule.getShowNoticeEveryScan() == 1,
                    rule.getExpireAfterDays(),
                    "admin",
                    "CAGE_STATUS",
                    rule.getInteractiveChallenge(),
                    rule.getInteractiveUnlockOnVerify() != null && rule.getInteractiveUnlockOnVerify() == 1,
                    rule.getId(),
                    id
            );
        } catch (Exception e) {
            return Result.error("创建失败: " + e.getMessage());
        }
        return Result.success(null);
    }

    /** 移除单个成员 */
    @DeleteMapping("/{id}/members/{userId}")
    public Result<?> removeMember(@PathVariable long id, @PathVariable String userId) {
        List<TwinStudentViolation> children = violationMapper.selectByCageViolationId(id);
        for (TwinStudentViolation v : children) {
            if (userId.equals(v.getTargetUserId())) {
                violationMapper.deleteById(v.getId());
            }
        }
        return Result.success(null);
    }

    /** 批量解除选中子记录 */
    @PostMapping("/{id}/members/batch-clear")
    public Result<?> batchClearMembers(@PathVariable long id, @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Integer> ids = (List<Integer>) body.get("violationIds");
        if (ids == null || ids.isEmpty()) return Result.error("violationIds 不能为空");
        int count = 0;
        for (Integer vid : ids) {
            if (vid != null && violationService.clear(vid.longValue(), "admin") && count >= 0) count++;
        }
        return Result.success(Map.of("cleared", count));
    }

    /** 批量删除选中子记录 */
    @PostMapping("/{id}/members/batch-delete")
    public Result<?> batchDeleteMembers(@PathVariable long id, @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Integer> ids = (List<Integer>) body.get("violationIds");
        if (ids == null || ids.isEmpty()) return Result.error("violationIds 不能为空");
        int count = 0;
        for (Integer vid : ids) {
            if (vid != null) {
                violationMapper.deleteById(vid.longValue());
                count++;
            }
        }
        return Result.success(Map.of("deleted", count));
    }

    /** 手动触发指定规则 */
    @PostMapping("/trigger/{ruleId}")
    public Result<?> manualTrigger(@PathVariable long ruleId) {
        TwinViolationRule rule = ruleService.getById(ruleId);
        if (rule == null) return Result.error("规则不存在");
        int triggered = checkService.processRule(rule, null);
        return Result.success(Map.of("triggered", triggered));
    }

    // ── helpers ──

    private CageStatusViolationDTO toDTO(TwinCageStatusViolation row) {
        CageStatusViolationDTO dto = new CageStatusViolationDTO();
        dto.setId(row.getId());
        dto.setRuleId(row.getRuleId());
        dto.setScanBatchId(row.getScanBatchId());
        dto.setStatusCode(row.getStatusCode());
        dto.setCageShelveId(row.getCageShelveId());
        dto.setPositionX(row.getPositionX());
        dto.setPositionY(row.getPositionY());
        dto.setPositionLabel(row.getPositionLabel());
        dto.setCageBoxQrCode(row.getCageBoxQrCode());
        dto.setProjectPiName(row.getProjectPiName());
        dto.setProjectGroupName(row.getProjectGroupName());
        dto.setDepartmentName(row.getDepartmentName());
        dto.setRoomName(row.getRoomName());
        dto.setCampusName(row.getCampusName());
        dto.setTriggeredAt(row.getTriggeredAt());
        dto.setStatus(row.getStatus());
        return dto;
    }

    private List<CageStatusViolationDTO.MemberViolationDTO> loadMembers(long parentId) {
        List<TwinStudentViolation> children = violationMapper.selectByCageViolationId(parentId);
        // 批量解析中文姓名
        Set<String> userIds = new HashSet<>();
        for (TwinStudentViolation v : children) {
            if (v.getTargetUserId() != null) userIds.add(v.getTargetUserId().trim());
        }
        Map<String, String> displayNames = userDisplayNameService.resolveDisplayNames(userIds);
        return children.stream().map(v -> {
            CageStatusViolationDTO.MemberViolationDTO m = new CageStatusViolationDTO.MemberViolationDTO();
            m.setViolationId(v.getId());
            m.setUserId(v.getTargetUserId());
            String tid = v.getTargetUserId() != null ? v.getTargetUserId().trim() : "";
            m.setDisplayName(displayNames.getOrDefault(tid, tid));
            m.setStatus(v.getStatus());
            m.setCreatedAt(v.getCreatedAt());
            return m;
        }).collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private static List<String> parseJsonArray(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return com.alibaba.fastjson2.JSON.parseArray(json, String.class);
        } catch (Exception e) {
            return List.of();
        }
    }

    private static String objToStr(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }
}
