package com.example.demo.modules.training.mapper;

import com.example.demo.modules.training.entity.TrainingLocationPreset;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface TrainingLocationPresetMapper {

    @Insert("""
            INSERT INTO training_location_preset (name, address, created_at)
            VALUES (#{name}, #{address}, NOW())
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(TrainingLocationPreset preset);

    @Select("""
            SELECT id, name, address, created_at AS createdAt
            FROM training_location_preset ORDER BY id DESC
            """)
    List<TrainingLocationPreset> list();

    @Select("""
            SELECT id, name, address, created_at AS createdAt
            FROM training_location_preset WHERE id = #{id}
            """)
    TrainingLocationPreset findById(@Param("id") Long id);

    @Delete("DELETE FROM training_location_preset WHERE id = #{id}")
    int delete(@Param("id") Long id);
}
