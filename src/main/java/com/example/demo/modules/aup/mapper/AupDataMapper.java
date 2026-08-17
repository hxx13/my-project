package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.AupData;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AupDataMapper {

    int insert(AupData data);

    AupData selectByAupId(@Param("aupId") Long aupId);

    /** 草稿保存 CAS：WHERE aup_id AND version 匹配，0 行即并发冲突（409） */
    int updateCas(@Param("aupId") Long aupId,
                  @Param("data") String data,
                  @Param("expectedVersion") Long expectedVersion,
                  @Param("updatedBy") String updatedBy);
}
