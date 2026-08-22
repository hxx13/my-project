package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfOutcome;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_outcome` mapper. */
@Mapper
public interface CrfOutcomeMapper {

    @Insert("INSERT INTO crf_outcome (tx_id, survival_days, endpoint_type, endpoint_cause, necropsy_status, tissue_archive, lock_date) VALUES (#{txId}, #{survivalDays}, #{endpointType}, #{endpointCause}, #{necropsyStatus}, #{tissueArchive}, #{lockDate})")
    int insert(CrfOutcome row);

    @Select("SELECT * FROM crf_outcome WHERE tx_id = #{txId}")
    CrfOutcome findById(Long txId);

    @Select("SELECT * FROM crf_outcome ORDER BY tx_id DESC")
    List<CrfOutcome> list();
}
