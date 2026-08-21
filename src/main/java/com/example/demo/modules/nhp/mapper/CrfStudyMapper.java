package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfStudy;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 研究项目 mapper。 */
@Mapper
public interface CrfStudyMapper {

    @Insert("INSERT INTO crf_study (code, name, protocol_version, active) " +
            "VALUES (#{code}, #{name}, #{protocolVersion}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfStudy row);

    @Select("SELECT * FROM crf_study WHERE id = #{id}")
    CrfStudy findById(Long id);

    @Select("SELECT * FROM crf_study WHERE code = #{code}")
    CrfStudy findByCode(String code);

    @Select("SELECT * FROM crf_study WHERE active = 1 ORDER BY id")
    List<CrfStudy> list();
}
