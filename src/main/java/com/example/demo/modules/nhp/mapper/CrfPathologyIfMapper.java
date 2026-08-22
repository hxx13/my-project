package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfPathologyIf;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_pathology_if` mapper. */
@Mapper
public interface CrfPathologyIfMapper {

    @Insert("INSERT INTO crf_pathology_if (pathology_id, marker_code, deposit) VALUES (#{pathologyId}, #{markerCode}, #{deposit})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfPathologyIf row);

    @Select("SELECT * FROM crf_pathology_if WHERE id = #{id}")
    CrfPathologyIf findById(Long id);

    @Select("SELECT * FROM crf_pathology_if ORDER BY id DESC")
    List<CrfPathologyIf> list();
}
