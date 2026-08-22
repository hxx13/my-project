package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfRegimenLibrary;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_regimen_library` mapper. */
@Mapper
public interface CrfRegimenLibraryMapper {

    @Insert("INSERT INTO crf_regimen_library (immu_code, version, dose_rule, target_range, status, active) VALUES (#{immuCode}, #{version}, #{doseRule}, #{targetRange}, #{status}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfRegimenLibrary row);

    @Select("SELECT * FROM crf_regimen_library WHERE id = #{id}")
    CrfRegimenLibrary findById(Long id);

    @Select("SELECT * FROM crf_regimen_library ORDER BY id DESC")
    List<CrfRegimenLibrary> list();
}
