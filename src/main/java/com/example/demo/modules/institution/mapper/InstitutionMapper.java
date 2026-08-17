package com.example.demo.modules.institution.mapper;

import com.example.demo.modules.institution.entity.Institution;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface InstitutionMapper {

    @Select("SELECT * FROM institution WHERE active = 1 ORDER BY sort_order ASC, id ASC")
    List<Institution> listActive();

    @Select("SELECT * FROM institution ORDER BY sort_order ASC, id ASC")
    List<Institution> listAll();

    @Select("SELECT * FROM institution WHERE id = #{id}")
    Institution findById(@Param("id") Long id);

    @Select("SELECT * FROM institution WHERE code = #{code} LIMIT 1")
    Institution findByCode(@Param("code") String code);

    @Insert("INSERT INTO institution(code, name, type, sort_order, active) VALUES(#{code}, #{name}, #{type}, #{sortOrder}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(Institution inst);

    @Update("UPDATE institution SET name=#{name}, type=#{type}, sort_order=#{sortOrder}, active=#{active} WHERE id=#{id}")
    int update(Institution inst);

    @Delete("DELETE FROM institution WHERE id=#{id}")
    int deleteById(@Param("id") Long id);
}
