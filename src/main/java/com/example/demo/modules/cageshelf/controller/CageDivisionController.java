package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.cageshelf.entity.CageDivision;
import com.example.demo.modules.cageshelf.service.CageDivisionService;
import com.example.demo.modules.identity.service.PersonIdentityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 笼位划分：把 type2（已预约无笼盒）笼位预分给本课题组某人。
 * 写操作限「课题组管家」身份（SUPER_ADMIN 放行）；查询登录即可。
 */
@RestController
@RequestMapping("/api/cage-division")
@Tag(name = "笼位划分")
public class CageDivisionController {

    private final AuthContextService authContextService;
    private final UserDisplayNameService userDisplayNameService;
    private final PersonIdentityService personIdentityService;
    private final CageDivisionService divisionService;

    public CageDivisionController(AuthContextService authContextService,
                                  UserDisplayNameService userDisplayNameService,
                                  PersonIdentityService personIdentityService,
                                  CageDivisionService divisionService) {
        this.authContextService = authContextService;
        this.userDisplayNameService = userDisplayNameService;
        this.personIdentityService = personIdentityService;
        this.divisionService = divisionService;
    }

    @GetMapping("/by-cages")
    @Operation(summary = "按笼位 ID 批量查划分名单")
    public Result<List<Map<String, Object>>> byCages(@RequestParam("ids") String ids,
                                                     HttpServletRequest request) {
        if (authContextService.resolveUserFromBearer(request.getHeader("Authorization")) == null) {
            return Result.fail(401, "未登录");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<Long, List<CageDivision>> e : divisionService.rowsByCages(parseIds(ids)).entrySet()) {
            for (CageDivision d : e.getValue()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("animalCageId", e.getKey());
                m.put("assigneeId", d.getAssigneeId());
                m.put("assigneeName", d.getAssigneeName());
                out.add(m);
            }
        }
        return Result.success(out);
    }

    /** body: { animalCageIds: [], assignees: [{id, name}], groupName? } —— 全量覆盖这批笼位的名单。 */
    @PostMapping("/save")
    @Operation(summary = "保存划分（全量覆盖）")
    public Result<?> save(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        if (!canDivide(u)) return Result.fail(403, "只有课题组管家可以划分笼位");

        List<Long> cageIds = parseIds(body.get("animalCageIds"));
        if (cageIds.isEmpty()) return Result.fail(400, "请先选择笼位");

        List<CageDivisionService.AssigneeRef> assignees = new ArrayList<>();
        if (body.get("assignees") instanceof List<?> list) {
            for (Object item : list) {
                if (!(item instanceof Map<?, ?> raw)) continue;
                String id = asStr(raw.get("id"));
                if (id == null) continue;
                assignees.add(new CageDivisionService.AssigneeRef(id, asStr(raw.get("name"))));
            }
        }

        int written = divisionService.replaceBatch(cageIds, assignees,
                u.getId(), operatorDisplayName(u), asStr(body.get("groupName")));
        return Result.success(Map.of("ok", true, "cages", cageIds.size(), "written", written));
    }

    /** body: { animalCageIds: [], assigneeIds?: [] } —— 不传 assigneeIds 即清空这批笼位的全部划分。 */
    @PostMapping("/clear")
    @Operation(summary = "撤销划分")
    public Result<?> clear(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        if (!canDivide(u)) return Result.fail(403, "只有课题组管家可以撤销划分");

        List<Long> cageIds = parseIds(body.get("animalCageIds"));
        if (cageIds.isEmpty()) return Result.fail(400, "请先选择笼位");

        List<String> assigneeIds = new ArrayList<>();
        if (body.get("assigneeIds") instanceof List<?> list) {
            for (Object item : list) {
                String s = asStr(item);
                if (s != null) assigneeIds.add(s);
            }
        }
        int deleted = divisionService.clearBatch(cageIds, assigneeIds);
        return Result.success(Map.of("ok", true, "deleted", deleted));
    }

    private boolean canDivide(User u) {
        if (u == null) return false;
        if (u.getRole() != null && u.getRole().getLevel() >= RoleEnum.SUPER_ADMIN.getLevel()) return true;
        return personIdentityService.isGroupSteward(u.getId());
    }

    private String operatorDisplayName(User user) {
        if (user == null || user.getId() == null) return "unknown";
        String name = userDisplayNameService.resolveDisplayName(user.getId());
        return (name != null && !name.isBlank()) ? name : user.getId();
    }

    /** 兼容 "1,2,3" 字符串与 [1,2,3] 数组两种入参。 */
    private static List<Long> parseIds(Object raw) {
        List<Long> out = new ArrayList<>();
        if (raw instanceof String s) {
            for (String part : s.split(",")) {
                Long v = toLong(part);
                if (v != null) out.add(v);
            }
        } else if (raw instanceof List<?> list) {
            for (Object item : list) {
                Long v = toLong(item);
                if (v != null) out.add(v);
            }
        }
        return out;
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        try {
            return Long.valueOf(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String asStr(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
