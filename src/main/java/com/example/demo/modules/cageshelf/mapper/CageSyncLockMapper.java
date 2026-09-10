package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageSyncLock;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 笼位同步保护锁 Mapper（由 @MapperScan 扫描）。 */
public interface CageSyncLockMapper {
    int insert(CageSyncLock row);
    int deleteByScope(@Param("scopeType") String scopeType, @Param("scopeKey") String scopeKey);
    List<CageSyncLock> listAll();
}
