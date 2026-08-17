package com.example.demo.modules.inventory.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.inventory.entity.InvUploadIcon;
import com.example.demo.modules.inventory.service.IconService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/inventory/icons")
@Tag(name = "物品图标", description = "内置医疗图标与上传图标管理")
public class IconController {

    private final AuthContextService authContextService;
    private final IconService iconService;

    public IconController(AuthContextService authContextService, IconService iconService) {
        this.authContextService = authContextService;
        this.iconService = iconService;
    }

    @GetMapping
    @Operation(summary = "图标列表（内置 + 上传）")
    public Result<Map<String, Object>> list() {
        return iconService.list();
    }

    @PostMapping
    @Operation(summary = "上传自定义图标")
    public Result<InvUploadIcon> create(@RequestHeader(value = "Authorization", required = false) String auth,
                                        @RequestBody Map<String, Object> body) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        String name = body.get("name") != null ? String.valueOf(body.get("name")) : null;
        String url = body.get("url") != null ? String.valueOf(body.get("url")) : null;
        String mime = body.get("mime") != null ? String.valueOf(body.get("mime")) : null;
        return iconService.create(user, name, url, mime);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除上传图标")
    public Result<?> delete(@RequestHeader(value = "Authorization", required = false) String auth,
                            @PathVariable Long id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return iconService.delete(id);
    }

    private User resolveUser(String auth) {
        return authContextService.resolveUserFromBearer(auth);
    }
}
