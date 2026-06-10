package com.example.demo.modules.knowledge.mapper;

import com.example.demo.modules.knowledge.entity.KnowledgeHistory;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface KnowledgeHistoryMapper {

    @Select("SELECT * FROM knowledge_history WHERE page_id=#{pageId} ORDER BY version DESC")
    List<KnowledgeHistory> findByPageId(Long pageId);

    @Select("SELECT * FROM knowledge_history WHERE page_id=#{pageId} AND version=#{version}")
    KnowledgeHistory findByPageAndVersion(@Param("pageId") Long pageId, @Param("version") int version);

    @Insert("INSERT INTO knowledge_history (page_id, version, content_html, content_md, author, summary, created_at) " +
            "VALUES (#{pageId}, #{version}, #{contentHtml}, #{contentMd}, #{author}, #{summary}, NOW())")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(KnowledgeHistory history);

    @Delete("DELETE FROM knowledge_history WHERE page_id = #{pageId}")
    int deleteByPageId(Long pageId);
}
