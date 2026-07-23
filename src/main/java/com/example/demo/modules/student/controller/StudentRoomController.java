package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.service.StudentRoomService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

@RestController
@RequestMapping("/api/student")
@Tag(name = "学生房间", description = "学生端房间管理与收藏")
public class StudentRoomController {

    private final AuthContextService authContextService;
    private final StudentRoomService studentRoomService;

    public StudentRoomController(AuthContextService authContextService,
                                  StudentRoomService studentRoomService) {
        this.authContextService = authContextService;
        this.studentRoomService = studentRoomService;
    }

    @GetMapping("/rooms")
    @Operation(summary = "获取学生房间列表")
    public Result<Map<String, Object>> getRooms(
            @RequestParam(defaultValue = "") String pinned,
            @RequestParam(defaultValue = "") String floor,
            @RequestParam(defaultValue = "") String status,
            @RequestParam(defaultValue = "") String search,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        Map<String, Object> data = studentRoomService.getRooms(user, pinned, floor, status, search, page, size);
        return Result.success(data);
    }

    @PutMapping("/rooms/{roomId}/pin")
    @Operation(summary = "切换房间收藏状态")
    public Result<Void> togglePin(@PathVariable String roomId,
                                   HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        studentRoomService.togglePin(user, roomId);
        return Result.success();
    }
}
