package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfDictChangeLog;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 字段字典变更审计 mapper（只追加）。 */
@Mapper
public interface CrfDictChangeLogMapper {

    @Insert("INSERT INTO crf_dict_change_log (entity, entity_id, change_type, before_json, after_json, operator) " +
            "VALUES (#{entity}, #{entityId}, #{changeType}, #{beforeJson}, #{afterJson}, #{operator})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfDictChangeLog row);

    @Select("SELECT * FROM crf_dict_change_log WHERE entity = #{entity} AND entity_id = #{entityId} ORDER BY id DESC")
    List<CrfDictChangeLog> listByEntity(@Param("entity") String entity, @Param("entityId") Long entityId);

    @Select("SELECT * FROM crf_dict_change_log ORDER BY id DESC LIMIT #{limit}")
    List<CrfDictChangeLog> listRecent(@Param("limit") int limit);
}
