package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfValidationRule;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 字段级校验规则 mapper。 */
@Mapper
public interface CrfValidationRuleMapper {

    @Insert("INSERT INTO crf_validation_rule (field_id, rule_type, severity, expression, message, active) " +
            "VALUES (#{fieldId}, #{ruleType}, #{severity}, #{expression}, #{message}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfValidationRule row);

    @Select("SELECT * FROM crf_validation_rule WHERE id = #{id}")
    CrfValidationRule findById(Long id);

    @Select("SELECT * FROM crf_validation_rule WHERE field_id = #{fieldId} AND active = 1")
    List<CrfValidationRule> listByFieldId(Long fieldId);

    @Delete("DELETE FROM crf_validation_rule WHERE id = #{id}")
    int deleteById(Long id);
}
