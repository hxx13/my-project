package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.service.CageInfoValueService;
import com.example.demo.modules.cageshelf.service.CageOperationService;
import com.example.demo.modules.student.service.StudentCageShelfService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 笼位级表单值（关键信息）读写 — /api/admin/cage-info/values。
 * 表单是固定信息模板，值挂笼位，与认领无关。
 */
@RestController
@RequestMapping("/api/admin/cage-info/values")
@Tag(name = "笼位表单值")
public class CageInfoValueController {

    private static final Logger log = LoggerFactory.getLogger(CageInfoValueController.class);

    private final AuthContextService authContextService;
    private final CageInfoValueService infoValueService;
    private final StudentCageShelfService studentCageShelfService;
    private final CageCellDetailMapper detailMapper;
    private final CageOperationService operationService;

    public CageInfoValueController(AuthContextService authContextService,
                                   CageInfoValueService infoValueService,
                                   StudentCageShelfService studentCageShelfService,
                                   CageCellDetailMapper detailMapper,
                                   CageOperationService operationService) {
        this.authContextService = authContextService;
        this.infoValueService = infoValueService;
        this.studentCageShelfService = studentCageShelfService;
        this.detailMapper = detailMapper;
        this.operationService = operationService;
    }

    private User resolveUser(HttpServletRequest req) {
        User u = authContextService.resolveUserFromBearer(req.getHeader("Authorization"));
        if (u == null) return null;
        if (u.getRole() == null) u.setRole(RoleEnum.MEMBER);
        return u;
    }

    /** 读权限 = 任意登录用户（MEMBER+），不加身份标识判定；笼位可见性由上层网格/详情脱敏控制。 */
    private Result<?> requireMember(User u) {
        if (u == null) return Result.error("未登录");
        if (u.getStatus() != null && u.getStatus() == 0) return Result.error("账号已禁用");
        return null;
    }

    @GetMapping("/{animalCageId}")
    @Operation(summary = "读某笼位的表单值（字段字典 + 实例值，MEMBER 可读，非 admin 按课题组脱敏）")
    public Result<List<Map<String, Object>>> getInfo(@PathVariable Long animalCageId, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireMember(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(maskValuesForUser(u, animalCageId, infoValueService.getInfo(animalCageId)));
    }

    /** 非 admin 按课题组脱敏：复用 maskDetailForUser 判定可见性，不可见时对敏感字段置 *** / 空。 */
    private List<Map<String, Object>> maskValuesForUser(User u, Long animalCageId, List<Map<String, Object>> values) {
        if (u == null || values == null || values.isEmpty()) return values;
        if (u.getRole() != null && u.getRole().getLevel() >= RoleEnum.ADMIN.getLevel()) return values;
        CageCellDetail detail = detailMapper.selectByAnimalCageId(animalCageId);
        if (detail == null) return values;
        studentCageShelfService.maskDetailForUser(u, detail);
        boolean visible = !"***".equals(detail.getProjectPiName());
        if (visible) return values;
        Map<String, String> mask = Map.of(
                "project_pi_name", "***", "project_name", "***",
                "department_name", "***", "aup_number", "", "experimenter_name", "***",
                "lab_assistant_name", "***", "experiment_desc", "", "images_json", "[]");
        for (Map<String, Object> row : values) {
            Object canonical = row.get("canonical");
            if (canonical != null && mask.containsKey(String.valueOf(canonical))) {
                row.put("value", mask.get(String.valueOf(canonical)));
            }
        }
        return values;
    }

    @PutMapping("/{animalCageId}")
    @Operation(summary = "写某笼位的表单值")
    public Result<List<Map<String, Object>>> updateInfo(@PathVariable Long animalCageId,
                                                        @RequestBody Map<String, Object> body,
                                                        HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireMember(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        // 编辑权限与分笼/转移同源：管理员+ / 额外操作身份 / 该笼位认领人或实验员本人
        Map<String, Object> editInfo = operationService.cageEditInfo(u, animalCageId);
        if (!Boolean.TRUE.equals(editInfo.get("editable"))) {
            return Result.fail(403, String.valueOf(editInfo.get("reason")));
        }
        try {
            Object raw = body == null ? null : body.get("values");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> entries = raw instanceof List<?> list
                ? list.stream().filter(e -> e instanceof Map).map(e -> (Map<String, Object>) e).toList()
                : List.of();
            return Result.success(infoValueService.updateInfo(animalCageId, entries, u.getId()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> Result<T> handleServiceException(Exception e) {
        if (e instanceof com.example.demo.common.exception.TwinBusinessException be) {
            return (Result<T>) Result.fail(be.getCode(), be.getMessage());
        }
        log.warn("[cage-info-value] 操作失败: {}", e.getMessage(), e);
        return (Result<T>) Result.error(e.getMessage());
    }
}
