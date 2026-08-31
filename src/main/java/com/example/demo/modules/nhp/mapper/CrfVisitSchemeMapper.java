package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfVisitScheme;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 访视方案 mapper。 */
@Mapper
public interface CrfVisitSchemeMapper {

    @Insert("INSERT INTO crf_visit_scheme (name, description, active) VALUES (#{name}, #{description}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfVisitScheme row);

    @Update("UPDATE crf_visit_scheme SET name = #{name}, description = #{description}, active = #{active} WHERE id = #{id}")
    int update(CrfVisitScheme row);

    @Update("UPDATE crf_visit_scheme SET active = 0 WHERE id = #{id}")
    int softDelete(@Param("id") Long id);

    @Select("SELECT * FROM crf_visit_scheme WHERE id = #{id}")
    CrfVisitScheme findById(Long id);

    @Select("SELECT * FROM crf_visit_scheme WHERE name = #{name} LIMIT 1")
    CrfVisitScheme findByName(String name);

    @Select("SELECT * FROM crf_visit_scheme WHERE active = 1 ORDER BY id")
    List<CrfVisitScheme> list();

    @Select("SELECT COUNT(1) FROM crf_visit WHERE scheme_id = #{schemeId} AND active = 1")
    long countVisitsByScheme(Long schemeId);

    @Select("SELECT COUNT(1) FROM crf_transplant WHERE visit_scheme_id = #{schemeId} AND active = 1")
    long countProjectsByScheme(Long schemeId);

    @Update("UPDATE crf_transplant SET visit_scheme_id = NULL WHERE visit_scheme_id = #{schemeId}")
    int unsetProjectsByScheme(@Param("schemeId") Long schemeId);
}
