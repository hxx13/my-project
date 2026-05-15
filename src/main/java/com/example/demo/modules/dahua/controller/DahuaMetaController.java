package com.example.demo.modules.dahua.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.dahua.service.DahuaDepartmentCacheService;
import com.example.demo.modules.dahua.service.DahuaDeviceChannelCacheService;
import com.example.demo.modules.dahua.service.DahuaDeviceChannelRemarkCategoryService;
import com.example.demo.modules.dahua.service.DahuaDoorGroupCacheService;
import com.example.demo.modules.twin.service.JobExecutionRegistry;
import com.example.demo.modules.twin.service.JobSchedulerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/dahua/meta")
@CrossOrigin("*")
@Tag(name = "大华主数据", description = "部门、门组与设备通道缓存接口")
public class DahuaMetaController {
    private final DahuaDepartmentCacheService departmentCacheService;
    private final DahuaDoorGroupCacheService doorGroupCacheService;
    private final DahuaDeviceChannelCacheService deviceChannelCacheService;
    private final DahuaDeviceChannelRemarkCategoryService deviceChannelRemarkCategoryService;
    private final AuthContextService authContextService;
    private final JobSchedulerService jobSchedulerService;

    public DahuaMetaController(DahuaDepartmentCacheService departmentCacheService,
                               DahuaDoorGroupCacheService doorGroupCacheService,
                               DahuaDeviceChannelCacheService deviceChannelCacheService,
                               DahuaDeviceChannelRemarkCategoryService deviceChannelRemarkCategoryService,
                               AuthContextService authContextService,
                               JobSchedulerService jobSchedulerService) {
        this.departmentCacheService = departmentCacheService;
        this.doorGroupCacheService = doorGroupCacheService;
        this.deviceChannelCacheService = deviceChannelCacheService;
        this.deviceChannelRemarkCategoryService = deviceChannelRemarkCategoryService;
        this.authContextService = authContextService;
        this.jobSchedulerService = jobSchedulerService;
    }

    @PostMapping("/departments/refresh")
    @Operation(summary = "刷新部门缓存")
    public Result<?> refreshDepartments(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        jobSchedulerService.runManual(JobExecutionRegistry.JOB_DH_DEPT_REFRESH, "manual-api");
        return Result.success("部门缓存刷新已触发");
    }

    @GetMapping("/departments")
    @Operation(summary = "分页查询部门缓存")
    public Result<?> listDepartments(@RequestHeader(value = "Authorization", required = false) String authorization,
                                     @RequestParam(defaultValue = "1") int page,
                                     @RequestParam(defaultValue = "50") int pageSize,
                                     @RequestParam(required = false) String keyword) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(departmentCacheService.list(keyword, page, pageSize));
    }

    @PostMapping("/door-groups/refresh")
    @Operation(summary = "刷新门组缓存")
    public Result<?> refreshDoorGroups(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        jobSchedulerService.runManual(JobExecutionRegistry.JOB_DH_GROUP_REFRESH, "manual-api");
        return Result.success("门组缓存刷新已触发");
    }

    @GetMapping("/door-groups")
    @Operation(summary = "分页查询门组缓存")
    public Result<?> listDoorGroups(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "50") int pageSize,
                                    @RequestParam(required = false) String keyword) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(doorGroupCacheService.list(keyword, page, pageSize));
    }

    @PostMapping("/device-channels/refresh")
    @Operation(summary = "刷新设备通道缓存（大类8、小类1）")
    public Result<?> refreshDeviceChannels(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        jobSchedulerService.runManual(JobExecutionRegistry.JOB_DH_CHANNEL_REFRESH, "manual-api");
        return Result.success("通道缓存刷新已触发");
    }

    @GetMapping("/device-channels")
    @Operation(summary = "分页查询设备通道缓存")
    public Result<?> listDeviceChannels(@RequestHeader(value = "Authorization", required = false) String authorization,
                                        @RequestParam(defaultValue = "1") int page,
                                        @RequestParam(defaultValue = "50") int pageSize,
                                        @RequestParam(required = false) String keyword,
                                        @RequestParam(required = false) String channelType,
                                        @RequestParam(required = false) String ownerCode,
                                        @RequestParam(required = false) Integer unitType,
                                        @RequestParam(required = false) Long remarkCategoryId,
                                        @RequestParam(defaultValue = "false") boolean unassignedOnly) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(deviceChannelCacheService.list(keyword, channelType, ownerCode, unitType,
                remarkCategoryId, unassignedOnly, page, pageSize));
    }

    @GetMapping("/device-channels/remark-categories")
    @Operation(summary = "通道备注分类列表")
    public Result<?> listRemarkCategories(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(deviceChannelRemarkCategoryService.listAll());
    }

    @PostMapping("/device-channels/remark-categories")
    @Operation(summary = "新增通道备注分类")
    public Result<?> createRemarkCategory(@RequestHeader(value = "Authorization", required = false) String authorization,
                                          @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            String name = body.get("name") == null ? "" : String.valueOf(body.get("name"));
            Integer sortOrder = parseIntegerOrNull(body.get("sortOrder"));
            return Result.success(deviceChannelRemarkCategoryService.create(name, sortOrder));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() != null ? ex.getMessage() : "新增失败");
        }
    }

    @PutMapping("/device-channels/remark-categories/{id}")
    @Operation(summary = "修改通道备注分类")
    public Result<?> updateRemarkCategoryCfg(@RequestHeader(value = "Authorization", required = false) String authorization,
                                               @PathVariable long id,
                                               @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            String name = body.get("name") == null ? "" : String.valueOf(body.get("name"));
            Integer sortOrder = parseIntegerOrNull(body.get("sortOrder"));
            deviceChannelRemarkCategoryService.update(id, name, sortOrder);
            return Result.success();
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() != null ? ex.getMessage() : "保存失败");
        }
    }

    @DeleteMapping("/device-channels/remark-categories/{id}")
    @Operation(summary = "删除通道备注分类")
    public Result<?> deleteRemarkCategoryCfg(@RequestHeader(value = "Authorization", required = false) String authorization,
                                              @PathVariable long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            deviceChannelRemarkCategoryService.delete(id);
            return Result.success();
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() != null ? ex.getMessage() : "删除失败");
        }
    }

    @PatchMapping("/device-channels/{id}/remark")
    @Operation(summary = "设置单条通道的备注分类")
    public Result<?> patchDeviceChannelRemark(@RequestHeader(value = "Authorization", required = false) String authorization,
                                              @PathVariable long id,
                                              @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            Long remarkCategoryId = null;
            if (body != null && body.containsKey("remarkCategoryId")) {
                Object v = body.get("remarkCategoryId");
                if (v != null && !"".equals(String.valueOf(v).trim())) {
                    remarkCategoryId = Long.parseLong(String.valueOf(v));
                }
            }
            deviceChannelCacheService.setRemarkCategory(id, remarkCategoryId);
            return Result.success();
        } catch (NumberFormatException ex) {
            return Result.error("备注分类 ID 无效");
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() != null ? ex.getMessage() : "保存失败");
        }
    }

    private static Integer parseIntegerOrNull(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception e) {
            return null;
        }
    }

    @GetMapping("/device-channels/meta")
    @Operation(summary = "通道筛选维度与分类汇总")
    public Result<?> deviceChannelMeta(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        Map<String, Object> payload = new HashMap<>();
        payload.put("facets", deviceChannelCacheService.facets());
        payload.put("summary", deviceChannelCacheService.classifySummary());
        return Result.success(payload);
    }

    private Result<?> requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
