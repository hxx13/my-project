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

    /** 把视频通道挪到监控分类树的某个节点（null = 移出到未分类） */
    int updateVideoCategory(@Param("id") long id, @Param("videoCategoryId") Long videoCategoryId);

    /** 删除节点时把该节点下所有通道移出到未分类 */
    int updateVideoCategoryByNode(@Param("nodeId") long nodeId, @Param("videoCategoryId") Long videoCategoryId);

    /** 设置设备跳转地址（空串 = 清除） */
    int updateLinkUrl(@Param("id") long id, @Param("linkUrl") String linkUrl);

    /** 供种子脚本一次性写入：只填空着的，幂等 */
    int seedLinkUrlIfEmpty(@Param("channelCode") String channelCode, @Param("linkUrl") String linkUrl);

    /** 有多少条通道已经配了跳转地址（用于判断「还要不要播种」） */
    @org.apache.ibatis.annotations.Select(
            "SELECT COUNT(*) FROM dahua_device_channel_cache WHERE link_url IS NOT NULL AND link_url <> ''")
    int countLinkUrls();

    /** 重建分类树前把这些大类的通道退回未分类 */
    int clearVideoCategory(@Param("deviceCategories") List<Integer> deviceCategories);

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

    /** 按设备大类取通道（电视墙通道源：1=视频，45=解码器/电视墙槽位） */
    List<DahuaDeviceChannelCache> listByDeviceCategory(@Param("deviceCategories") List<Integer> deviceCategories);
}
