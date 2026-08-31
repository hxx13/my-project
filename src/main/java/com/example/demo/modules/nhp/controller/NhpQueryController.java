package com.example.demo.modules.nhp.controller;
import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.nhp.entity.CrfConcept;
import com.example.demo.modules.nhp.entity.CrfTodo;
import com.example.demo.modules.nhp.service.NhpQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
/** NHP 读侧聚合查询（概念序列 / 待办 / 任务）。 */
@RestController
@RequestMapping("/api/nhp/query")
@Tag(name = "NHP 读侧查询", description = "概念序列 / 待办 / 审核任务")
public class NhpQueryController {
    private final NhpQueryService queryService;
    private final AuthContextService authContextService;
    public NhpQueryController(NhpQueryService queryService, AuthContextService authContextService) {
        this.queryService = queryService;
        this.authContextService = authContextService;
    }
    @GetMapping({"/listSeries", "/series"})
    @Operation(summary = "序列网格（有/无 conceptCode；形状 {indicators,rows}）")
    public Result<Map<String, Object>> listSeries(
            @RequestParam Long subjectId,
            @RequestParam(required = false) String conceptCode,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        return queryService.listSeries(subjectId, conceptCode, from, to);
    }
    @GetMapping("/concepts")
    @Operation(summary = "概念/指标库列表")
    public Result<List<CrfConcept>> listConcepts() {
        return queryService.listConcepts();
    }
    @GetMapping("/listTodoBySubject")
    @Operation(summary = "受试者待办（逾期派生 OVERDUE）")
    public Result<List<CrfTodo>> listTodoBySubject(@RequestParam Long subjectId) {
        return queryService.listTodoBySubject(subjectId);
    }
    @GetMapping("/listMyTasks")
    @Operation(summary = "审核中心四 tab 队列")
    public Result<List<Map<String, Object>>> listMyTasks(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        return queryService.listMyTasks(authContextService.resolveUserFromBearer(auth));
    }


    @PutMapping("/todos/{id}/status")
    @Operation(summary = "更新待办状态（OPEN/DONE/CANCELLED）")
    public Result<CrfTodo> updateTodoStatus(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        return queryService.updateTodoStatus(id, body);
    }
}
