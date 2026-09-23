package com.example.demo.modules.training.mapper;

import com.example.demo.modules.training.entity.TrainingCertificate;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface TrainingCertificateMapper {

    /** 唯一键 (enrollment_id, template_key) 兜底幂等：重复发证只影响 0 行。 */
    @Insert("""
            INSERT INTO training_certificate
                (person_id, person_name, template_key, template_version, training_id, training_name,
                 occurrence_id, enrollment_id, training_date, trainer_name, issued_at)
            VALUES (#{personId}, #{personName}, #{templateKey}, #{templateVersion}, #{trainingId}, #{trainingName},
                    #{occurrenceId}, #{enrollmentId}, #{trainingDate}, #{trainerName}, NOW())
            ON DUPLICATE KEY UPDATE id = id
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertIfAbsent(TrainingCertificate c);

    @Select("""
            SELECT id, person_id AS personId, person_name AS personName,
                   template_key AS templateKey, template_version AS templateVersion,
                   training_id AS trainingId, training_name AS trainingName,
                   occurrence_id AS occurrenceId, enrollment_id AS enrollmentId,
                   training_date AS trainingDate, trainer_name AS trainerName,
                   issued_at AS issuedAt
            FROM training_certificate WHERE person_id = #{personId}
            ORDER BY training_date DESC, id DESC
            """)
    List<TrainingCertificate> listByPerson(@Param("personId") String personId);

    @Select("""
            SELECT id, person_id AS personId, person_name AS personName,
                   template_key AS templateKey, template_version AS templateVersion,
                   training_id AS trainingId, training_name AS trainingName,
                   occurrence_id AS occurrenceId, enrollment_id AS enrollmentId,
                   training_date AS trainingDate, trainer_name AS trainerName,
                   issued_at AS issuedAt
            FROM training_certificate WHERE id = #{id}
            """)
    TrainingCertificate findById(@Param("id") Long id);

    @Select("""
            SELECT COUNT(*) FROM training_certificate
            WHERE enrollment_id = #{enrollmentId} AND template_key = #{templateKey}
            """)
    int exists(@Param("enrollmentId") Long enrollmentId, @Param("templateKey") String templateKey);

    /** 该人所有「审批+评分双通过」的报名 id（补发历史证书用）。 */
    @Select("""
            SELECT e.id FROM training_enrollment e
            WHERE e.trainee_id = #{personId} AND e.test_yn = 1 AND e.test_fraction = 1
            """)
    List<Long> listFullyPassedEnrollmentIds(@Param("personId") String personId);

    @Select("""
            SELECT e.id FROM training_enrollment e WHERE e.id = #{id}
            """)
    Long findEnrollmentId(@Param("id") Long id);
}
