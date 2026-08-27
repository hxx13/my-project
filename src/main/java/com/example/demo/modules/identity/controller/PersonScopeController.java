package com.example.demo.modules.identity.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.identity.entity.PersonScope;
import com.example.demo.modules.identity.service.PersonScopeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 人员负责范围：逐人挂载「校区/楼层/房间」，用于笼架数据范围收口。
 * 写接口由管理端负责范围分配页调用（admin 权限在外部网关/切面控制）。
 */
@RestController
@RequestMapping("/api/person-scope")
@Tag(name = "人员负责范围")
public class PersonScopeController {

    private final AuthContextService authContextService;
    private final PersonScopeService scopeService;

    public PersonScopeController(AuthContextService authContextService, PersonScopeService scopeService) {
        this.authContextService = authContextService;
        this.scopeService = scopeService;
    }

    @GetMapping("/{userId}")
    @Operation(summary = "查某人的全部负责范围（校区/楼层/房间）")
    public Result<List<Map<String, Object>>> list(@PathVariable String userId, HttpServletRequest request) {
        if (authContextService.resolveUserFromBearer(request.getHeader("Authorization")) == null) {
            return Result.fail(401, "未登录");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (PersonScope s : scopeService.listByAccount(userId)) {
            out.add(Map.of("scopeType", s.getScopeType(), "scopeId", s.getScopeId()));
        }
        return Result.success(out);
    }

    /** body: [{ "scopeType": "FLOOR"|"ROOM"|"CAMPUS", "scopeId": "123" }, ...]，全量替换。 */
    @PutMapping("/{userId}")
    @Operation(summary = "全量替换某人的负责范围")
    public Result<?> replace(@PathVariable String userId, @RequestBody List<Map<String, String>> body, HttpServletRequest request) {
        if (authContextService.resolveUserFromBearer(request.getHeader("Authorization")) == null) {
            return Result.fail(401, "未登录");
        }
        List<PersonScope> scopes = new ArrayList<>();
        for (Map<String, String> item : body) {
            PersonScope s = new PersonScope();
            s.setScopeType(item.get("scopeType"));
            s.setScopeId(item.get("scopeId"));
            scopes.add(s);
        }
        try {
            scopeService.replaceByAccount(userId, scopes);
            return Result.success(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }
}
