package com.example.demo.modules.analytics.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.analytics.service.StudentActivityService;
import com.example.demo.modules.analytics.service.StudentActivitySnapshotService;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;

@RestController
@RequestMapping("/api/v1/analytics/student-activity")
@Tag(name = "学生活跃度统计", description = "课题组维度成员活跃度报表")
public class StudentActivityController {

    private final AuthContextService authContextService;
    private final StudentActivityService studentActivityService;
    private final StudentActivitySnapshotService snapshotService;
    private final AroPersonnelMapper aroPersonnelMapper;

    public StudentActivityController(AuthContextService authContextService,
                                     StudentActivityService studentActivityService,
                                     StudentActivitySnapshotService snapshotService,
                                     AroPersonnelMapper aroPersonnelMapper) {
        this.authContextService = authContextService;
        this.studentActivityService = studentActivityService;
        this.snapshotService = snapshotService;
        this.aroPersonnelMapper = aroPersonnelMapper;
    }

    /**
     * 解析用户并返回。学生角色自动解析课题组名（用于自动限定查询范围）。
     * @return User 或 null（已通过 Result.error 处理）
     */
    private User resolveUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return null;
        return user;
    }

    /** 若为学生角色，自动解析其课题组名覆盖传入的 groupName */
    private String resolveGroupForStudent(User user, String requestedGroup) {
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() >= RoleEnum.STAFF.getLevel()) {
            return requestedGroup; // 教职工可直接指定课题组
        }
        // 学生：自动从 ARO 解析课题组名
        try {
            AroPersonnel personnel = aroPersonnelMapper.findByUserId(user.getId());
            if (personnel != null) {
                String resolved = personnel.getResolvedProjectGroupNames();
                if (resolved != null && !resolved.isBlank()) return resolved;
            }
        } catch (Exception ignored) { /* fall through */ }
        return requestedGroup; // 解析失败则保持原值（前端会显示空态）
    }

    @GetMapping("/groups")
    @Operation(summary = "课题组分页列表（教职工可指定关键词，学生自动限定本组）")
    public Result<Map<String, Object>> listGroups(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String keyword,
            @RequestParam String startTime,
            @RequestParam String endTime,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "1") int size,
            @RequestParam(defaultValue = "all") String campus) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        // 学生：自动用课题组名作为 keyword，只返回自己的组
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            try {
                AroPersonnel p = aroPersonnelMapper.findByUserId(user.getId());
                if (p != null) {
                    String gn = p.getResolvedProjectGroupNames();
                    if (gn != null && !gn.isBlank()) keyword = gn;
                }
            } catch (Exception ignored) { /* fall through */ }
        }
        return Result.success(studentActivityService.listGroupsPaged(keyword, startTime, endTime, page, size, campus));
    }

    @GetMapping("/members")
    @Operation(summary = "成员活跃度分页查询")
    public Result<Map<String, Object>> members(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam String groupName,
            @RequestParam String startTime,
            @RequestParam String endTime,
            @RequestParam(defaultValue = "entries") String sortBy,
            @RequestParam(defaultValue = "desc") String order,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        groupName = resolveGroupForStudent(user, groupName);
        Map<String, Object> data = studentActivityService.queryMemberActivity(
                groupName, startTime, endTime, sortBy, order, page, size);
        return Result.success(data);
    }

    @GetMapping("/heatmap")
    @Operation(summary = "时段热力图数据")
    public Result<List<Map<String, Object>>> heatmap(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam String groupName,
            @RequestParam String startTime,
            @RequestParam String endTime) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        groupName = resolveGroupForStudent(user, groupName);
        return Result.success(studentActivityService.heatmap(groupName, startTime, endTime));
    }

    @GetMapping("/daily-trend")
    @Operation(summary = "日趋势数据")
    public Result<List<Map<String, Object>>> dailyTrend(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam String groupName,
            @RequestParam String startTime,
            @RequestParam String endTime) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        groupName = resolveGroupForStudent(user, groupName);
        return Result.success(studentActivityService.dailyTrend(groupName, startTime, endTime));
    }

    @GetMapping("/room-usage")
    @Operation(summary = "课题组房间进出频次排行")
    public Result<List<Map<String, Object>>> roomUsage(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam String groupName,
            @RequestParam String startTime,
            @RequestParam String endTime) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        groupName = resolveGroupForStudent(user, groupName);
        return Result.success(studentActivityService.roomUsage(groupName, startTime, endTime));
    }

    @GetMapping("/summary")
    @Operation(summary = "课题组活跃度 KPI 汇总")
    public Result<Map<String, Object>> summary(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam String groupName,
            @RequestParam String startTime,
            @RequestParam String endTime,
            @RequestParam(defaultValue = "all") String campus) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        groupName = resolveGroupForStudent(user, groupName);
        return Result.success(studentActivityService.summary(groupName, startTime, endTime, campus));
    }

    @PostMapping("/recalculate")
    @Operation(summary = "强制全量重算学生活跃度快照（仅教职工）")
    public Result<Map<String, Object>> recalculate(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(defaultValue = "30") int daysBack) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return Result.error("需要教职工及以上权限");
        }
        try {
            LocalDate to = LocalDate.now().minusDays(1);
            LocalDate from = to.minusDays(daysBack - 1);
            snapshotService.recomputeRange(from, to);
            Map<String, Object> msg = new HashMap<>();
            msg.put("message", "全量重算已触发");
            msg.put("from", from.toString());
            msg.put("to", to.toString());
            return Result.success(msg);
        } catch (Exception e) {
            return Result.error("重算失败: " + e.getMessage());
        }
    }
}
