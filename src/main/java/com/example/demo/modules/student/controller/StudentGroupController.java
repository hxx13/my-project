package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.personnel.service.ProjectGroupMembershipService;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;

/**
 * 学生端课题组归属接口（子系统4）。
 * 鉴权照 StudentProfileController：resolveUserFromBearer，null → 401。
 */
@RestController
@RequestMapping("/api/student/group")
@Tag(name = "课题组归属", description = "课题组申请/成员/PI 管理")
public class StudentGroupController {

    private final AuthContextService authContextService;
    private final ProjectGroupMembershipService membershipService;

    public StudentGroupController(AuthContextService authContextService,
                                  ProjectGroupMembershipService membershipService) {
        this.authContextService = authContextService;
        this.membershipService = membershipService;
    }

    private User resolve(HttpServletRequest request) {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }

    @GetMapping("/my")
    public Result<Map<String, Object>> my(HttpServletRequest request) {
        User user = resolve(request);
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        return Result.success(membershipService.myGroup(user.getId()));
    }

    @GetMapping("/options")
    public Result<List<Map<String, Object>>> options(HttpServletRequest request) {
        User user = resolve(request);
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        return Result.success(membershipService.applyOptions(user.getId()));
    }

    @PostMapping("/apply")
    public Result<Map<String, Object>> apply(HttpServletRequest request, @RequestBody ApplyRequest body) {
        User user = resolve(request);
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        Long projectGroupId = body == null ? null : body.getProjectGroupId();
        String message = body == null ? null : body.getMessage();
        return Result.success(membershipService.apply(user.getId(), projectGroupId, message));
    }

    @GetMapping("/applications")
    public Result<List<Map<String, Object>>> applications(HttpServletRequest request) {
        User user = resolve(request);
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        return Result.success(membershipService.myApplications(user.getId()));
    }

    @GetMapping("/members")
    public Result<List<Map<String, Object>>> members(HttpServletRequest request) {
        User user = resolve(request);
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        return Result.success(membershipService.listMembers(user.getId()));
    }

    @GetMapping("/requests")
    public Result<List<Map<String, Object>>> requests(HttpServletRequest request) {
        User user = resolve(request);
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        return Result.success(membershipService.listPendingRequests(user.getId()));
    }

    @PostMapping("/requests/{id}/approve")
    public Result<Map<String, Object>> approve(HttpServletRequest request, @PathVariable Long id) {
        User user = resolve(request);
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        return Result.success(membershipService.approve(user.getId(), id));
    }

    @PostMapping("/requests/{id}/reject")
    public Result<Map<String, Object>> reject(HttpServletRequest request, @PathVariable Long id,
                                              @RequestBody(required = false) ReasonRequest body) {
        User user = resolve(request);
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        String reason = body == null ? null : body.getReason();
        return Result.success(membershipService.reject(user.getId(), id, reason));
    }

    @PostMapping("/members/{personnelId}/remove")
    public Result<Map<String, Object>> removeMember(HttpServletRequest request, @PathVariable Long personnelId,
                                                    @RequestBody(required = false) ReasonRequest body) {
        User user = resolve(request);
        if (user == null) {
            return Result.fail(401, "未登录或登录已过期");
        }
        String reason = body == null ? null : body.getReason();
        return Result.success(membershipService.removeMember(user.getId(), personnelId, reason));
    }

    /** 申请入组请求体。 */
    public static class ApplyRequest {
        private Long projectGroupId;
        private String message;

        public Long getProjectGroupId() {
            return projectGroupId;
        }

        public void setProjectGroupId(Long projectGroupId) {
            this.projectGroupId = projectGroupId;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
        }
    }

    /** 拒绝/移出理由请求体。 */
    public static class ReasonRequest {
        private String reason;

        public String getReason() {
            return reason;
        }

        public void setReason(String reason) {
            this.reason = reason;
        }
    }
}
