package com.example.demo.modules.telemetry.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import com.example.demo.modules.telemetry.dto.WinCcTagWriteRequestDto;
import com.example.demo.modules.telemetry.service.TelemetryWinCcWriteService;
import com.example.demo.modules.telemetry.service.WatchlistAlarmLimitsFacadeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/telemetry/wincc")
@CrossOrigin(origins = "*")
@Tag(name = "动物房遥测", description = "WinCC 写入（超级管理员）")
public class TelemetryWinCcWriteController {

    private final AuthContextService authContextService;
    private final TelemetryWinCcWriteService telemetryWinCcWriteService;
    private final WatchlistAlarmLimitsFacadeService watchlistAlarmLimitsFacade;

    public TelemetryWinCcWriteController(AuthContextService authContextService,
                                         TelemetryWinCcWriteService telemetryWinCcWriteService,
                                         WatchlistAlarmLimitsFacadeService watchlistAlarmLimitsFacade) {
        this.authContextService = authContextService;
        this.telemetryWinCcWriteService = telemetryWinCcWriteService;
        this.watchlistAlarmLimitsFacade = watchlistAlarmLimitsFacade;
    }

    @PostMapping("/write-tag")
    @Operation(summary = "WinCC 单点写入并读回合并快照",
            description = "仅超级管理员；仅 SWITCH / SETPOINT 且须在统一快照点名内。手册 PUT .../tagManagement/Value/&lt;VariableName&gt;")
    public Result<TelemetryTagItemDto> writeTag(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody WinCcTagWriteRequestDto body) {
        Result<TelemetryTagItemDto> denied = requireSuperAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        if (body == null || !StringUtils.hasText(body.getVariableName())) {
            return Result.error("variableName 不能为空");
        }
        try {
            TelemetryTagItemDto row = telemetryWinCcWriteService.writeTagAndRefreshSnapshotRow(
                    body.getVariableName(), body.getValue());
            List<TelemetryTagItemDto> withAlarm =
                    watchlistAlarmLimitsFacade.mergeAlarmLimitsIntoSnapshotItems(List.of(row));
            return Result.success(withAlarm.isEmpty() ? row : withAlarm.get(0));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            return Result.error("WinCC 写入失败: " + msg);
        }
    }

    private Result<TelemetryTagItemDto> requireSuperAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
