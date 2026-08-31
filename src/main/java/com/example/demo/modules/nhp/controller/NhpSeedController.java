package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.nhp.service.NhpPermissionService;
import com.example.demo.modules.nhp.service.NhpSeedService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** NHP 种子数据手动触发（幂等）。仅平台所有者。 */
@RestController
@RequestMapping("/api/nhp")
@Tag(name = "NHP 种子数据", description = "配置表 + 码表 + 联动 幂等灌入")
public class NhpSeedController {

    private final NhpSeedService seedService;
    private final AuthContextService authContextService;
    private final NhpPermissionService permissionService;

    public NhpSeedController(NhpSeedService seedService,
                             AuthContextService authContextService,
                             NhpPermissionService permissionService) {
        this.seedService = seedService;
        this.authContextService = authContextService;
        this.permissionService = permissionService;
    }

    private void requirePlatformOwner(String auth) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) {
            throw new TwinBusinessException(401, "未登录或 Token 无效");
        }
        if (!permissionService.isPlatformOwner(user)) {
            throw new TwinBusinessException(403, "无权限：需平台所有者");
        }
    }

    @PostMapping("/seed")
    @Operation(summary = "执行种子数据（幂等，重复调用无副作用）")
    public Result<Map<String, Integer>> seed(@RequestHeader(value = "Authorization", required = false) String auth) {
        requirePlatformOwner(auth);
        return Result.success(seedService.seedAll());
    }

    @PostMapping("/seed/pig-dictionary")
    @Operation(summary = "重导入内置猪字段字典（同步/冻结种子字段、按字段重建 D1–D10 大纲、清理误种 DD* 原子）")
    public Result<Map<String, Object>> reimportPigDictionary(@RequestHeader(value = "Authorization", required = false) String auth) {
        requirePlatformOwner(auth);
        return Result.success(seedService.reimportPigDictionary());
    }

    @PostMapping("/seed/atoms")
    @Operation(summary = "导入内置原子种子（nhp-atoms.json：套/字段/45 域原子 DRAFT + 题目模板；幂等补缺失）")
    public Result<Map<String, Integer>> seedAtoms(@RequestHeader(value = "Authorization", required = false) String auth) {
        requirePlatformOwner(auth);
        Map<String, Integer> stat = new java.util.LinkedHashMap<>();
        stat.put("atoms", seedService.seedAtomsFromPriorityJson());
        return Result.success(stat);
    }

    @PostMapping("/seed/composite")
    @Operation(summary = "导入内置组合模板 nhp-crf（钉住全部原子并发布；幂等补缺失结构）")
    public Result<Map<String, Integer>> seedComposite(@RequestHeader(value = "Authorization", required = false) String auth) {
        requirePlatformOwner(auth);
        Map<String, Integer> stat = new java.util.LinkedHashMap<>();
        stat.put("composite", seedService.seedCompositeTemplate());
        return Result.success(stat);
    }
}
