package com.example.demo.modules.animalorder.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.animalorder.dto.AnimalOrderHolidayDto;
import com.example.demo.modules.animalorder.dto.AnimalOrderTimePolicyAdminDto;
import com.example.demo.modules.animalorder.dto.AnimalOrderTimePolicySummaryDto;
import com.example.demo.modules.animalorder.dto.HolidayImportResultDto;
import com.example.demo.modules.animalorder.service.AnimalOrderTimePolicyService;
import com.example.demo.modules.animalorder.service.HolidaySyncService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/animal-order")
@Tag(name = "动物订购时间", description = "可购窗口 / ETA / 节假日")
public class AnimalOrderTimeController {

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    private final AuthContextService authContextService;
    private final AnimalOrderTimePolicyService policyService;
    private final HolidaySyncService holidaySyncService;

    public AnimalOrderTimeController(AuthContextService authContextService,
                                     AnimalOrderTimePolicyService policyService,
                                     HolidaySyncService holidaySyncService) {
        this.authContextService = authContextService;
        this.policyService = policyService;
        this.holidaySyncService = holidaySyncService;
    }

    @GetMapping("/time-policy")
    @Operation(summary = "运行时策略摘要（登录用户）")
    public Result<AnimalOrderTimePolicySummaryDto> getSummary(
            @RequestParam(required = false) String categoryKey,
            @RequestParam(required = false) String at,
            HttpServletRequest request) {
        Result<?> denied = requireLogin(request);
        if (denied != null) return Result.fail(401, denied.getMessage());
        ZonedDateTime when = parseAt(at);
        return Result.success(policyService.getSummary(categoryKey, when));
    }

    @GetMapping("/time-policy/admin")
    @Operation(summary = "管理端策略与规则（SUPER_ADMIN）")
    public Result<AnimalOrderTimePolicyAdminDto> getAdmin(HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(policyService.getAdminView());
    }

    @PutMapping("/time-policy/admin")
    @Operation(summary = "保存管理端策略与规则（SUPER_ADMIN）")
    public Result<Void> saveAdmin(@RequestBody AnimalOrderTimePolicyAdminDto body,
                                  HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        policyService.saveAdmin(body);
        return Result.success(null);
    }

    @GetMapping("/holidays")
    @Operation(summary = "按年列出节假日（SUPER_ADMIN）")
    public Result<List<AnimalOrderHolidayDto>> listHolidays(
            @RequestParam int year,
            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(policyService.listHolidays(year));
    }

    @PostMapping("/holidays")
    @Operation(summary = "新增或更新节假日（SUPER_ADMIN）")
    public Result<AnimalOrderHolidayDto> createHoliday(
            @RequestBody AnimalOrderHolidayDto body,
            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(policyService.upsertHoliday(body));
    }

    @DeleteMapping("/holidays/{id}")
    @Operation(summary = "删除节假日（SUPER_ADMIN）")
    public Result<Void> deleteHoliday(@PathVariable long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        policyService.deleteHoliday(id);
        return Result.success(null);
    }

    @PostMapping(value = "/holidays/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "上传节假日 JSON 导入（SUPER_ADMIN）")
    public Result<HolidayImportResultDto> importHolidays(
            @RequestParam("file") MultipartFile file,
            HttpServletRequest request) throws IOException {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        if (file == null || file.isEmpty()) {
            return Result.error("请选择 JSON 文件");
        }
        String json = new String(file.getBytes(), StandardCharsets.UTF_8);
        return Result.success(holidaySyncService.importJson(json, "IMPORT"));
    }

    @PostMapping("/holidays/sync-cdn")
    @Operation(summary = "从 holiday-cn CDN 同步节假日（SUPER_ADMIN）")
    public Result<HolidayImportResultDto> syncCdn(
            @RequestBody(required = false) Map<String, Integer> body,
            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        int year = body != null && body.get("year") != null
                ? body.get("year")
                : LocalDate.now(ZONE).getYear();
        return Result.success(holidaySyncService.syncFromCdn(year));
    }

    private User resolveUser(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (attr instanceof User user) {
            if (user.getRole() == null) user.setRole(RoleEnum.MEMBER);
            return user;
        }
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user != null && user.getRole() == null) {
            user.setRole(RoleEnum.MEMBER);
        }
        return user;
    }

    private Result<?> requireLogin(HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) {
            return Result.error("请先登录");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        return null;
    }

    private Result<?> requireMinRole(HttpServletRequest request, RoleEnum minRole) {
        User user = resolveUser(request);
        if (user == null) {
            return Result.error("未登录或 Token 无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum currentRole = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        if (currentRole.getLevel() < minRole.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    private ZonedDateTime parseAt(String at) {
        if (!StringUtils.hasText(at)) {
            return null;
        }
        String s = at.trim();
        try {
            return ZonedDateTime.parse(s);
        } catch (DateTimeParseException ignored) {
            try {
                return OffsetDateTime.parse(s).toZonedDateTime();
            } catch (DateTimeParseException ignored2) {
                try {
                    LocalDateTime ldt = LocalDateTime.parse(
                            s.replace(" ", "T"),
                            DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                    return ldt.atZone(ZONE);
                } catch (DateTimeParseException e) {
                    throw new IllegalArgumentException("无效的 at 参数: " + at);
                }
            }
        }
    }
}
