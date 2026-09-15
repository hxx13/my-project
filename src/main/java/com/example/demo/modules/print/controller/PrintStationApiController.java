package com.example.demo.modules.print.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.print.entity.PrintJob;
import com.example.demo.modules.print.entity.PrintStation;
import com.example.demo.modules.print.service.PrintJobService;
import com.example.demo.modules.print.service.PrintJobViewAssembler;
import com.example.demo.modules.print.service.PrintSourceResolver;
import com.example.demo.modules.print.service.PrintStationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 工位侧接口。调用方是工位电脑，用绑定的那个专用账号登录。
 *
 * 每个方法都先 resolveStation：登录账号必须正好是某个工位的绑定账号，否则 403。
 * 只校验「登录了」是不够的 —— 那会让任意教职工都能拉走别人的打印文件。
 */
@RestController
@RequestMapping("/api/print")
@Tag(name = "打印-工位侧")
public class PrintStationApiController {

    private final PrintStationService stationService;
    private final PrintJobService jobService;
    private final PrintSourceResolver sourceResolver;
    private final AuthContextService authContextService;
    private final PrintJobViewAssembler jobViewAssembler;

    public PrintStationApiController(PrintStationService stationService,
                                     PrintJobService jobService,
                                     PrintSourceResolver sourceResolver,
                                     AuthContextService authContextService,
                                     PrintJobViewAssembler jobViewAssembler) {
        this.stationService = stationService;
        this.jobService = jobService;
        this.sourceResolver = sourceResolver;
        this.authContextService = authContextService;
        this.jobViewAssembler = jobViewAssembler;
    }

    private User requireUser(String authHeader) {
        User u = authContextService.resolveUserFromBearer(authHeader);
        if (u == null || u.getId() == null || u.getId().isBlank()) {
            throw new TwinBusinessException(401, "未登录");
        }
        return u;
    }

    /** 登录账号 → 它绑定的工位。不是工位账号就 403。 */
    private PrintStation requireStation(String authHeader) {
        User u = requireUser(authHeader);
        return stationService.findByUserId(u.getId())
                .orElseThrow(() -> new TwinBusinessException(403, "当前账号未绑定打印工位"));
    }

    /** 给普通人员选打印机用：只暴露已启用的工位，不含绑定账号等敏感字段。 */
    @GetMapping("/stations")
    @Operation(summary = "可选工位列表")
    public Result<List<Map<String, Object>>> selectableStations(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth) {
        requireUser(auth);
        return Result.success(stationService.listEnabled().stream()
                .map(s -> Map.<String, Object>of("id", s.getId(), "name", s.getName()))
                .toList());
    }

    /** 工位页取自身配置。pageSize 决定打印页的 @page 尺寸（斑马卡片机靠它）。 */
    @GetMapping("/me")
    @Operation(summary = "工位自身配置")
    public Result<Map<String, Object>> me(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth) {
        PrintStation station = requireStation(auth);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", station.getId());
        out.put("name", station.getName());
        out.put("pageSize", station.getPageSize());
        return Result.success(out);
    }

    /** 原子领一条。无可领时 data 为 null。 */
    @PostMapping("/jobs/claim")
    @Operation(summary = "领取一条待打印任务")
    public Result<Map<String, Object>> claim(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth) {
        PrintStation station = requireStation(auth);
        PrintJob job = jobService.claimOne(station.getId());
        return Result.success(job == null ? null : jobViewAssembler.toView(job));
    }

    @PostMapping("/jobs/{id}/ack")
    @Operation(summary = "回执")
    public Result<Map<String, Object>> ack(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable String id,
            @RequestBody(required = false) Map<String, Object> body) {
        PrintStation station = requireStation(auth);
        boolean ok = body == null || !Boolean.FALSE.equals(body.get("ok"));
        String error = body == null || body.get("error") == null
                ? null : String.valueOf(body.get("error"));
        if (!jobService.acknowledge(id, station.getId(), ok, error)) {
            return Result.error("任务不存在或状态已变更");
        }
        return Result.success(Map.of("ok", true));
    }

    /** 只允许取本工位任务的文件。 */
    @GetMapping("/jobs/{id}/file")
    @Operation(summary = "取任务文件")
    public ResponseEntity<byte[]> file(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable String id) throws IOException {
        PrintStation station = requireStation(auth);
        PrintJob job = jobService.findById(id)
                .filter(j -> station.getId().equals(j.getStationId()))
                .orElseThrow(() -> new TwinBusinessException(403, "任务不属于当前工位"));
        byte[] bytes = sourceResolver.resolve(job)
                .orElseThrow(() -> new TwinBusinessException(404, "文件已不存在"));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_OCTET_STREAM_VALUE)
                .body(bytes);
    }

    /** 工位页展示用的历史记录。 */
    @GetMapping("/my-jobs")
    @Operation(summary = "本工位任务记录")
    public Result<List<Map<String, Object>>> myJobs(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestParam(defaultValue = "20") int limit) {
        PrintStation station = requireStation(auth);
        return Result.success(jobViewAssembler.toViews(jobService.listByStation(station.getId(), limit)));
    }

    /** 还排着几条。工位页靠它告诉现场的人「后面还有多少」。 */
    @GetMapping("/pending-count")
    @Operation(summary = "本工位排队中任务数")
    public Result<Map<String, Object>> pendingCount(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth) {
        PrintStation station = requireStation(auth);
        return Result.success(Map.of("pending", jobService.countPending(station.getId())));
    }
}
