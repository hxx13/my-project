package com.example.demo.modules.training.mapper;

import com.example.demo.modules.training.entity.Training;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface TrainingMapper {

    @Insert("""
            INSERT INTO training (code, name, type, paper_ids_json, owner_id, time_limit, recurrence, recurrence_day, recurrence_time, status, created_by, created_at, updated_at)
            VALUES (#{code}, #{name}, #{type}, #{paperIdsJson}, #{ownerId}, #{timeLimit}, #{recurrence}, #{recurrenceDay}, #{recurrenceTime}, #{status}, #{createdBy}, NOW(), NOW())
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(Training training);

    @Select("""
            SELECT id, code, name, type,
                   paper_ids_json AS paperIdsJson,
                   owner_id AS ownerId,
                   time_limit AS timeLimit,
                   recurrence,
                   recurrence_day AS recurrenceDay,
                   recurrence_time AS recurrenceTime,
                   status,
                   created_by AS createdBy,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM training WHERE id = #{id}
            """)
    Training findById(@Param("id") Long id);

    @Select("""
            SELECT id, code, name, type,
                   paper_ids_json AS paperIdsJson,
                   owner_id AS ownerId,
                   time_limit AS timeLimit,
                   recurrence,
                   recurrence_day AS recurrenceDay,
                   recurrence_time AS recurrenceTime,
                   status,
                   created_by AS createdBy,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM training WHERE code = #{code}
            """)
    Training findByCode(@Param("code") String code);

    @Select("""
            SELECT id, code, name, type,
                   paper_ids_json AS paperIdsJson,
                   owner_id AS ownerId,
                   time_limit AS timeLimit,
                   recurrence,
                   recurrence_day AS recurrenceDay,
                   recurrence_time AS recurrenceTime,
                   status,
                   created_by AS createdBy,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM training ORDER BY id DESC
            """)
    List<Training> list();

    @Select("""
            SELECT id, code, name, type,
                   paper_ids_json AS paperIdsJson,
                   owner_id AS ownerId,
                   time_limit AS timeLimit,
                   recurrence,
                   recurrence_day AS recurrenceDay,
                   recurrence_time AS recurrenceTime,
                   status,
                   created_by AS createdBy,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM training WHERE status = 'PUBLISHED' AND recurrence IN ('WEEKLY','DAILY')
            """)
    List<Training> listWithRecurrence();

    @Update("""
            UPDATE training SET
                name = #{name},
                type = #{type},
                paper_ids_json = #{paperIdsJson},
                owner_id = #{ownerId},
                time_limit = #{timeLimit},
                recurrence = #{recurrence},
                recurrence_day = #{recurrenceDay},
                recurrence_time = #{recurrenceTime},
                updated_at = NOW()
            WHERE id = #{id}
            """)
    int update(Training training);

    @Update("UPDATE training SET status = 'PUBLISHED', updated_at = NOW() WHERE id = #{id}")
    int publishNow(@Param("id") Long id);

    @Update("UPDATE training SET status = 'DRAFT', updated_at = NOW() WHERE id = #{id}")
    int unpublish(@Param("id") Long id);

    @Delete("DELETE FROM training WHERE id = #{id}")
    int delete(@Param("id") Long id);

    @Delete("DELETE FROM training WHERE code LIKE #{prefix}")
    int deleteByCodePrefix(@Param("prefix") String prefix);
}
