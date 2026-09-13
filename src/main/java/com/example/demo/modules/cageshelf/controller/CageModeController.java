package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageModeVisibilityService;
import com.example.demo.modules.cageshelf.service.CageRegionCapabilityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 笼架模式可见性：给三端下发「当前用户可见的模式列表」。
 * 后端一次性算好身份判断，避免 Web/H5/小程序各自拉配置 + 各自算身份导致三套逻辑漂移。
 */
@RestController
@RequestMapping("/api/cage-mode")
@Tag(name = "笼架模式可见性")
public class CageModeController {

    private final AuthContextService authContextService;
    private final CageModeVisibilityService visibilityService;
    private final CageRegionCapabilityService regionCapabilityService;

    public CageModeController(AuthContextService authContextService,
                              CageModeVisibilityService visibilityService,
                              CageRegionCapabilityService regionCapabilityService) {
        this.authContextService = authContextService;
        this.visibilityService = visibilityService;
        this.regionCapabilityService = regionCapabilityService;
    }

    @GetMapping("/visible")
    @Operation(summary = "当前用户可见的笼架模式列表（按视角）；带 roomId/floorId/campusId 时学生模式按该区域算")
    public Result<Map<String, Object>> visible(@RequestParam(required = false) String roomId,
                                               @RequestParam(required = false) String floorId,
                                               @RequestParam(required = false) String campusId,
                                               HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        if (u.getRole() == null) u.setRole(RoleEnum.MEMBER);

        boolean student = visibilityService.isStudent(u);
        Map<String, Object> out = new LinkedHashMap<>();
        if (student) {
            // 学生视角：查看 / 申请预约 / 划分 / 确认 / 状态。
            // 三个模式（申请预约、划分、确认）改由**该区域负责的饲养组长**配——区域级学生能力，
            // 取该学生课题组笼位所在各区域所开能力的并集（详见 CageRegionCapabilityService）。
            List<String> modes = new ArrayList<>();
            modes.add("view");
            // 学生模式入口**按当前房间**算：A 房关掉的模式不该在 B 房生效，
            // 也不该因为 B 房开着就让人从 A 房进去（否则点进去才被按笼位门禁拒，两套口径）。
            modes.addAll(regionCapabilityService.studentModesForRegion(u, roomId, floorId, campusId));
            // 「划分」另有一条并行路径：管家（GROUP_STEWARD）用的是**教职工**那个划分模式，
            // 与区域配置无关——矩阵里把「划分」拆成两个能力码正是为了让两者互不影响。
            if (!modes.contains("division") && visibilityService.canUseMode(u, "division")) {
                modes.add("division");
            }
            // 状态模式：动作清单 = 矩阵允许（cage.student.edit.*）**且**该学生的区域开着。
            // 与上面三个模式同口径 —— 否则组长把「合笼」在本区关掉后，学生仍看到「状态」入口，
            // 点进去才被笼位门禁拒（入口与门禁两套口径）。一个动作都不剩就不发入口。
            List<String> editActions = visibilityService.studentEditActionCodes(u).stream()
                    .filter(a -> regionCapabilityService.studentCapabilityVisible(u,
                            CageModeVisibilityService.studentEditCapability(a), roomId, floorId, campusId))
                    .toList();
            if (!editActions.isEmpty()) {
                modes.add("edit");
                out.put("modeActions", Map.of("edit", editActions));
            }
            out.put("modes", modes);
        } else {
            out.put("modes", visibilityService.visibleStaffModes(u));
        }
        out.put("isStudent", student);
        out.put("isSuperAdmin", visibilityService.isSuperAdmin(u));
        return Result.success(out);
    }
}
