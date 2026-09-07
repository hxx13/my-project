package com.example.demo.modules.training.mapper;

import com.example.demo.modules.training.entity.Training;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface TrainingMapper {

    @Insert("""
            INSERT INTO training (code, name, type, paper_id, owner_id, time_limit, recurrence, status, created_by, created_at, updated_at)
            VALUES (#{code}, #{name}, #{type}, #{paperId}, #{ownerId}, #{timeLimit}, #{recurrence}, #{status}, #{createdBy}, NOW(), NOW())
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(Training training);

    @Select("""
            SELECT id, code, name, type,
                   paper_id AS paperId,
                   owner_id AS ownerId,
                   time_limit AS timeLimit,
                   recurrence,
                   status,
                   created_by AS createdBy,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM training WHERE id = #{id}
            """)
    Training findById(@Param("id") Long id);

    @Select("""
            SELECT id, code, name, type,
                   paper_id AS paperId,
                   owner_id AS ownerId,
                   time_limit AS timeLimit,
                   recurrence,
                   status,
                   created_by AS createdBy,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM training WHERE code = #{code}
            """)
    Training findByCode(@Param("code") String code);

    @Select("""
            SELECT id, code, name, type,
                   paper_id AS paperId,
                   owner_id AS ownerId,
                   time_limit AS timeLimit,
                   recurrence,
                   status,
                   created_by AS createdBy,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM training ORDER BY id DESC
            """)
    List<Training> list();

    @Update("""
            UPDATE training SET
                name = #{name},
                type = #{type},
                paper_id = #{paperId},
                owner_id = #{ownerId},
                time_limit = #{timeLimit},
                recurrence = #{recurrence},
                updated_at = NOW()
            WHERE id = #{id}
            """)
    int update(Training training);

    @Update("UPDATE training SET status = #{status}, updated_at = NOW() WHERE id = #{id}")
    int updateStatus(@Param("id") Long id, @Param("status") String status);

    @Delete("DELETE FROM training WHERE id = #{id}")
    int delete(@Param("id") Long id);
}
