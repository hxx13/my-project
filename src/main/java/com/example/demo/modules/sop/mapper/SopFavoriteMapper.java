package com.example.demo.modules.sop.mapper;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface SopFavoriteMapper {

    /** 按收藏时间倒序：收藏列表要「最近收的在前」，比按 id 排有用 */
    @Select("SELECT document_id FROM sop_favorite WHERE user_id = #{userId} ORDER BY created_at DESC, id DESC")
    List<Long> listDocumentIds(@Param("userId") String userId);

    /**
     * 加收藏。`INSERT IGNORE` 让重复提交幂等 —— 唯一键挡住即可，不必先查后插，
     * 也避免连点两下时第二个请求报主键冲突。
     */
    @Insert("INSERT IGNORE INTO sop_favorite (user_id, document_id) VALUES (#{userId}, #{documentId})")
    int insert(@Param("userId") String userId, @Param("documentId") Long documentId);

    @Delete("DELETE FROM sop_favorite WHERE user_id = #{userId} AND document_id = #{documentId}")
    int delete(@Param("userId") String userId, @Param("documentId") Long documentId);

    /** 文档被删时清掉它的收藏，否则留下永远点不开的孤儿行 */
    @Delete("DELETE FROM sop_favorite WHERE document_id = #{documentId}")
    int deleteByDocumentId(@Param("documentId") Long documentId);
}
