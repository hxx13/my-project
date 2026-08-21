package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfVisit;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 访视/时点定义 mapper。 */
@Mapper
public interface CrfVisitMapper {

    @Insert("INSERT INTO crf_visit (code, name, seq, repeating, planned_days, early_days, late_days, active) " +
            "VALUES (#{code}, #{name}, #{seq}, #{repeating}, #{plannedDays}, #{earlyDays}, #{lateDays}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfVisit row);

    @Select("SELECT * FROM crf_visit WHERE id = #{id}")
    CrfVisit findById(Long id);

    @Select("SELECT * FROM crf_visit WHERE code = #{code}")
    CrfVisit findByCode(String code);

    @Select("SELECT * FROM crf_visit WHERE active = 1 ORDER BY seq")
    List<CrfVisit> list();
}
