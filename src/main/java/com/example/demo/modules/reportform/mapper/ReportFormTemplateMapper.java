package com.example.demo.modules.reportform.mapper;

import com.example.demo.modules.reportform.entity.ReportFormTemplate;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ReportFormTemplateMapper {

    @Select("SELECT * FROM report_form_template WHERE id = #{id}")
    ReportFormTemplate selectById(Long id);

    @Select("SELECT * FROM report_form_template ORDER BY created_at DESC")
    List<ReportFormTemplate> selectAll();

    @Insert("INSERT INTO report_form_template (name, description, layout_json, theme_json, " +
            "fill_policy_json, permission_json, schedule_json, word_template_ids_json, " +
            "version_snapshots_json, created_by) " +
            "VALUES (#{name}, #{description}, #{layoutJson}, #{themeJson}, " +
            "#{fillPolicyJson}, #{permissionJson}, #{scheduleJson}, #{wordTemplateIdsJson}, " +
            "#{versionSnapshotsJson}, #{createdBy})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ReportFormTemplate entity);

    @Update("UPDATE report_form_template SET name=#{name}, description=#{description}, " +
            "layout_json=#{layoutJson}, theme_json=#{themeJson}, fill_policy_json=#{fillPolicyJson}, " +
            "permission_json=#{permissionJson}, schedule_json=#{scheduleJson}, " +
            "word_template_ids_json=#{wordTemplateIdsJson}, " +
            "version_snapshots_json=#{versionSnapshotsJson}, updated_at=NOW() " +
            "WHERE id=#{id}")
    int update(ReportFormTemplate entity);

    @Delete("DELETE FROM report_form_template WHERE id=#{id}")
    int deleteById(Long id);

    /** 按表单源 ID 查找模板缓存（name 匹配含 "→模板" 后缀） */
    @Select("SELECT * FROM report_form_template WHERE name LIKE CONCAT('%', #{sourceName}, '%') ORDER BY created_at DESC LIMIT 1")
    ReportFormTemplate findBySourceName(@Param("sourceName") String sourceName);
}
