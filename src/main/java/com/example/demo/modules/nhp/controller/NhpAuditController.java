package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfDataAuditLog;
import com.example.demo.modules.nhp.entity.CrfQuery;
import com.example.demo.modules.nhp.service.NhpAuditService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** NHP 审计 + 数据质疑。 */
@RestController
@RequestMapping("/api/nhp")
@Tag(name = "NHP 审计质疑", description = "审计日志 + 数据质疑")
public class NhpAuditController {

    private final NhpAuditService service;

    public NhpAuditController(NhpAuditService service) {
        this.service = service;
    }

    @GetMapping("/records/{recordId}/audit")
    @Operation(summary = "审计日志")
    public Result<List<CrfDataAuditLog>> audit(@PathVariable Long recordId) {
        return Result.success(service.audit(recordId));
    }

    @GetMapping("/records/{recordId}/queries")
    @Operation(summary = "记录下的数据质疑列表")
    public Result<List<CrfQuery>> listQueries(@PathVariable Long recordId) {
        return service.listQueries(recordId);
    }

    @PostMapping("/queries")
    @Operation(summary = "发起数据质疑")
    public Result<CrfQuery> createQuery(@RequestBody Map<String, Object> body) {
        return service.createQuery(body);
    }

    @PutMapping("/queries/{id}/answer")
    @Operation(summary = "回复质疑")
    public Result<?> answerQuery(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        return service.answerQuery(id, body);
    }

    @PutMapping("/queries/{id}/close")
    @Operation(summary = "关闭质疑")
    public Result<?> closeQuery(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        return service.closeQuery(id, body);
    }
}
