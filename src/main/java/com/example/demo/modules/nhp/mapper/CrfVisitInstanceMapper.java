package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfVisitInstance;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 访视实例 mapper。 */
@Mapper
public interface CrfVisitInstanceMapper {

    @Insert("INSERT INTO crf_visit_instance (subject_id, visit_id, planned_date, actual_date, status) " +
            "VALUES (#{subjectId}, #{visitId}, #{plannedDate}, #{actualDate}, #{status})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfVisitInstance row);

    @Select("SELECT * FROM crf_visit_instance WHERE id = #{id}")
    CrfVisitInstance findById(Long id);

    @Select("SELECT * FROM crf_visit_instance WHERE subject_id = #{subjectId} ORDER BY id")
    List<CrfVisitInstance> listBySubjectId(Long subjectId);

    @Update("UPDATE crf_visit_instance SET actual_date = #{actualDate}, status = #{status} WHERE id = #{id}")
    int update(CrfVisitInstance row);
}
