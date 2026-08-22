package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfVisitInstance;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 访视实例 mapper。 */
@Mapper
public interface CrfVisitInstanceMapper {

    @Insert("INSERT INTO crf_visit_instance (subject_id, visit_id, transplant_id, planned_date, actual_date, status) " +
            "VALUES (#{subjectId}, #{visitId}, #{transplantId}, #{plannedDate}, #{actualDate}, #{status})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfVisitInstance row);

    @Select("SELECT * FROM crf_visit_instance WHERE id = #{id}")
    CrfVisitInstance findById(Long id);

    @Select("SELECT * FROM crf_visit_instance WHERE subject_id = #{subjectId} ORDER BY id")
    List<CrfVisitInstance> listBySubjectId(Long subjectId);

    @Select("SELECT * FROM crf_visit_instance WHERE subject_id = #{subjectId} AND visit_id = #{visitId} " +
            "AND (transplant_id = #{transplantId} OR (#{transplantId} IS NULL AND transplant_id IS NULL)) LIMIT 1")
    CrfVisitInstance findExisting(@Param("subjectId") Long subjectId,
                                  @Param("visitId") Long visitId,
                                  @Param("transplantId") Long transplantId);

    @Update("UPDATE crf_visit_instance SET actual_date = #{actualDate}, status = #{status}, transplant_id = #{transplantId} WHERE id = #{id}")
    int update(CrfVisitInstance row);
}
