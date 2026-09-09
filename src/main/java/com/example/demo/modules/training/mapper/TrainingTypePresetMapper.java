package com.example.demo.modules.training.mapper;

import com.example.demo.modules.training.entity.TrainingTypePreset;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface TrainingTypePresetMapper {

    @Insert("""
            INSERT INTO training_type_preset (name, created_at)
            VALUES (#{name}, NOW())
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(TrainingTypePreset preset);

    @Select("""
            SELECT id, name, created_at AS createdAt
            FROM training_type_preset ORDER BY id ASC
            """)
    List<TrainingTypePreset> list();

    @Select("""
            SELECT id, name, created_at AS createdAt
            FROM training_type_preset WHERE id = #{id}
            """)
    TrainingTypePreset findById(@Param("id") Long id);

    @Select("""
            SELECT id, name, created_at AS createdAt
            FROM training_type_preset WHERE name = #{name}
            """)
    TrainingTypePreset findByName(@Param("name") String name);

    @Delete("DELETE FROM training_type_preset WHERE id = #{id}")
    int delete(@Param("id") Long id);
}
