package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfVisitPlan;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 访视编排 mapper。 */
@Mapper
public interface CrfVisitPlanMapper {

    @Insert("INSERT INTO crf_visit_plan (visit_id, atom_id, required, capture_form, sort_order) " +
            "VALUES (#{visitId}, #{atomId}, #{required}, #{captureForm}, #{sortOrder})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfVisitPlan row);

    @Select("SELECT * FROM crf_visit_plan WHERE id = #{id}")
    CrfVisitPlan findById(Long id);

    @Select("SELECT * FROM crf_visit_plan WHERE visit_id = #{visitId} ORDER BY sort_order, id")
    List<CrfVisitPlan> listByVisitId(Long visitId);

    @Select("SELECT * FROM crf_visit_plan ORDER BY visit_id, sort_order, id")
    List<CrfVisitPlan> listAll();

    @Delete("DELETE FROM crf_visit_plan WHERE id = #{id}")
    int deleteById(Long id);

    @Delete("DELETE FROM crf_visit_plan WHERE visit_id = #{visitId}")
    int deleteByVisitId(Long visitId);
}
