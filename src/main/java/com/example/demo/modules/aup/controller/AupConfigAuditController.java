package com.example.demo.modules.aup.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.aup.service.AupConfigAuditService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** AUP 配置面变更记录查询（ADMIN）。 */
@RestController
@RequestMapping("/api/aup-config-audit")
@Tag(name = "AUP 配置变更记录", description = "配置面变更记录分页查询")
public class AupConfigAuditController {

    private final AupConfigAuditService service;

    public AupConfigAuditController(AupConfigAuditService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(summary = "分页查询配置变更记录")
    public Result<Map<String, Object>> list(
            @RequestParam(value = "entity", required = false) String entity,
            @RequestParam(value = "changeType", required = false) String changeType,
            @RequestParam(value = "operatorId", required = false) String operatorId,
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(value = "dateFrom", required = false) String dateFrom,
            @RequestParam(value = "dateTo", required = false) String dateTo,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize) {
        return Result.success(service.query(entity, changeType, operatorId, keyword, dateFrom, dateTo, page, pageSize));
    }
}
