package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfIdRule;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP ID 编码规则 mapper。 */
@Mapper
public interface CrfIdRuleMapper {

    @Insert("INSERT INTO crf_id_rule (id_type, pattern, derived, center_code, active) " +
            "VALUES (#{idType}, #{pattern}, #{derived}, #{centerCode}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfIdRule row);

    @Select("SELECT * FROM crf_id_rule WHERE id = #{id}")
    CrfIdRule findById(Long id);

    @Select("SELECT * FROM crf_id_rule WHERE id_type = #{idType} AND active = 1")
    List<CrfIdRule> listByType(String idType);

    @Select("SELECT * FROM crf_id_rule WHERE active = 1 ORDER BY id_type, id")
    List<CrfIdRule> listActive();

    @Select("SELECT * FROM crf_id_rule ORDER BY id_type, id")
    List<CrfIdRule> list();

    @Update("UPDATE crf_id_rule SET pattern = #{pattern}, derived = #{derived} WHERE id = #{id}")
    int updatePatternAndDerived(CrfIdRule row);
}
