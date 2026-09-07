package com.example.demo.modules.training.mapper;

import com.example.demo.modules.training.entity.TrainingEnrollment;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface TrainingEnrollmentMapper {

    @Insert("""
            INSERT INTO training_enrollment (occurrence_id, trainee_id, name, job_number, project_group, test_yn, test_fraction, room_ids_json, rooms_json, created_at, updated_at)
            VALUES (#{occurrenceId}, #{traineeId}, #{name}, #{jobNumber}, #{projectGroup}, #{testYn}, #{testFraction}, #{roomIdsJson}, #{roomsJson}, NOW(), NOW())
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(TrainingEnrollment enrollment);

    @Select("""
            SELECT id, occurrence_id AS occurrenceId,
                   trainee_id AS traineeId,
                   name,
                   job_number AS jobNumber,
                   project_group AS projectGroup,
                   test_yn AS testYn,
                   test_fraction AS testFraction,
                   room_ids_json AS roomIdsJson,
                   rooms_json AS roomsJson,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM training_enrollment WHERE occurrence_id = #{occurrenceId} ORDER BY id DESC
            """)
    List<TrainingEnrollment> listByOccurrenceId(@Param("occurrenceId") Long occurrenceId);

    @Select("""
            SELECT id, occurrence_id AS occurrenceId,
                   trainee_id AS traineeId,
                   name,
                   job_number AS jobNumber,
                   project_group AS projectGroup,
                   test_yn AS testYn,
                   test_fraction AS testFraction,
                   room_ids_json AS roomIdsJson,
                   rooms_json AS roomsJson,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM training_enrollment WHERE id = #{id}
            """)
    TrainingEnrollment findById(@Param("id") Long id);

    @Update("UPDATE training_enrollment SET test_yn = #{yn}, updated_at = NOW() WHERE id = #{id}")
    int updateTestYn(@Param("id") Long id, @Param("yn") Integer yn);

    @Update("UPDATE training_enrollment SET test_fraction = #{fraction}, updated_at = NOW() WHERE id = #{id}")
    int updateTestFraction(@Param("id") Long id, @Param("fraction") Integer fraction);

    @Update("UPDATE training_enrollment SET room_ids_json = #{roomIdsJson}, rooms_json = #{roomsJson}, updated_at = NOW() WHERE id = #{id}")
    int updateRooms(@Param("id") Long id, @Param("roomIdsJson") String roomIdsJson, @Param("roomsJson") String roomsJson);

    @Delete("DELETE FROM training_enrollment WHERE id = #{id}")
    int delete(@Param("id") Long id);

    @Delete("DELETE FROM training_enrollment WHERE occurrence_id = #{occurrenceId}")
    int deleteByOccurrenceId(@Param("occurrenceId") Long occurrenceId);
}
