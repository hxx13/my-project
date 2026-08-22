package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfDrugLevel;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_drug_level` mapper. */
@Mapper
public interface CrfDrugLevelMapper {

    @Insert("INSERT INTO crf_drug_level (level_code, regimen_id, tx_id, drug_code, trough_level, target_range, adj_event, status) VALUES (#{levelCode}, #{regimenId}, #{txId}, #{drugCode}, #{troughLevel}, #{targetRange}, #{adjEvent}, #{status})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfDrugLevel row);

    @Select("SELECT * FROM crf_drug_level WHERE id = #{id}")
    CrfDrugLevel findById(Long id);

    @Select("SELECT * FROM crf_drug_level WHERE level_code = #{levelCode}")
    CrfDrugLevel findByCode(String levelCode);

    @Select("SELECT * FROM crf_drug_level ORDER BY id DESC")
    List<CrfDrugLevel> list();
}
