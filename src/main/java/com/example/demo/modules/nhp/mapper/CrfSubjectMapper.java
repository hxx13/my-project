package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfSubject;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 研究对象 mapper。 */
@Mapper
public interface CrfSubjectMapper {

    @Insert("INSERT INTO crf_subject (study_id, subject_type, subject_code, center_id, dag_id, basic_json, " +
            "sex, birth_date, species, breed, weight_kg, age_years, external_id, microchip_id, farm_code, " +
            "origin_note, biocontainment_level, pedigree, status, lifecycle_stage, arm_code) " +
            "VALUES (#{studyId}, #{subjectType}, #{subjectCode}, #{centerId}, #{dagId}, #{basicJson}, " +
            "#{sex}, #{birthDate}, #{species}, #{breed}, #{weightKg}, #{ageYears}, #{externalId}, #{microchipId}, #{farmCode}, " +
            "#{originNote}, #{biocontainmentLevel}, #{pedigree}, #{status}, #{lifecycleStage}, #{armCode})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfSubject row);

    @Select("SELECT * FROM crf_subject WHERE id = #{id}")
    CrfSubject findById(Long id);

    @Select("SELECT * FROM crf_subject WHERE subject_code = #{subjectCode}")
    CrfSubject findBySubjectCode(String subjectCode);

    @Select("SELECT * FROM crf_subject WHERE status = 'ACTIVE' ORDER BY id DESC")
    List<CrfSubject> list();

    @Select("<script>SELECT * FROM crf_subject WHERE 1=1 " +
            "<if test='subjectType != null'>AND subject_type = #{subjectType}</if> " +
            "<choose>" +
            "  <when test='status != null'>AND status = #{status}</when>" +
            "  <otherwise>AND status &lt;&gt; 'RETIRED'</otherwise>" +
            "</choose> " +
            "<if test='q != null'>AND (subject_code LIKE CONCAT('%', #{q}, '%') " +
            "OR CAST(id AS CHAR) LIKE CONCAT('%', #{q}, '%') " +
            "OR IFNULL(external_id,'') LIKE CONCAT('%', #{q}, '%') " +
            "OR IFNULL(microchip_id,'') LIKE CONCAT('%', #{q}, '%') " +
            "OR IFNULL(farm_code,'') LIKE CONCAT('%', #{q}, '%'))</if> " +
            "ORDER BY id DESC LIMIT #{limit} OFFSET #{offset}</script>")
    List<CrfSubject> listPaged(@Param("subjectType") String subjectType,
                               @Param("status") String status,
                               @Param("q") String q,
                               @Param("offset") int offset,
                               @Param("limit") int limit);

    @Select("<script>SELECT COUNT(1) FROM crf_subject WHERE 1=1 " +
            "<if test='subjectType != null'>AND subject_type = #{subjectType}</if> " +
            "<choose>" +
            "  <when test='status != null'>AND status = #{status}</when>" +
            "  <otherwise>AND status &lt;&gt; 'RETIRED'</otherwise>" +
            "</choose> " +
            "<if test='q != null'>AND (subject_code LIKE CONCAT('%', #{q}, '%') " +
            "OR CAST(id AS CHAR) LIKE CONCAT('%', #{q}, '%') " +
            "OR IFNULL(external_id,'') LIKE CONCAT('%', #{q}, '%') " +
            "OR IFNULL(microchip_id,'') LIKE CONCAT('%', #{q}, '%') " +
            "OR IFNULL(farm_code,'') LIKE CONCAT('%', #{q}, '%'))</if></script>")
    long countPaged(@Param("subjectType") String subjectType,
                    @Param("status") String status,
                    @Param("q") String q);

    @Update("UPDATE crf_subject SET subject_code = #{subjectCode}, basic_json = #{basicJson}, status = #{status}, " +
            "center_id = #{centerId}, dag_id = #{dagId}, " +
            "sex = #{sex}, birth_date = #{birthDate}, species = #{species}, breed = #{breed}, " +
            "weight_kg = #{weightKg}, age_years = #{ageYears}, external_id = #{externalId}, microchip_id = #{microchipId}, " +
            "farm_code = #{farmCode}, origin_note = #{originNote}, biocontainment_level = #{biocontainmentLevel}, " +
            "pedigree = #{pedigree}, lifecycle_stage = #{lifecycleStage}, arm_code = #{armCode} WHERE id = #{id}")
    int update(CrfSubject row);

    @Update("UPDATE crf_subject SET lifecycle_stage = #{lifecycleStage} WHERE id = #{id}")
    int updateLifecycleStage(@Param("id") Long id, @Param("lifecycleStage") String lifecycleStage);

    @Update("UPDATE crf_subject SET status = #{status} WHERE id = #{id}")
    int updateStatus(@Param("id") Long id, @Param("status") String status);
}
