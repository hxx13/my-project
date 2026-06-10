package com.example.demo.modules.smartsheet.mapper;

import com.example.demo.modules.smartsheet.entity.SmartsheetDefinition;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface SmartsheetDefinitionMapper {

    @Select("SELECT * FROM smartsheet_definition ORDER BY is_pinned DESC, updated_at DESC LIMIT #{limit} OFFSET #{offset}")
    List<SmartsheetDefinition> selectPage(@Param("offset") int offset, @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM smartsheet_definition")
    int count();

    @Select("SELECT * FROM smartsheet_definition WHERE id = #{id}")
    SmartsheetDefinition selectById(@Param("id") Long id);

    @Insert("INSERT INTO smartsheet_definition (name, description, layout_mode, columns_config, row_entity_source, template_id, created_by, updated_by, created_at, updated_at) " +
            "VALUES (#{name}, #{description}, #{layoutMode}, #{columnsConfig}, #{rowEntitySource}, #{templateId}, #{createdBy}, #{updatedBy}, NOW(), NOW())")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(SmartsheetDefinition def);

    @Update("UPDATE smartsheet_definition SET name = #{name}, description = #{description}, layout_mode = #{layoutMode}, " +
            "columns_config = #{columnsConfig}, row_entity_source = #{rowEntitySource}, updated_by = #{updatedBy}, updated_at = NOW() " +
            "WHERE id = #{id}")
    int update(SmartsheetDefinition def);

    @Delete("DELETE FROM smartsheet_definition WHERE id = #{id}")
    int deleteById(@Param("id") Long id);

    @Delete("<script>DELETE FROM smartsheet_definition WHERE id IN <foreach collection='ids' item='id' open='(' separator=',' close=')'>#{id}</foreach></script>")
    int deleteByIds(@Param("ids") List<Long> ids);

    @Update("UPDATE smartsheet_definition SET is_pinned = #{pinned} WHERE id = #{id}")
    int updatePin(@Param("id") Long id, @Param("pinned") int pinned);

    @Update("UPDATE smartsheet_definition SET name = #{name}, updated_at = NOW() WHERE id = #{id}")
    int rename(@Param("id") Long id, @Param("name") String name);
}
