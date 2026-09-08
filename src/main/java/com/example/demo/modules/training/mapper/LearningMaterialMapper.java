package com.example.demo.modules.training.mapper;

import com.example.demo.modules.training.entity.LearningMaterial;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface LearningMaterialMapper {

    String SELECT_WITH_FILE = """
            SELECT m.id, m.file_id AS fileId, m.title, m.category, m.sort_order AS sortOrder,
                   m.active, m.created_by AS createdBy, m.created_at AS createdAt, m.updated_at AS updatedAt,
                   f.original_name AS originalName, f.size_bytes AS sizeBytes, f.mime_type AS mimeType
            FROM learning_material m LEFT JOIN admin_file_template f ON f.id = m.file_id
            """;

    @Select(SELECT_WITH_FILE + " ORDER BY m.sort_order ASC, m.id DESC")
    List<LearningMaterial> listAll();

    @Select(SELECT_WITH_FILE + " WHERE m.active = 1 ORDER BY m.sort_order ASC, m.id DESC")
    List<LearningMaterial> listActive();

    @Select(SELECT_WITH_FILE + " WHERE m.id = #{id}")
    LearningMaterial findById(@Param("id") Long id);

    @Insert("""
            INSERT INTO learning_material (file_id, title, category, sort_order, active, created_by)
            VALUES (#{fileId}, #{title}, #{category}, #{sortOrder}, #{active}, #{createdBy})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(LearningMaterial m);

    @Update("""
            UPDATE learning_material
            SET title = #{title}, category = #{category}, sort_order = #{sortOrder}, active = #{active}, updated_at = NOW()
            WHERE id = #{id}
            """)
    int update(LearningMaterial m);

    @Delete("DELETE FROM learning_material WHERE id = #{id}")
    int delete(@Param("id") Long id);
}
