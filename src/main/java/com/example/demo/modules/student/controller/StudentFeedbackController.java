package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.dto.StudentFeedbackTicketRequest;
import com.example.demo.modules.student.entity.StudentFeedbackTicket;
import com.example.demo.modules.student.service.StudentFeedbackService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/student/feedback")
@Tag(name = "学生反馈")
public class StudentFeedbackController {

    private final AuthContextService authContextService;
    private final StudentFeedbackService studentFeedbackService;

    public StudentFeedbackController(AuthContextService authContextService,
                                      StudentFeedbackService studentFeedbackService) {
        this.authContextService = authContextService;
        this.studentFeedbackService = studentFeedbackService;
    }

    @GetMapping("/faq")
    @Operation(summary = "获取FAQ分组列表")
    public Result<List<Map<String, Object>>> getFaq(HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        List<Map<String, Object>> data = studentFeedbackService.getFaqGroups();
        return Result.success(data);
    }

    @GetMapping("/tickets")
    @Operation(summary = "获取反馈工单列表")
    public Result<Map<String, Object>> getTickets(@RequestParam(defaultValue = "1") int page,
                                                    @RequestParam(defaultValue = "20") int size,
                                                    HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        Map<String, Object> data = studentFeedbackService.getTickets(user, page, size);
        return Result.success(data);
    }

    @PostMapping("/tickets")
    @Operation(summary = "创建反馈工单")
    public Result<StudentFeedbackTicket> createTicket(@RequestBody StudentFeedbackTicketRequest requestBody,
                                                       HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        StudentFeedbackTicket ticket = studentFeedbackService.createTicket(user, requestBody);
        return Result.success(ticket);
    }
}
