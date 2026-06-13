package com.example.demo.modules.reportform.mapper;

import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ReportFormDefinitionMapper {

    @Select("SELECT * FROM report_form_definition WHERE id = #{id}")
    ReportFormDefinition selectById(Long id);

    @Select("SELECT * FROM report_form_definition WHERE status != 'archived' ORDER BY created_at DESC")
    List<ReportFormDefinition> selectPage();

    @Insert("INSERT INTO report_form_definition (name, description, status, layout_json, theme_json, " +
            "fill_policy_json, permission_json, schedule_json, word_template_ids_json, " +
            "version_snapshots_json, created_by, updated_by) " +
            "VALUES (#{name}, #{description}, #{status}, #{layoutJson}, #{themeJson}, " +
            "#{fillPolicyJson}, #{permissionJson}, #{scheduleJson}, #{wordTemplateIdsJson}, " +
            "#{versionSnapshotsJson}, #{createdBy}, #{updatedBy})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ReportFormDefinition entity);

    @Update("UPDATE report_form_definition SET name=#{name}, description=#{description}, " +
            "layout_json=#{layoutJson}, theme_json=#{themeJson}, fill_policy_json=#{fillPolicyJson}, " +
            "permission_json=#{permissionJson}, schedule_json=#{scheduleJson}, " +
            "word_template_ids_json=#{wordTemplateIdsJson}, updated_by=#{updatedBy} " +
            "WHERE id=#{id}")
    int update(ReportFormDefinition entity);

    @Update("UPDATE report_form_definition SET status=#{status}, published_by=#{publishedBy}, " +
            "published_at=#{publishedAt}, version_snapshots_json=#{versionSnapshotsJson}, " +
            "updated_by=#{updatedBy} WHERE id=#{id}")
    int updateStatus(ReportFormDefinition entity);

    @Delete("DELETE FROM report_form_definition WHERE id=#{id}")
    int deleteById(Long id);
}
