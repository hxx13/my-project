package com.example.demo.modules.reportform.mapper;

import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ReportFormDefinitionMapper {

    @Select("SELECT * FROM report_form_definition WHERE id = #{id}")
    ReportFormDefinition selectById(Long id);

    @Select("SELECT * FROM report_form_definition ORDER BY pinned DESC, created_at DESC")
    List<ReportFormDefinition> selectPage();

    @Select("SELECT * FROM report_form_definition WHERE created_by = #{username} ORDER BY pinned DESC, created_at DESC")
    List<ReportFormDefinition> selectPageByUser(@Param("username") String username);

    @Update("UPDATE report_form_definition SET pinned=#{pinned} WHERE id=#{id}")
    int updatePinned(@Param("id") Long id, @Param("pinned") Boolean pinned);

    @Insert("INSERT INTO report_form_definition (name, description, source, status, layout_json, theme_json, " +
            "fill_policy_json, permission_json, schedule_json, word_template_ids_json, " +
            "version_snapshots_json, pinned, created_by, updated_by, created_at, updated_at) " +
            "VALUES (#{name}, #{description}, #{source}, #{status}, #{layoutJson}, #{themeJson}, " +
            "#{fillPolicyJson}, #{permissionJson}, #{scheduleJson}, #{wordTemplateIdsJson}, " +
            "#{versionSnapshotsJson}, #{pinned}, #{createdBy}, #{updatedBy}, #{createdAt}, #{updatedAt})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ReportFormDefinition entity);

    @Update("UPDATE report_form_definition SET name=#{name}, description=#{description}, " +
            "layout_json=#{layoutJson}, theme_json=#{themeJson}, fill_policy_json=#{fillPolicyJson}, " +
            "permission_json=#{permissionJson}, schedule_json=#{scheduleJson}, pinned=#{pinned}, " +
            "word_template_ids_json=#{wordTemplateIdsJson}, updated_by=#{updatedBy}, updated_at=#{updatedAt} " +
            "WHERE id=#{id}")
    int update(ReportFormDefinition entity);

    @Update("UPDATE report_form_definition SET status=#{status}, published_by=#{publishedBy}, " +
            "published_at=#{publishedAt}, version_snapshots_json=#{versionSnapshotsJson}, " +
            "updated_by=#{updatedBy}, updated_at=#{updatedAt} WHERE id=#{id}")
    int updateStatus(ReportFormDefinition entity);

    @Delete("DELETE FROM report_form_definition WHERE id=#{id}")
    int deleteById(Long id);
}
