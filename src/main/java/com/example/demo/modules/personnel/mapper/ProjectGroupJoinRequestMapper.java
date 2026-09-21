package com.example.demo.modules.personnel.mapper;

import com.example.demo.modules.personnel.entity.ProjectGroupJoinRequest;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface ProjectGroupJoinRequestMapper {

    @Insert("INSERT INTO project_group_join_request(project_group_id, personnel_id, status, message, reviewer_personnel_id, reviewed_at, reject_reason, created_at) "
            + "VALUES(#{projectGroupId}, #{personnelId}, #{status}, #{message}, #{reviewerPersonnelId}, #{reviewedAt}, #{rejectReason}, NOW())")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ProjectGroupJoinRequest r);

    @Select("SELECT * FROM project_group_join_request WHERE id = #{id}")
    ProjectGroupJoinRequest selectById(@Param("id") Long id);

    @Select("SELECT * FROM project_group_join_request WHERE project_group_id = #{groupId} AND personnel_id = #{personnelId} AND status = 'PENDING' LIMIT 1")
    ProjectGroupJoinRequest selectPendingByGroupAndPersonnel(@Param("groupId") Long groupId, @Param("personnelId") Long personnelId);

    @Select("SELECT * FROM project_group_join_request WHERE project_group_id = #{groupId} AND status = 'PENDING' ORDER BY id ASC")
    List<ProjectGroupJoinRequest> listPendingByGroup(@Param("groupId") Long groupId);

    @Select("SELECT * FROM project_group_join_request WHERE personnel_id = #{personnelId} ORDER BY id DESC")
    List<ProjectGroupJoinRequest> listByPersonnel(@Param("personnelId") Long personnelId);

    /**
     * 状态推进（仅限 PENDING → 目标态）：带 WHERE status='PENDING'，影响行数为 0 即被并发处理过，
     * 供 approve/reject 用「影响行数」判断防重复审批。
     */
    @Update("UPDATE project_group_join_request SET status = #{status}, reviewer_personnel_id = #{reviewerPersonnelId}, "
            + "reviewed_at = NOW(), reject_reason = #{rejectReason} WHERE id = #{id} AND status = 'PENDING'")
    int updateStatus(@Param("id") Long id, @Param("status") String status,
                     @Param("reviewerPersonnelId") Long reviewerPersonnelId, @Param("rejectReason") String rejectReason);
}
