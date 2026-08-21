package com.example.demo.modules.agv.mapper;

import com.example.demo.modules.agv.analysis.model.AgvTag;
import org.apache.ibatis.annotations.*;

import java.util.List;
import java.util.Map;

/**
 * AGV 语义标签字典 + 标签显隐状态。
 *
 * <p>标签的改名/删除需要级联到区域的 {@code semantic_tags}，那部分逻辑在
 * {@code AgvTagController} 的 Java 层完成——{@code semantic_tags} 是 JSON 数组，
 * 用 SQL 的 {@code JSON_SEARCH} 定位会把标签名里的 {@code %} / {@code _} 当作
 * 通配符而静默匹配错行，因此改为读出后用 Jackson 精确比对再写回。
 */
@Mapper
public interface AgvTagMapper {

    // ── 标签字典 ──

    @Select("SELECT * FROM agv_tag ORDER BY sort_order, id")
    List<AgvTag> selectAllTags();

    @Select("SELECT * FROM agv_tag WHERE id = #{id}")
    AgvTag selectTagById(Long id);

    @Select("SELECT * FROM agv_tag WHERE name = #{name}")
    AgvTag selectTagByName(String name);

    @Insert("INSERT INTO agv_tag (name, color, scope, robot_ip, builtin, sort_order) " +
            "VALUES (#{name}, #{color}, #{scope}, #{robotIp}, #{builtin}, #{sortOrder})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertTag(AgvTag t);

    /** 内置标签的 name 由 Controller 拦截，不会走到这里被改写 */
    @Update("UPDATE agv_tag SET name=#{name}, color=#{color}, scope=#{scope}, " +
            "robot_ip=#{robotIp}, sort_order=#{sortOrder} WHERE id=#{id}")
    int updateTag(AgvTag t);

    @Delete("DELETE FROM agv_tag WHERE id = #{id} AND builtin = 0")
    int deleteTag(Long id);

    // ── 标签显隐（全局共享，按名引用） ──

    @Select("SELECT robot_ip AS robotIp, tag_name AS tagName FROM agv_tag_hidden")
    List<Map<String, Object>> selectAllHidden();

    @Insert("INSERT IGNORE INTO agv_tag_hidden (robot_ip, tag_name) VALUES (#{robotIp}, #{tagName})")
    int insertHidden(@Param("robotIp") String robotIp, @Param("tagName") String tagName);

    @Delete("DELETE FROM agv_tag_hidden WHERE robot_ip = #{robotIp} AND tag_name = #{tagName}")
    int deleteHidden(@Param("robotIp") String robotIp, @Param("tagName") String tagName);

    @Delete("DELETE FROM agv_tag_hidden WHERE tag_name = #{tagName}")
    int deleteHiddenByTagName(String tagName);

    @Update("UPDATE agv_tag_hidden SET tag_name = #{newName} WHERE tag_name = #{oldName}")
    int renameHiddenTag(@Param("oldName") String oldName, @Param("newName") String newName);

    // ── 区域引用的级联维护 ──
    // 只取/只写 semantic_tags 一列：避免整行回写覆盖并发修改的其他字段。
    // 不过滤 is_active——软删除的区域也要跟着改名，否则恢复后引用就是旧名。

    @Select("SELECT id, semantic_tags AS semanticTags FROM agv_spatial_element WHERE semantic_tags IS NOT NULL")
    List<Map<String, Object>> selectAllZoneTags();

    @Update("UPDATE agv_spatial_element SET semantic_tags = #{semanticTags} WHERE id = #{id}")
    int updateZoneTags(@Param("id") Long id, @Param("semanticTags") String semanticTags);
}
