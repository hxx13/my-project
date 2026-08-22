package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfTimepointMap;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 时点归一化映射 mapper。 */
@Mapper
public interface CrfTimepointMapMapper {

    @Insert("INSERT INTO crf_timepoint_map (raw_value, event_anchor, frequency, tp_code, domain) " +
            "VALUES (#{rawValue}, #{eventAnchor}, #{frequency}, #{tpCode}, #{domain})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfTimepointMap row);

    @Select("SELECT * FROM crf_timepoint_map WHERE raw_value = #{rawValue} AND domain = #{domain} LIMIT 1")
    CrfTimepointMap findByRawAndDomain(@Param("rawValue") String rawValue, @Param("domain") String domain);

    @Select("SELECT * FROM crf_timepoint_map WHERE domain = #{domain} ORDER BY raw_value")
    List<CrfTimepointMap> listByDomain(String domain);

    @Select("SELECT * FROM crf_timepoint_map ORDER BY domain, raw_value")
    List<CrfTimepointMap> listAll();

    @Select("SELECT COUNT(1) FROM crf_timepoint_map")
    int countAll();
}
