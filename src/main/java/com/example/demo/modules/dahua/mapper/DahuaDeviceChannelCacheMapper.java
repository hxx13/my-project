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

    /** 按通道编码取单条缓存（改名需要 ownerCode） */
    DahuaDeviceChannelCache findByChannelCode(@Param("channelCode") String channelCode);

    /** 平台改名成功后同步本地缓存 */
    int updateChannelName(@Param("channelCode") String channelCode, @Param("channelName") String channelName);

    /** 删除分类节点时，把该节点下的通道改挂到父节点（null = 未分类） */
    int reassignRemarkCategory(@Param("fromId") long fromId, @Param("toId") Long toId);

    /** 门禁通道精简列表（种子/授权选择用） */
    List<Map<String, Object>> listDoorChannelsLite();

    /** 把视频通道挪到监控分类树的某个节点（null = 移出到未分类） */
    int updateVideoCategory(@Param("id") long id, @Param("videoCategoryId") Long videoCategoryId);

    /** 删除节点时把该节点下所有通道移出到未分类 */
    int updateVideoCategoryByNode(@Param("nodeId") long nodeId, @Param("videoCategoryId") Long videoCategoryId);

    /** 按通道编码归入分类节点（照平台视频组织树播种用） */
    int updateVideoCategoryByChannelCode(@Param("channelCode") String channelCode,
                                         @Param("videoCategoryId") Long videoCategoryId);

    /** 设置设备跳转地址（空串 = 清除） */
    int updateLinkUrl(@Param("id") long id, @Param("linkUrl") String linkUrl);

    /** 供种子脚本一次性写入：只填空着的，幂等 */
    int seedLinkUrlIfEmpty(@Param("channelCode") String channelCode, @Param("linkUrl") String linkUrl);

    /** 定向修正：仅当当前值仍是旧的错误地址时才改 */
    int fixLinkUrlIfOld(@Param("channelCode") String channelCode,
                        @Param("oldUrl") String oldUrl,
                        @Param("newUrl") String newUrl);

    /** 兜底统计：播种后仍没有地址的真实摄像机通道（排除录像机空槽、解码器、RL 终端） */
    @org.apache.ibatis.annotations.Select(
            "SELECT COUNT(*) FROM dahua_device_channel_cache " +
            "WHERE unit_type = 1 AND (link_url IS NULL OR link_url = '') " +
            "AND channel_name NOT LIKE '%RL%' " +
            "AND channel_name NOT LIKE 'SY-NVR-%' " +
            "AND channel_name NOT LIKE '槽位%' " +
            "AND channel_name NOT LIKE '%解码器%' " +
            "AND channel_name NOT REGEXP '^[0-9]+[.]'")
    int countEmptyVideoLinks();

    /** 通道缓存是否已经有数据；没有就下次再播种，避免启动时缓存还没同步导致永远跳过 */
    @org.apache.ibatis.annotations.Select(
            "SELECT COUNT(*) FROM dahua_device_channel_cache WHERE unit_type = 1")
    int countVideoChannels();

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
