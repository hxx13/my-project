package com.example.demo.modules.twin.scan.delay.mapper;

import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TwinScanDelayRequestMapper {
    int insert(TwinScanDelayRequest row);

    TwinScanDelayRequest findById(@Param("id") Long id);

    int updateStatus(
            @Param("id") Long id,
            @Param("status") String status,
            @Param("reviewedBy") String reviewedBy,
            @Param("rejectReason") String rejectReason
    );

    List<TwinScanDelayRequest> listPendingByReviewer(@Param("reviewerUserId") String reviewerUserId, @Param("limit") int limit);
}
