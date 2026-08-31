package com.example.demo.modules.team.mapper;

import com.example.demo.modules.team.entity.Team;
import com.example.demo.modules.team.entity.TeamAuditLog;
import com.example.demo.modules.team.entity.TeamJoinRequest;
import com.example.demo.modules.team.entity.TeamMember;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface TeamMapper {

    // ── team ──
    int insertTeam(Team team);

    int updateTeam(Team team);

    int updateTeamOwner(@Param("id") Long id, @Param("ownerPersonnelId") Long ownerPersonnelId);

    int updateTeamStatus(@Param("id") Long id, @Param("status") String status);

    Team selectTeamById(@Param("id") Long id);

    List<Map<String, Object>> selectTeams(@Param("keyword") String keyword,
                                          @Param("offset") int offset,
                                          @Param("limit") int limit);

    /** 某人（owner 或 member）所属的全部有效团队，owner 优先。 */
    List<Team> selectTeamsByPersonnelId(@Param("personnelId") Long personnelId);

    int countTeams(@Param("keyword") String keyword);

    String selectOwnerName(@Param("personnelId") Long personnelId);

    // ── team_member ──
    int insertMember(TeamMember member);

    int upsertMember(@Param("teamId") Long teamId,
                     @Param("personnelId") Long personnelId,
                     @Param("roleCode") String roleCode);

    int updateMemberRole(@Param("memberId") Long memberId, @Param("roleCode") String roleCode);

    int softDeleteMember(@Param("memberId") Long memberId);

    TeamMember selectMemberById(@Param("memberId") Long memberId);

    TeamMember selectMemberByTeamAndPersonnel(@Param("teamId") Long teamId,
                                              @Param("personnelId") Long personnelId);

    List<Map<String, Object>> selectMembersByTeam(@Param("teamId") Long teamId);

    // ── team_join_request ──
    int insertRequest(TeamJoinRequest request);

    TeamJoinRequest selectRequestById(@Param("requestId") Long requestId);

    TeamJoinRequest selectRequestByIdForUpdate(@Param("requestId") Long requestId);

    TeamJoinRequest selectPendingRequestByTeamAndPersonnel(@Param("teamId") Long teamId,
                                                           @Param("personnelId") Long personnelId);

    int updateRequestStatus(@Param("requestId") Long requestId,
                            @Param("status") String status,
                            @Param("reviewerPersonnelId") Long reviewerPersonnelId);

    List<Map<String, Object>> selectRequests(@Param("teamId") Long teamId,
                                             @Param("status") String status,
                                             @Param("offset") int offset,
                                             @Param("limit") int limit);

    int countRequests(@Param("teamId") Long teamId, @Param("status") String status);

    /** 某人收到的待处理邀请（type=INVITE & PENDING），含团队名。 */
    List<Map<String, Object>> selectMyInvites(@Param("personnelId") Long personnelId);

    // ── team_audit_log ──
    int insertAuditLog(TeamAuditLog log);
}
