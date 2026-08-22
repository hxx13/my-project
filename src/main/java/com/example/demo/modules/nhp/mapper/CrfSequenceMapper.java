package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfSequence;
import org.apache.ibatis.annotations.*;

/** NHP 序列 mapper（并发唯一取号，原子递增）。 */
@Mapper
public interface CrfSequenceMapper {

    @Select("SELECT * FROM crf_sequence WHERE id_type = #{idType} AND scope_key = #{scopeKey}")
    CrfSequence findByScope(@Param("idType") String idType, @Param("scopeKey") String scopeKey);

    /** @deprecated 兼容旧调用，请改用 findByScope */
    @Select("SELECT * FROM crf_sequence WHERE id_type = #{idType} AND center_code = #{centerCode} AND year = #{year}")
    CrfSequence findByKey(@Param("idType") String idType, @Param("centerCode") String centerCode, @Param("year") Integer year);

    @Insert("INSERT INTO crf_sequence (id_type, scope_key, center_code, year, next_value) " +
            "VALUES (#{idType}, #{scopeKey}, #{centerCode}, #{year}, #{nextValue})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfSequence row);

    @Update("UPDATE crf_sequence SET next_value = next_value + 1 WHERE id_type = #{idType} AND scope_key = #{scopeKey}")
    int incrementByScope(@Param("idType") String idType, @Param("scopeKey") String scopeKey);

    /** @deprecated 兼容旧调用 */
    @Update("UPDATE crf_sequence SET next_value = next_value + 1 WHERE id_type = #{idType} AND center_code = #{centerCode} AND year = #{year}")
    int increment(@Param("idType") String idType, @Param("centerCode") String centerCode, @Param("year") Integer year);
}
