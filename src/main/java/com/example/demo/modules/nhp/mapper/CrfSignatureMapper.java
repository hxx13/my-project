package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfSignature;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 电子签名 mapper。 */
@Mapper
public interface CrfSignatureMapper {

    @Insert("INSERT INTO crf_signature (record_id, signer_id, signer_role, meaning, signature_hash) " +
            "VALUES (#{recordId}, #{signerId}, #{signerRole}, #{meaning}, #{signatureHash})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfSignature row);

    @Select("SELECT * FROM crf_signature WHERE id = #{id}")
    CrfSignature findById(Long id);

    @Select("SELECT * FROM crf_signature WHERE record_id = #{recordId} ORDER BY id")
    List<CrfSignature> listByRecordId(Long recordId);
}
