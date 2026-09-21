package com.example.demo.modules.personnel.mapper;

import com.example.demo.modules.personnel.entity.ProjectGroupMemberLog;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;

@Mapper
public interface ProjectGroupMemberLogMapper {

    @Insert("INSERT INTO project_group_member_log(project_group_id, personnel_id, action, actor_personnel_id, reason, created_at) "
            + "VALUES(#{projectGroupId}, #{personnelId}, #{action}, #{actorPersonnelId}, #{reason}, NOW())")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ProjectGroupMemberLog log);
}
