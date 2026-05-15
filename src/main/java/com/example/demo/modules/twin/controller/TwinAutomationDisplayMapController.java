package com.example.demo.modules.twin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.entity.TwinAutomationDisplayMap;
import com.example.demo.modules.twin.mapper.TwinAutomationDisplayMapMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/twin/automation-display-map")
@CrossOrigin("*")
@Tag(name = "自动化日志展示映射", description = "覆盖默认中文标签")
public class TwinAutomationDisplayMapController {

    private final TwinAutomationDisplayMapMapper displayMapMapper;
    private final AuthContextService authContextService;

    public TwinAutomationDisplayMapController(
            TwinAutomationDisplayMapMapper displayMapMapper,
            AuthContextService authContextService
    ) {
        this.displayMapMapper = displayMapMapper;
        this.authContextService = authContextService;
    }

    @GetMapping
    @Operation(summary = "列出全部映射")
    public Result<List<TwinAutomationDisplayMap>> list(@RequestHeader(value = "Authorization", required = false) String authorization) {
        String err = staffAuthError(authorization);
        if (err != null) {
            return Result.error(err);
        }
        return Result.success(displayMapMapper.selectAll());
    }

    @PostMapping
    @Operation(summary = "新增映射")
    public Result<Integer> create(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody TwinAutomationDisplayMap body
    ) {
        String err = staffAuthError(authorization);
        if (err != null) {
            return Result.error(err);
        }
        if (body.getCodeType() == null || body.getCodeType().isBlank()
                || body.getCodeValue() == null || body.getCodeValue().isBlank()
                || body.getLabelZh() == null || body.getLabelZh().isBlank()) {
            return Result.error("codeType、codeValue、labelZh 不能为空");
        }
        return Result.success(displayMapMapper.insert(body));
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新映射")
    public Result<Integer> update(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id,
            @RequestBody TwinAutomationDisplayMap body
    ) {
        String err = staffAuthError(authorization);
        if (err != null) {
            return Result.error(err);
        }
        body.setId(id);
        return Result.success(displayMapMapper.updateById(body));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除映射")
    public Result<Integer> delete(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id
    ) {
        String err = staffAuthError(authorization);
        if (err != null) {
            return Result.error(err);
        }
        return Result.success(displayMapMapper.deleteById(id));
    }

    /** @return 错误信息，null 表示通过 */
    private String staffAuthError(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return "未登录或令牌无效";
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return "账号已禁用";
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return "无权限访问";
        }
        return null;
    }
}
