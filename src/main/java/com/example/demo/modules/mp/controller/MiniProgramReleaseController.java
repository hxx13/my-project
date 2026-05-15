package com.example.demo.modules.mp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.mp.dto.MiniProgramReleaseUpsertRequest;
import com.example.demo.modules.mp.dto.MiniProgramReleaseView;
import com.example.demo.modules.mp.service.MiniProgramReleaseService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/mp/releases")
@Tag(name = "小程序版本公告", description = "首屏公告与版本更新记录；读接口需登录，写接口仅平台所有者")
public class MiniProgramReleaseController {

    private final AuthContextService authContextService;
    private final MiniProgramReleaseService releaseService;

    public MiniProgramReleaseController(AuthContextService authContextService,
                                       MiniProgramReleaseService releaseService) {
        this.authContextService = authContextService;
        this.releaseService = releaseService;
    }

    @GetMapping("/splash")
    @Operation(summary = "当前首屏公告（若有）")
    public Result<?> splash(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = denyIfBadUser(user);
        if (denied != null) {
            return denied;
        }
        MiniProgramReleaseView v = releaseService.findSplashView();
        Map<String, Object> data = new HashMap<>();
        data.put("release", v);
        return Result.success(data);
    }

    @GetMapping
    @Operation(summary = "全部版本记录（新在前）")
    public Result<?> list(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = denyIfBadUser(user);
        if (denied != null) {
            return denied;
        }
        return Result.success(releaseService.listPublishedViews());
    }

    @PostMapping
    @Operation(summary = "新增版本记录")
    public Result<?> create(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @RequestBody MiniProgramReleaseUpsertRequest body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = denyIfBadUser(user);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(releaseService.create(user, body));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        }
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新版本记录")
    public Result<?> update(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable String id,
                            @RequestBody MiniProgramReleaseUpsertRequest body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = denyIfBadUser(user);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(releaseService.update(user, id, body));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除版本记录")
    public Result<?> delete(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable String id) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = denyIfBadUser(user);
        if (denied != null) {
            return denied;
        }
        try {
            releaseService.delete(user, id);
            return Result.success();
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        }
    }

    private static Result<?> denyIfBadUser(User user) {
        if (user == null) {
            return Result.error("未登录或Token无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        return null;
    }
}
