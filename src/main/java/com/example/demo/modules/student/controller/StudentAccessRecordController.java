package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;

@RestController
@RequestMapping("/api/student")
@Tag(name = "学生出入记录")
public class StudentAccessRecordController {

    private final AuthContextService authContextService;
    private final AroDatabaseMapper aroDatabaseMapper;

    public StudentAccessRecordController(AuthContextService authContextService,
                                          AroDatabaseMapper aroDatabaseMapper) {
        this.authContextService = authContextService;
        this.aroDatabaseMapper = aroDatabaseMapper;
    }

    @GetMapping("/access-records")
    @Operation(summary = "获取学生出入记录列表")
    public Result<Map<String, Object>> getAccessRecords(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }

        int offset = (page - 1) * size;
        List<Map<String, Object>> rawRecords = aroDatabaseMapper.selectAccessRecordsByUserId(user.getId(), offset, size);
        int total = aroDatabaseMapper.countAccessRecordsByUserId(user.getId());

        List<Map<String, Object>> data = new ArrayList<>();
        if (rawRecords != null) {
            for (Map<String, Object> row : rawRecords) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", String.valueOf(row.getOrDefault("id", "")));
                item.put("eventTime", String.valueOf(row.getOrDefault("event_time", "")));
                item.put("eventType", String.valueOf(row.getOrDefault("event_type", "")));
                item.put("roomName", String.valueOf(row.getOrDefault("room_name", "")));
                item.put("personName", String.valueOf(row.getOrDefault("person_name", "")));
                data.add(item);
            }
        }

        return Result.success(Map.of("data", data, "total", total));
    }
}
