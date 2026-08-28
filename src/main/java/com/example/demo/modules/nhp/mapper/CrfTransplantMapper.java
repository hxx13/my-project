package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfTransplant;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_transplant` mapper. */
@Mapper
public interface CrfTransplantMapper {

    @Insert("INSERT INTO crf_transplant (tx_code, project_name, remark, team_id, visit_scheme_id, donor_subject_id, recipient_subject_id, xm_id, tx_organ, procedure_type, tx_date, cold_ischemia_min, warm_ischemia_min, reperfusion_time, induction_regimen, maintenance_regimen, parent_tx_id, status, created_by, active) VALUES (#{txCode}, #{projectName}, #{remark}, #{teamId}, #{visitSchemeId}, #{donorSubjectId}, #{recipientSubjectId}, #{xmId}, #{txOrgan}, #{procedureType}, #{txDate}, #{coldIschemiaMin}, #{warmIschemiaMin}, #{reperfusionTime}, #{inductionRegimen}, #{maintenanceRegimen}, #{parentTxId}, #{status}, #{createdBy}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfTransplant row);

    @Select("SELECT * FROM crf_transplant WHERE id = #{id}")
    CrfTransplant findById(Long id);

    @Delete("DELETE FROM crf_transplant WHERE id = #{id}")
    int deleteById(Long id);

    @Select("SELECT * FROM crf_transplant WHERE tx_code = #{txCode}")
    CrfTransplant findByCode(String txCode);

    @Select("SELECT * FROM crf_transplant ORDER BY id DESC")
    List<CrfTransplant> list();

    @Select("SELECT * FROM crf_transplant WHERE recipient_subject_id = #{subjectId} OR donor_subject_id = #{subjectId} " +
            "ORDER BY tx_date DESC, id DESC")
    List<CrfTransplant> listBySubjectId(Long subjectId);

    @Update("UPDATE crf_transplant SET tx_code = #{txCode}, project_name = #{projectName}, remark = #{remark}, " +
            "team_id = #{teamId}, visit_scheme_id = #{visitSchemeId}, current_tp = #{currentTp}, stage_lock = #{stageLock}, donor_subject_id = #{donorSubjectId}, " +
            "recipient_subject_id = #{recipientSubjectId}, xm_id = #{xmId}, tx_date = #{txDate}, " +
            "tx_organ = #{txOrgan}, procedure_type = #{procedureType}, " +
            "status = #{status}, lifecycle_stage = #{lifecycleStage} WHERE id = #{id}")
    int update(CrfTransplant row);
}
