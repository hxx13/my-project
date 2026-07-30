package com.example.demo.modules.agv.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.modules.agv.analysis.AgvAnalysisService;
import com.example.demo.modules.agv.analysis.AgvCorrectionService;
import com.example.demo.modules.agv.analysis.AgvRouteService;
import com.example.demo.modules.agv.analysis.AgvSpatialService;
import com.example.demo.modules.agv.analysis.dto.AnalysisRequest;
import com.example.demo.modules.agv.analysis.model.*;
import com.example.demo.modules.agv.mapper.AgvAnalysisMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/agv/analysis")
@Tag(name = "AGV 行为分析", description = "空间元素/规则/活动段/纠正")
public class AgvAnalysisController {

    private final AgvSpatialService spatialService;
    private final AgvAnalysisService analysisService;
    private final AgvCorrectionService correctionService;
    private final AgvRouteService routeService;
    private final AgvAnalysisMapper mapper;

    public AgvAnalysisController(AgvSpatialService spatialService, AgvAnalysisService analysisService,
                                  AgvCorrectionService correctionService, AgvRouteService routeService,
                                  AgvAnalysisMapper mapper) {
        this.spatialService = spatialService;
        this.analysisService = analysisService;
        this.correctionService = correctionService;
        this.routeService = routeService;
        this.mapper = mapper;
    }

    /**
     * GET /segments is read-only: returns persisted segments (no side effects).
     * Use POST /run to trigger analysis.
     */
    @GetMapping("/segments/{ip}")
    @Operation(summary = "查询活动段（只读，不触发分析）")
    public Result<List<AgvActivitySegment>> segments(
            @PathVariable String ip,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String type) {
        LocalDateTime f = from != null ? parseIso(from) : LocalDateTime.now().minusHours(2);
        LocalDateTime t = to != null ? parseIso(to) : LocalDateTime.now();
        List<AgvActivitySegment> segs = mapper.selectSegments(ip, f, t);
        if (type != null && !type.isEmpty()) {
            segs = segs.stream().filter(s -> type.equals(s.getActivityType())).toList();
        }
        return Result.success(segs);
    }

    @PostMapping("/run")
    @Operation(summary = "触发指定窗口重分析（写操作）")
    public Result<List<AgvActivitySegment>> runAnalysis(@RequestBody AnalysisRequest req) {
        return Result.success(analysisService.analyze(req));
    }

    @PutMapping("/segments/{id}/correct")
    @Operation(summary = "人工纠正活动类型")
    public Result<Map<String, Object>> correct(@PathVariable Long id,
                                                @RequestParam String correctedType,
                                                @RequestParam(required = false) String note,
                                                HttpServletRequest request) {
        Object adminUser = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        String user = adminUser != null ? adminUser.toString() : "unknown";
        AgvCorrection c = correctionService.correct(id, correctedType, user, note);
        boolean suggest = correctionService.shouldSuggestNewRule(correctedType);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("correction", c);
        result.put("suggestNewRule", suggest);
        return Result.success(result);
    }

    // ── Station Names ──

    @GetMapping("/station-names")
    @Operation(summary = "获取站点代码→中文名称映射表")
    public Result<Map<String, String>> stationNames() {
        return Result.success(spatialService.getStationNameMap());
    }

    // ── Spatial Elements ──

    @GetMapping("/spatial-elements")
    @Operation(summary = "查询空间元素列表")
    public Result<List<AgvSpatialElement>> listSpatialElements() {
        return Result.success(spatialService.listAll());
    }

    @PostMapping("/spatial-elements")
    @Operation(summary = "新建/更新空间元素")
    public Result<AgvSpatialElement> saveSpatialElement(@RequestBody AgvSpatialElement e) {
        return Result.success(spatialService.save(e));
    }

    @DeleteMapping("/spatial-elements/{id}")
    @Operation(summary = "软删除空间元素")
    public Result<String> deleteSpatialElement(@PathVariable Long id) {
        spatialService.softDelete(id);
        return Result.success("ok");
    }

    @PostMapping("/spatial-elements/auto-generate")
    @Operation(summary = "自动生成 zone 候选项")
    public Result<List<AgvSpatialElement>> autoGenerate(@RequestParam(required = false) String mapName) {
        return Result.success(spatialService.autoGenerateCandidates(mapName));
    }

    @PostMapping("/spatial-elements/discover")
    @Operation(summary = "手动触发行为驱动的空间区域发现（先分析→再聚类）")
    public Result<Map<String, Object>> discoverZones() {
        LocalDateTime to = LocalDateTime.now();
        LocalDateTime from = to.minusHours(24); // 最近24小时
        // Step 1: 先跑分析，确保有活动段数据
        String[] ips = {"172.22.159.16", "172.22.159.18", "172.22.159.20", "172.22.159.22"};
        int totalSegs = 0;
        for (String ip : ips) {
            try {
                AnalysisRequest req = new AnalysisRequest();
                req.setRobotIp(ip);
                req.setFrom(from.toString());
                req.setTo(to.toString());
                totalSegs += analysisService.analyze(req).size();
            } catch (Exception e) {
                // skip individual failures
            }
        }
        // Step 2: 空间聚类发现区域
        int count = spatialService.spatialZoneDiscovery(from, to);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("segmentsAnalyzed", totalSegs);
        result.put("zonesCreatedOrUpdated", count);
        result.put("window", from.toString() + " → " + to.toString());
        return Result.success(result);
    }

    // ── Rules ──

    @GetMapping("/rules")
    @Operation(summary = "查询规则列表")
    public Result<List<AgvActivityRule>> listRules() {
        return Result.success(mapper.selectAllRules());
    }

    @PostMapping("/rules")
    @Operation(summary = "新建/更新规则")
    public Result<AgvActivityRule> saveRule(@RequestBody AgvActivityRule r) {
        if (r.getId() == null) {
            r.setEnabled(true);
            mapper.insertRule(r);
        } else {
            mapper.updateRule(r);
        }
        return Result.success(r);
    }

    @PutMapping("/rules/{id}/toggle")
    @Operation(summary = "启用/停用规则")
    public Result<String> toggleRule(@PathVariable Long id, @RequestParam int enabled) {
        mapper.toggleRule(id, enabled);
        return Result.success("ok");
    }

    // ── Routes ──

    @GetMapping("/routes")
    @Operation(summary = "查询全部路线")
    public Result<List<AgvRoute>> listRoutes(@RequestParam(required = false) String robotIp) {
        if (robotIp != null && !robotIp.isEmpty()) {
            return Result.success(routeService.listByRobot(robotIp));
        }
        return Result.success(routeService.listAll());
    }

    @PostMapping("/routes/discover")
    @Operation(summary = "从历史活动段中发现路线。force=true 时删除已有路线并重新发现")
    public Result<Map<String, Object>> discoverRoutes(@RequestParam(required = false, defaultValue = "false") boolean force) {
        int count = routeService.discoverRoutes(force);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("routesDiscovered", count);
        result.put("force", force);
        return Result.success(result);
    }

    @PutMapping("/routes/{id}/toggle")
    @Operation(summary = "启用/停用路线")
    public Result<String> toggleRoute(@PathVariable Long id, @RequestParam int enabled) {
        mapper.toggleRoute(id, enabled);
        return Result.success("ok");
    }

    /** Parse ISO 8601 datetime strings including fractional seconds + timezone suffix (e.g. 2026-07-29T07:04:45.326Z) */
    private static LocalDateTime parseIso(String s) {
        try {
            return Instant.parse(s).atZone(ZoneId.systemDefault()).toLocalDateTime();
        } catch (Exception e) {
            return LocalDateTime.parse(s);
        }
    }
}
