package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfCenter;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 中心/机构 mapper。 */
@Mapper
public interface CrfCenterMapper {

    @Insert("INSERT INTO crf_center (code, name, active) VALUES (#{code}, #{name}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfCenter row);

    @Select("SELECT * FROM crf_center WHERE id = #{id}")
    CrfCenter findById(Long id);

    @Select("SELECT * FROM crf_center WHERE code = #{code}")
    CrfCenter findByCode(String code);

    @Select("SELECT * FROM crf_center WHERE active = 1 ORDER BY id")
    List<CrfCenter> list();
}
