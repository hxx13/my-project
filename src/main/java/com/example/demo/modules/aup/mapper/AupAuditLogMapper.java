package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.AupAuditLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 审计/留痕 mapper 只提供 insert/select，禁 update/delete（只追加）。
 */
@Mapper
public interface AupAuditLogMapper {

    int insert(AupAuditLog log);

    List<AupAuditLog> selectByAupId(@Param("aupId") Long aupId);
}
