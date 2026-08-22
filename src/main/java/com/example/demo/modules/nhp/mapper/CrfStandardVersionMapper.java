package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfStandardVersion;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_standard_version` mapper. */
@Mapper
public interface CrfStandardVersionMapper {

    @Insert("INSERT INTO crf_standard_version (standard_code, object_ref, version, version_note, active) VALUES (#{standardCode}, #{objectRef}, #{version}, #{versionNote}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfStandardVersion row);

    @Select("SELECT * FROM crf_standard_version WHERE id = #{id}")
    CrfStandardVersion findById(Long id);

    @Select("SELECT * FROM crf_standard_version ORDER BY id DESC")
    List<CrfStandardVersion> list();
}
