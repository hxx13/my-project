package com.example.demo.modules.inventory.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.inventory.dto.SpaceNodeView;
import com.example.demo.modules.inventory.dto.SpaceUpsertReq;
import com.example.demo.modules.inventory.entity.InvSpace;
import com.example.demo.modules.inventory.service.SpaceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/inventory/spaces")
@Tag(name = "物品台账空间", description = "空间树管理")
public class SpaceController {

    private final AuthContextService authContextService;
    private final SpaceService spaceService;

    public SpaceController(AuthContextService authContextService, SpaceService spaceService) {
        this.authContextService = authContextService;
        this.spaceService = spaceService;
    }

    @GetMapping("/tree")
    @Operation(summary = "空间树")
    public Result<List<SpaceNodeView>> tree() {
        return spaceService.tree();
    }

    @PostMapping
    @Operation(summary = "新建空间")
    public Result<InvSpace> create(@RequestHeader(value = "Authorization", required = false) String auth,
                                   @RequestBody SpaceUpsertReq req) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return spaceService.create(req);
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新空间")
    public Result<InvSpace> update(@RequestHeader(value = "Authorization", required = false) String auth,
                                   @PathVariable Long id,
                                   @RequestBody SpaceUpsertReq req) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return spaceService.update(id, req);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除空间")
    public Result<?> delete(@RequestHeader(value = "Authorization", required = false) String auth,
                            @PathVariable Long id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return spaceService.delete(id);
    }

    private User resolveUser(String auth) {
        return authContextService.resolveUserFromBearer(auth);
    }
}
