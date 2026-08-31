package com.example.demo.modules.team.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.team.dto.*;
import com.example.demo.modules.team.service.TeamService;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 团队管理后台接口。
 * 鉴权由 {@code AdminAuthInterceptor}（要求 STAFF+）统一拦截，service 再卡 ADMIN 与团队级角色门。
 */
@RestController
@RequestMapping("/api/portal/admin/team")
@Tag(name = "团队管理", description = "团队的创建、成员、申请与审批")
public class TeamAdminController {

    private final TeamService teamService;
    private final AuthContextService authContextService;

    public TeamAdminController(TeamService teamService, AuthContextService authContextService) {
        this.teamService = teamService;
        this.authContextService = authContextService;
    }

    private User resolveUser(String auth) {
        if (auth == null || auth.isBlank()) return null;
        return authContextService.resolveUserFromBearer(auth);
    }

    @PostMapping
    public Result<Map<String, Object>> create(@RequestHeader(value = "Authorization", required = false) String auth,
                                              @RequestBody TeamCreateRequest body) {
        return Result.success(teamService.create(resolveUser(auth), body));
    }

    @GetMapping
    public Result<Map<String, Object>> list(@RequestHeader(value = "Authorization", required = false) String auth,
                                            @RequestParam(defaultValue = "1") int page,
                                            @RequestParam(defaultValue = "20") int pageSize,
                                            @RequestParam(required = false) String keyword) {
        return Result.success(teamService.list(resolveUser(auth), keyword, page, pageSize));
    }

    @GetMapping("/{id}")
    public Result<Map<String, Object>> get(@RequestHeader(value = "Authorization", required = false) String auth,
                                           @PathVariable Long id) {
        return Result.success(teamService.getDetail(resolveUser(auth), id));
    }

    @PutMapping("/{id}")
    public Result<Map<String, Object>> edit(@RequestHeader(value = "Authorization", required = false) String auth,
                                            @PathVariable Long id,
                                            @RequestBody TeamUpdateRequest body) {
        return Result.success(teamService.edit(resolveUser(auth), id, body));
    }

    @PostMapping("/{id}/dissolve")
    public Result<Map<String, Object>> dissolve(@RequestHeader(value = "Authorization", required = false) String auth,
                                                @PathVariable Long id) {
        return Result.success(teamService.dissolve(resolveUser(auth), id));
    }

    @PostMapping("/{id}/transfer")
    public Result<Map<String, Object>> transfer(@RequestHeader(value = "Authorization", required = false) String auth,
                                                @PathVariable Long id,
                                                @RequestBody TransferRequest body) {
        return Result.success(teamService.transfer(resolveUser(auth), id, body.getTargetMemberId()));
    }

    @GetMapping("/{id}/members")
    public Result<List<Map<String, Object>>> members(@RequestHeader(value = "Authorization", required = false) String auth,
                                                     @PathVariable Long id) {
        return Result.success(teamService.listMembers(resolveUser(auth), id));
    }

    @PostMapping("/{id}/members")
    public Result<Map<String, Object>> addMember(@RequestHeader(value = "Authorization", required = false) String auth,
                                                 @PathVariable Long id,
                                                 @RequestBody AddMemberRequest body) {
        return Result.success(teamService.addMember(resolveUser(auth), id, body));
    }

    @PutMapping("/{id}/members/{memberId}/role")
    public Result<Map<String, Object>> changeRole(@RequestHeader(value = "Authorization", required = false) String auth,
                                                  @PathVariable Long id,
                                                  @PathVariable Long memberId,
                                                  @RequestBody RoleChangeRequest body) {
        return Result.success(teamService.changeRole(resolveUser(auth), id, memberId, body.getRoleCode()));
    }

    @DeleteMapping("/{id}/members/{memberId}")
    public Result<Map<String, Object>> removeMember(@RequestHeader(value = "Authorization", required = false) String auth,
                                                    @PathVariable Long id,
                                                    @PathVariable Long memberId) {
        return Result.success(teamService.removeMember(resolveUser(auth), id, memberId));
    }

    @GetMapping("/{id}/roles")
    public Result<List<Map<String, Object>>> listRoles(@PathVariable Long id) {
        return Result.success(teamService.listRoles(id));
    }

    @PostMapping("/{id}/roles")
    public Result<Map<String, Object>> createRole(@RequestHeader(value = "Authorization", required = false) String auth,
                                                  @PathVariable Long id,
                                                  @RequestBody Map<String, Object> body) {
        String code = body.get("code") == null ? null : String.valueOf(body.get("code"));
        String label = body.get("label") == null ? null : String.valueOf(body.get("label"));
        return Result.success(teamService.createRole(resolveUser(auth), id, code, label));
    }

    @DeleteMapping("/{id}/roles/{roleId}")
    public Result<?> deleteRole(@RequestHeader(value = "Authorization", required = false) String auth,
                                @PathVariable Long id,
                                @PathVariable Long roleId) {
        teamService.deleteRole(resolveUser(auth), id, roleId);
        return Result.success();
    }

    @PostMapping("/{id}/invite")
    public Result<Map<String, Object>> invite(@RequestHeader(value = "Authorization", required = false) String auth,
                                              @PathVariable Long id,
                                              @RequestBody InviteRequest body) {
        return Result.success(teamService.invite(resolveUser(auth), id, body));
    }

    @PostMapping("/{id}/join-requests")
    public Result<Map<String, Object>> apply(@RequestHeader(value = "Authorization", required = false) String auth,
                                             @PathVariable Long id,
                                             @RequestBody JoinApplyRequest body) {
        return Result.success(teamService.apply(resolveUser(auth), id, body));
    }

    @GetMapping("/{id}/join-requests")
    public Result<Map<String, Object>> requests(@RequestHeader(value = "Authorization", required = false) String auth,
                                                @PathVariable Long id,
                                                @RequestParam(required = false) String status,
                                                @RequestParam(defaultValue = "1") int page,
                                                @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(teamService.listRequests(resolveUser(auth), id, status, page, pageSize));
    }

    @PostMapping("/{id}/join-requests/{requestId}/approve")
    public Result<Map<String, Object>> approve(@RequestHeader(value = "Authorization", required = false) String auth,
                                               @PathVariable Long id,
                                               @PathVariable Long requestId) {
        return Result.success(teamService.approve(resolveUser(auth), id, requestId));
    }

    @PostMapping("/{id}/join-requests/{requestId}/reject")
    public Result<Map<String, Object>> reject(@RequestHeader(value = "Authorization", required = false) String auth,
                                              @PathVariable Long id,
                                              @PathVariable Long requestId,
                                              @RequestBody RejectRequest body) {
        return Result.success(teamService.reject(resolveUser(auth), id, requestId, body.getReason()));
    }

    @PostMapping("/{id}/join-requests/{requestId}/cancel")
    public Result<Map<String, Object>> cancel(@RequestHeader(value = "Authorization", required = false) String auth,
                                              @PathVariable Long id,
                                              @PathVariable Long requestId) {
        return Result.success(teamService.cancel(resolveUser(auth), id, requestId));
    }

    @GetMapping("/my-invites")
    public Result<List<Map<String, Object>>> myInvites(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        return Result.success(teamService.listMyInvites(resolveUser(auth)));
    }

    @PostMapping("/my-invites/{requestId}/accept")
    public Result<Map<String, Object>> acceptInvite(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long requestId) {
        return Result.success(teamService.acceptInvite(resolveUser(auth), requestId));
    }

    @PostMapping("/my-invites/{requestId}/decline")
    public Result<Map<String, Object>> declineInvite(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long requestId) {
        return Result.success(teamService.declineInvite(resolveUser(auth), requestId));
    }
}
