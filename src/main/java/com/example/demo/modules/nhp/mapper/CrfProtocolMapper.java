package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfProtocol;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_protocol` mapper. */
@Mapper
public interface CrfProtocolMapper {

    @Insert("INSERT INTO crf_protocol (protocol_code, version, title, source_doc, active) VALUES (#{protocolCode}, #{version}, #{title}, #{sourceDoc}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfProtocol row);

    @Select("SELECT * FROM crf_protocol WHERE id = #{id}")
    CrfProtocol findById(Long id);

    @Select("SELECT * FROM crf_protocol ORDER BY id DESC")
    List<CrfProtocol> list();
}
