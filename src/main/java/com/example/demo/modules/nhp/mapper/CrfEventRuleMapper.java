package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfEventRule;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 事件规则 mapper。 */
@Mapper
public interface CrfEventRuleMapper {

    @Insert("INSERT INTO crf_event_rule (source_atom, trigger_on, trigger_cond, action, action_spec, sort_order, active) " +
            "VALUES (#{sourceAtom}, #{triggerOn}, #{triggerCond}, #{action}, #{actionSpec}, #{sortOrder}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfEventRule row);

    @Select("SELECT * FROM crf_event_rule WHERE id = #{id}")
    CrfEventRule findById(Long id);

    @Select("SELECT * FROM crf_event_rule WHERE active = 1 ORDER BY sort_order, id")
    List<CrfEventRule> listActive();

    @Select("SELECT * FROM crf_event_rule ORDER BY sort_order, id")
    List<CrfEventRule> listAll();

    @Select("SELECT * FROM crf_event_rule WHERE active = 1 AND source_atom = #{sourceAtom} ORDER BY sort_order, id")
    List<CrfEventRule> listBySourceAtom(String sourceAtom);

    @Update("UPDATE crf_event_rule SET trigger_on = #{triggerOn}, trigger_cond = #{triggerCond}, action = #{action}, " +
            "action_spec = #{actionSpec}, sort_order = #{sortOrder}, active = #{active} WHERE id = #{id}")
    int update(CrfEventRule row);
}
