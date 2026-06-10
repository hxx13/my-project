package com.example.demo.modules.material.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.material.dto.*;
import com.example.demo.modules.material.entity.MaterialDemand;
import com.example.demo.modules.material.mapper.MaterialDemandMapper;
import com.example.demo.modules.material.service.MaterialService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/material")
@Tag(name = "学生物资申领", description = "学生浏览、申领物资")
public class MaterialController {
    private final AuthContextService authContextService;
    private final MaterialService materialService;
    private final MaterialDemandMapper demandMapper;

    public MaterialController(AuthContextService authContextService, MaterialService materialService,
                               MaterialDemandMapper demandMapper) {
        this.authContextService = authContextService;
        this.materialService = materialService;
        this.demandMapper = demandMapper;
    }

    @GetMapping("/categories")
    @Operation(summary = "启用分类列表")
    public Result<List<MaterialCategoryView>> categories() {
        return Result.success(materialService.listCategoriesForStudent());
    }

    @GetMapping("/items")
    @Operation(summary = "已上架物品列表")
    public Result<List<MaterialItemView>> items(@RequestParam(required = false) Long categoryId) {
        return Result.success(materialService.listItemsForStudent(categoryId));
    }

    @GetMapping("/items/{id}")
    @Operation(summary = "物品详情")
    public Result<MaterialItemView> itemDetail(@PathVariable Long id) {
        return materialService.getItem(id);
    }

    @GetMapping("/cart")
    @Operation(summary = "获取购物车")
    public Result<Map<String, Object>> getCart(@RequestHeader(value = "Authorization", required = false) String auth) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.getCart(user);
    }

    @PutMapping("/cart")
    @Operation(summary = "保存购物车")
    public Result<?> saveCart(@RequestHeader(value = "Authorization", required = false) String auth,
                              @RequestBody Map<String, Object> body) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.saveCart(user, body);
    }

    @PostMapping("/requests")
    @Operation(summary = "提交申领")
    public Result<MaterialRequestView> createRequest(@RequestHeader(value = "Authorization", required = false) String auth,
                                                       @RequestBody CreateMaterialRequestReq req) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.createRequest(user, req);
    }

    @GetMapping("/requests/mine")
    @Operation(summary = "我的申领记录")
    public Result<Map<String, Object>> mine(@RequestHeader(value = "Authorization", required = false) String auth,
                                             @RequestParam(required = false) String status,
                                             @RequestParam(defaultValue = "1") int page,
                                             @RequestParam(defaultValue = "20") int size) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.listMine(user, status, page, size);
    }

    @GetMapping("/requests/{id}")
    @Operation(summary = "申领单详情")
    public Result<MaterialRequestView> requestDetail(@RequestHeader(value = "Authorization", required = false) String auth,
                                                       @PathVariable String id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.getRequestDetail(user, id);
    }

    @PostMapping("/requests/{id}/withdraw")
    @Operation(summary = "撤回申领")
    public Result<?> withdraw(@RequestHeader(value = "Authorization", required = false) String auth,
                              @PathVariable String id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.withdraw(user, id);
    }

    @PostMapping("/requests/{id}/receive")
    @Operation(summary = "确认领取")
    public Result<?> receive(@RequestHeader(value = "Authorization", required = false) String auth,
                             @PathVariable String id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.confirmReceive(user, id);
    }

    @GetMapping("/stats/mine")
    @Operation(summary = "个人领用统计")
    public Result<MaterialStatsOverview> myStats() {
        return materialService.getStatsOverview("2000-01-01", "2099-12-31");
    }

    @PostMapping("/demands")
    @Operation(summary = "提交需求建议")
    public Result<?> createDemand(@RequestHeader(value = "Authorization", required = false) String auth,
                                   @RequestBody Map<String, String> body) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        String suggestion = body.get("suggestion");
        if (suggestion == null || suggestion.trim().isEmpty()) return Result.error("建议不能为空");
        MaterialDemand demand = new MaterialDemand();
        demand.setUserId(user.getId());
        demand.setSuggestion(suggestion.trim());
        demandMapper.insert(demand);
        return Result.success(null);
    }

    @GetMapping("/demands/mine")
    @Operation(summary = "我的需求建议")
    public Result<List<MaterialDemand>> myDemands(@RequestHeader(value = "Authorization", required = false) String auth) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return Result.success(demandMapper.selectByUserId(user.getId()));
    }

    private User resolveUser(String auth) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) return null;
        if (user.getRole() == null) user.setRole(RoleEnum.STUDENT);
        return user;
    }
}
