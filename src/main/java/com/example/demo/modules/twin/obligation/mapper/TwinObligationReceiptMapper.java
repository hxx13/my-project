package com.example.demo.modules.twin.obligation.mapper;

import com.example.demo.modules.twin.obligation.entity.TwinObligationReceipt;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TwinObligationReceiptMapper {
    int insertIgnore(TwinObligationReceipt row);

    TwinObligationReceipt selectByObligationAndSubject(
            @Param("obligationId") long obligationId,
            @Param("subjectUserId") String subjectUserId);

    int deleteByObligationId(@Param("obligationId") long obligationId);
}
