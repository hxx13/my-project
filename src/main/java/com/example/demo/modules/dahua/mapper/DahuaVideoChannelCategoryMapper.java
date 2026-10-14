package com.example.demo.modules.dahua.mapper;

import com.example.demo.modules.dahua.entity.DahuaVideoChannelCategory;
import org.apache.ibatis.annotations.*;

import java.util.List;
import java.util.Map;

/** 监控分类树节点（独立于门禁的 {@link DahuaDeviceChannelRemarkCategoryMapper}）。 */
@Mapper
public interface DahuaVideoChannelCategoryMapper {

    @Select("""
            SELECT id, parent_id AS parentId, name, sort_order AS sortOrder,
                   DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
            FROM dahua_video_channel_category
            ORDER BY parent_id, sort_order, id
            """)
    List<DahuaVideoChannelCategory> listAll();

    @Select("SELECT id, parent_id AS parentId, name, sort_order AS sortOrder FROM dahua_video_channel_category WHERE id = #{id}")
    DahuaVideoChannelCategory findById(@Param("id") long id);

    /** 同父下同名唯一（唯一键 uk_dvcc_parent_name 兜底） */
    @Select("SELECT id FROM dahua_video_channel_category WHERE parent_id = #{parentId} AND name = #{name}")
    Long findIdByParentAndName(@Param("parentId") long parentId, @Param("name") String name);

    @Insert("""
            INSERT INTO dahua_video_channel_category (parent_id, name, sort_order)
            VALUES (#{parentId}, #{name}, #{sortOrder})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(DahuaVideoChannelCategory row);

    @Update("UPDATE dahua_video_channel_category SET name = #{name} WHERE id = #{id}")
    int updateName(@Param("id") long id, @Param("name") String name);

    @Update("UPDATE dahua_video_channel_category SET sort_order = #{sortOrder} WHERE id = #{id}")
    int updateSort(@Param("id") long id, @Param("sortOrder") int sortOrder);

    @Delete("DELETE FROM dahua_video_channel_category WHERE id = #{id}")
    int deleteById(@Param("id") long id);

    /** 重建骨架前清空整表 */
    @Delete("DELETE FROM dahua_video_channel_category")
    int deleteAll();

    /** 每个节点直挂的通道数（仅视频大类） */
    @Select("""
            SELECT video_category_id AS nodeId, COUNT(*) AS cnt
            FROM dahua_device_channel_cache
            WHERE device_category = 1 AND video_category_id IS NOT NULL
            GROUP BY video_category_id
            """)
    List<Map<String, Object>> countChannelsByNode();
}
