package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfSequence;
import org.apache.ibatis.annotations.*;

/** NHP 序列 mapper（并发唯一取号，原子递增）。 */
@Mapper
public interface CrfSequenceMapper {

    @Select("SELECT * FROM crf_sequence WHERE id_type = #{idType} AND center_code = #{centerCode} AND year = #{year}")
    CrfSequence findByKey(@Param("idType") String idType, @Param("centerCode") String centerCode, @Param("year") Integer year);

    @Insert("INSERT INTO crf_sequence (id_type, center_code, year, next_value) VALUES (#{idType}, #{centerCode}, #{year}, #{nextValue})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfSequence row);

    /** 原子递增并返回当前值（MySQL 单条 UPDATE 自带行锁，防并发重号）。 */
    @Update("UPDATE crf_sequence SET next_value = next_value + 1 WHERE id_type = #{idType} AND center_code = #{centerCode} AND year = #{year}")
    int increment(@Param("idType") String idType, @Param("centerCode") String centerCode, @Param("year") Integer year);
}
