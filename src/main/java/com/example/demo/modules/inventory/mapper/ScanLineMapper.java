package com.example.demo.modules.inventory.mapper;

import com.example.demo.modules.inventory.entity.InvScanLine;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface ScanLineMapper {
    int insert(InvScanLine line);
    List<InvScanLine> selectBySessionId(@Param("sessionId") Long sessionId);
    int deleteBySessionId(@Param("sessionId") Long sessionId);
    InvScanLine selectBySessionAndCode(@Param("sessionId") Long sessionId, @Param("rfidCode") String rfidCode);
}
