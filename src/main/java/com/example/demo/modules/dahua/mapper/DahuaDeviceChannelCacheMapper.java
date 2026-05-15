package com.example.demo.modules.dahua.mapper;

import com.example.demo.modules.dahua.entity.DahuaDeviceChannelCache;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface DahuaDeviceChannelCacheMapper {
    int upsert(DahuaDeviceChannelCache item);

    int updateRemarkCategory(@Param("id") long id, @Param("remarkCategoryId") Long remarkCategoryId);

    List<DahuaDeviceChannelCache> list(@Param("keyword") String keyword,
                                       @Param("channelType") String channelType,
                                       @Param("ownerCode") String ownerCode,
                                       @Param("unitType") Integer unitType,
                                       @Param("remarkCategoryId") Long remarkCategoryId,
                                       @Param("unassignedOnly") Boolean unassignedOnly,
                                       @Param("offset") int offset,
                                       @Param("pageSize") int pageSize);

    int count(@Param("keyword") String keyword,
              @Param("channelType") String channelType,
              @Param("ownerCode") String ownerCode,
              @Param("unitType") Integer unitType,
              @Param("remarkCategoryId") Long remarkCategoryId,
              @Param("unassignedOnly") Boolean unassignedOnly);

    List<String> distinctChannelTypes();

    List<String> distinctOwnerCodes();

    List<Integer> distinctUnitTypes();

    List<Map<String, Object>> statsByChannelType();

    List<Map<String, Object>> statsByOwnerCode();

    List<Map<String, Object>> statsByUnitType();

    List<Map<String, Object>> selectChannelNamesByCodes(@Param("codes") List<String> codes);
}
