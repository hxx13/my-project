package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfRegimen;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_regimen` mapper. */
@Mapper
public interface CrfRegimenMapper {

    @Insert("INSERT INTO crf_regimen (regimen_code, tx_id, immu_code, immu_version, regimen_phase, regimen_start, change_reason, status) VALUES (#{regimenCode}, #{txId}, #{immuCode}, #{immuVersion}, #{regimenPhase}, #{regimenStart}, #{changeReason}, #{status})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfRegimen row);

    @Select("SELECT * FROM crf_regimen WHERE id = #{id}")
    CrfRegimen findById(Long id);

    @Select("SELECT * FROM crf_regimen WHERE regimen_code = #{regimenCode}")
    CrfRegimen findByCode(String regimenCode);

    @Select("SELECT * FROM crf_regimen ORDER BY id DESC")
    List<CrfRegimen> list();
}
