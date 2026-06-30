package com.example.demo.modules.twin.scan.mapper;

import com.example.demo.modules.twin.scan.entity.TwinScanNoticeAutoSuppress;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface TwinScanNoticeAutoSuppressMapper {

    List<TwinScanNoticeAutoSuppress> selectByTargetUserId(@Param("targetUserId") String targetUserId);

    int upsert(TwinScanNoticeAutoSuppress row);

    int deleteByNoticeKindAndRecordId(
            @Param("noticeKind") String noticeKind,
            @Param("recordId") long recordId
    );

    int countByNoticeKindAndRecordId(
            @Param("noticeKind") String noticeKind,
            @Param("recordId") long recordId
    );

    int exists(
            @Param("targetUserId") String targetUserId,
            @Param("noticeKind") String noticeKind,
            @Param("recordId") long recordId
    );
}
