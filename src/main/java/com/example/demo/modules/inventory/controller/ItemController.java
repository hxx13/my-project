package com.example.demo.modules.inventory.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.inventory.dto.ItemLogView;
import com.example.demo.modules.inventory.dto.ItemRetireReq;
import com.example.demo.modules.inventory.dto.ItemTransferReq;
import com.example.demo.modules.inventory.dto.ItemUpsertReq;
import com.example.demo.modules.inventory.dto.ItemView;
import com.example.demo.modules.inventory.service.ItemService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/inventory/items")
@Tag(name = "物品台账", description = "物品查询、留痕、调拨与废弃管理")
public class ItemController {

    private final AuthContextService authContextService;
    private final ItemService itemService;

    public ItemController(AuthContextService authContextService, ItemService itemService) {
        this.authContextService = authContextService;
        this.itemService = itemService;
    }

    @GetMapping
    @Operation(summary = "物品列表（分页、模糊与空间后代过滤）")
    public Result<Map<String, Object>> list(@RequestHeader(value = "Authorization", required = false) String auth,
                                            @RequestParam(required = false) String keyword,
                                            @RequestParam(required = false) Long spaceId,
                                            @RequestParam(required = false) Long categoryId,
                                            @RequestParam(required = false) String granularity,
                                            @RequestParam(required = false) String status,
                                            @RequestParam(required = false) Boolean hasCode,
                                            @RequestParam(defaultValue = "1") int page,
                                            @RequestParam(defaultValue = "20") int size) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return itemService.list(keyword, spaceId, categoryId, granularity, status, hasCode, page, size);
    }

    @GetMapping("/{id}")
    @Operation(summary = "物品详情")
    public Result<ItemView> get(@RequestHeader(value = "Authorization", required = false) String auth,
                                @PathVariable Long id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return itemService.get(id);
    }

    @PostMapping
    @Operation(summary = "新建物品")
    public Result<ItemView> create(@RequestHeader(value = "Authorization", required = false) String auth,
                                   @RequestBody ItemUpsertReq req) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return itemService.create(user, req);
    }

    @PutMapping("/{id}")
    @Operation(summary = "编辑物品")
    public Result<ItemView> update(@RequestHeader(value = "Authorization", required = false) String auth,
                                   @PathVariable Long id, @RequestBody ItemUpsertReq req) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return itemService.update(user, id, req);
    }

    @PostMapping("/{id}/transfer")
    @Operation(summary = "调拨物品（变更所在空间）")
    public Result<?> transfer(@RequestHeader(value = "Authorization", required = false) String auth,
                              @PathVariable Long id, @RequestBody ItemTransferReq req) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return itemService.transfer(user, id, req);
    }

    @PostMapping("/{id}/retire")
    @Operation(summary = "废弃物品")
    public Result<?> retire(@RequestHeader(value = "Authorization", required = false) String auth,
                            @PathVariable Long id, @RequestBody ItemRetireReq req) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return itemService.retire(user, id, req);
    }

    @PostMapping("/{id}/recover")
    @Operation(summary = "恢复物品（废弃 → 在库）")
    public Result<?> recover(@RequestHeader(value = "Authorization", required = false) String auth,
                             @PathVariable Long id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return itemService.recover(user, id);
    }

    @GetMapping("/{id}/logs")
    @Operation(summary = "物品留痕列表")
    public Result<List<ItemLogView>> logs(@RequestHeader(value = "Authorization", required = false) String auth,
                                          @PathVariable Long id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return itemService.listLogs(id);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除物品（软删除）")
    public Result<?> delete(@RequestHeader(value = "Authorization", required = false) String auth,
                            @PathVariable Long id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return itemService.delete(user, id);
    }

    private User resolveUser(String auth) {
        return authContextService.resolveUserFromBearer(auth);
    }
}
