package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageTransferLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageTransferLogMapper {

    int insert(CageTransferLog log);

    List<CageTransferLog> selectByFrom(@Param("animalCageId") Long animalCageId);

    List<CageTransferLog> selectByTo(@Param("animalCageId") Long animalCageId);

    List<CageTransferLog> selectByOccupant(@Param("occupantId") Long occupantId);

    List<CageTransferLog> selectByCage(@Param("animalCageId") Long animalCageId);

    /** 留痕页：按笼位分页查（eventType 可选过滤） */
    List<CageTransferLog> pageByCage(@Param("animalCageId") Long animalCageId,
                                     @Param("eventType") String eventType,
                                     @Param("offset") int offset,
                                     @Param("limit") int limit);

    int countByCage(@Param("animalCageId") Long animalCageId,
                    @Param("eventType") String eventType);

    /** 留痕页：按占用者分页查（eventType 可选过滤） */
    List<CageTransferLog> pageByOccupant(@Param("occupantId") Long occupantId,
                                         @Param("eventType") String eventType,
                                         @Param("offset") int offset,
                                         @Param("limit") int limit);

    int countByOccupant(@Param("occupantId") Long occupantId,
                        @Param("eventType") String eventType);
}
