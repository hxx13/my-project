package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfMedication;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_medication` mapper. */
@Mapper
public interface CrfMedicationMapper {

    @Insert("INSERT INTO crf_medication (med_code, regimen_id, anesthesia_id, drug_code, dose_value, dose_unit, route, dose_time, missed_flag, status) VALUES (#{medCode}, #{regimenId}, #{anesthesiaId}, #{drugCode}, #{doseValue}, #{doseUnit}, #{route}, #{doseTime}, #{missedFlag}, #{status})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfMedication row);

    @Select("SELECT * FROM crf_medication WHERE id = #{id}")
    CrfMedication findById(Long id);

    @Select("SELECT * FROM crf_medication WHERE med_code = #{medCode}")
    CrfMedication findByCode(String medCode);

    @Select("SELECT * FROM crf_medication ORDER BY id DESC")
    List<CrfMedication> list();
}
