package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfPathologyIhc;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_pathology_ihc` mapper. */
@Mapper
public interface CrfPathologyIhcMapper {

    @Insert("INSERT INTO crf_pathology_ihc (pathology_id, marker_code, panel_version, result) VALUES (#{pathologyId}, #{markerCode}, #{panelVersion}, #{result})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfPathologyIhc row);

    @Select("SELECT * FROM crf_pathology_ihc WHERE id = #{id}")
    CrfPathologyIhc findById(Long id);

    @Select("SELECT * FROM crf_pathology_ihc ORDER BY id DESC")
    List<CrfPathologyIhc> list();
}
