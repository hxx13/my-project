package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryWatchlistBundleRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TelemetryWatchlistBundleMapper {

    List<TelemetryWatchlistBundleRow> selectAllOrderByUpdated();

    TelemetryWatchlistBundleRow selectByCode(@Param("code") String code);

    TelemetryWatchlistBundleRow selectActive();

    int insert(TelemetryWatchlistBundleRow row);

    int updateMetaById(@Param("id") Long id,
                       @Param("displayName") String displayName,
                       @Param("sourceFilename") String sourceFilename);

    int updateMetaByCode(@Param("code") String code,
                         @Param("displayName") String displayName,
                         @Param("sourceFilename") String sourceFilename);

    int clearAllActive();

    int setActiveByCode(@Param("code") String code);

    int updatePollEnabledByCode(@Param("code") String code, @Param("includeInWinccPoll") int includeInWinccPoll);

    int deleteById(@Param("id") Long id);
}
