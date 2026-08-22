package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfHeartModule;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_heart_module` mapper. */
@Mapper
public interface CrfHeartModuleMapper {

    @Insert("INSERT INTO crf_heart_module (heart_code, tx_id, graft_type, graft_func_score, echo_ef, status) VALUES (#{heartCode}, #{txId}, #{graftType}, #{graftFuncScore}, #{echoEf}, #{status})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfHeartModule row);

    @Select("SELECT * FROM crf_heart_module WHERE id = #{id}")
    CrfHeartModule findById(Long id);

    @Select("SELECT * FROM crf_heart_module WHERE heart_code = #{heartCode}")
    CrfHeartModule findByCode(String heartCode);

    @Select("SELECT * FROM crf_heart_module ORDER BY id DESC")
    List<CrfHeartModule> list();
}
