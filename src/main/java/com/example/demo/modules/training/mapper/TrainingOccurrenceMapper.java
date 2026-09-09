package com.example.demo.modules.training.mapper;

import com.example.demo.modules.training.entity.TrainingOccurrence;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface TrainingOccurrenceMapper {

    @Insert("""
            INSERT INTO training_occurrence (training_id, start_time, end_time, address, time_limit, examiner_name, examiner_number, status, created_at, updated_at)
            VALUES (#{trainingId}, #{startTime}, #{endTime}, #{address}, #{timeLimit}, #{examinerName}, #{examinerNumber}, #{status}, NOW(), NOW())
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(TrainingOccurrence occurrence);

    @Select("""
            SELECT id, training_id AS trainingId,
                   start_time AS startTime,
                   end_time AS endTime,
                   address,
                   time_limit AS timeLimit,
                   examiner_name AS examinerName,
                   examiner_number AS examinerNumber,
                   status,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM training_occurrence WHERE training_id = #{trainingId} ORDER BY id DESC
            """)
    List<TrainingOccurrence> listByTrainingId(@Param("trainingId") Long trainingId);

    @Select("""
            SELECT id, training_id AS trainingId,
                   start_time AS startTime,
                   end_time AS endTime,
                   address,
                   time_limit AS timeLimit,
                   examiner_name AS examinerName,
                   examiner_number AS examinerNumber,
                   status,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM training_occurrence WHERE id = #{id}
            """)
    TrainingOccurrence findById(@Param("id") Long id);

    @Update("""
            UPDATE training_occurrence SET
                start_time = #{startTime},
                end_time = #{endTime},
                address = #{address},
                time_limit = #{timeLimit},
                examiner_name = #{examinerName},
                examiner_number = #{examinerNumber},
                status = #{status},
                updated_at = NOW()
            WHERE id = #{id}
            """)
    int update(TrainingOccurrence occurrence);

    @Delete("DELETE FROM training_occurrence WHERE id = #{id}")
    int delete(@Param("id") Long id);

    @Delete("DELETE FROM training_occurrence WHERE training_id = #{trainingId}")
    int deleteByTrainingId(@Param("trainingId") Long trainingId);

    @Delete("DELETE o FROM training_occurrence o JOIN training t ON o.training_id = t.id WHERE t.code LIKE #{prefix}")
    int deleteByTrainingCodePrefix(@Param("prefix") String prefix);
}
