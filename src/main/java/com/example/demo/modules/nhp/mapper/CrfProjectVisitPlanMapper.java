package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfProjectVisitPlan;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_project_visit_plan` mapper（项目级编排，与全局 crf_visit_plan 独立）。 */
@Mapper
public interface CrfProjectVisitPlanMapper {

    @Insert("INSERT INTO crf_project_visit_plan (transplant_id, visit_id, atom_id, required, capture_form, sort_order) " +
            "VALUES (#{transplantId}, #{visitId}, #{atomId}, #{required}, #{captureForm}, #{sortOrder})")
    int insert(CrfProjectVisitPlan row);

    @Select("SELECT * FROM crf_project_visit_plan WHERE transplant_id = #{transplantId} ORDER BY visit_id, sort_order, id")
    List<CrfProjectVisitPlan> listByTransplantId(Long transplantId);

    @Select("SELECT * FROM crf_project_visit_plan WHERE transplant_id = #{transplantId} AND visit_id = #{visitId} ORDER BY sort_order, id")
    List<CrfProjectVisitPlan> listByVisitId(@Param("transplantId") Long transplantId, @Param("visitId") Long visitId);

    @Delete("DELETE FROM crf_project_visit_plan WHERE transplant_id = #{transplantId} AND visit_id = #{visitId}")
    int deleteByVisitId(@Param("transplantId") Long transplantId, @Param("visitId") Long visitId);

    @Delete("DELETE FROM crf_project_visit_plan WHERE transplant_id = #{transplantId}")
    int deleteByTransplantId(Long transplantId);
}
