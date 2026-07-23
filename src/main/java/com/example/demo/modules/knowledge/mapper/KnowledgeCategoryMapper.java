package com.example.demo.modules.knowledge.mapper;

import com.example.demo.modules.knowledge.entity.KnowledgeCategory;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface KnowledgeCategoryMapper {

    @Select("SELECT * FROM knowledge_categories ORDER BY sort_order ASC, id ASC")
    List<KnowledgeCategory> findAll();

    @Select("SELECT * FROM knowledge_categories WHERE parent_id IS NULL ORDER BY sort_order ASC, id ASC")
    List<KnowledgeCategory> findRoots();

    @Select("SELECT * FROM knowledge_categories WHERE parent_id = #{parentId} ORDER BY sort_order ASC, id ASC")
    List<KnowledgeCategory> findByParentId(Long parentId);

    @Select("SELECT * FROM knowledge_categories WHERE id = #{id}")
    KnowledgeCategory findById(Long id);

    @Select("SELECT * FROM knowledge_categories WHERE slug = #{slug}")
    KnowledgeCategory findBySlug(String slug);

    @Insert("INSERT INTO knowledge_categories (parent_id, name, slug, sort_order, icon, description, created_at, updated_at) " +
            "VALUES (#{parentId}, #{name}, #{slug}, #{sortOrder}, #{icon}, #{description}, NOW(), NOW())")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(KnowledgeCategory category);

    @Update("UPDATE knowledge_categories SET parent_id=#{parentId}, name=#{name}, slug=#{slug}, sort_order=#{sortOrder}, " +
            "icon=#{icon}, description=#{description}, updated_at=NOW() WHERE id=#{id}")
    int update(KnowledgeCategory category);

    @Delete("DELETE FROM knowledge_categories WHERE id=#{id}")
    int deleteById(Long id);

    @Update("UPDATE knowledge_categories SET sort_order=#{sortOrder}, updated_at=NOW() WHERE id=#{id}")
    int updateSortOrder(@Param("id") Long id, @Param("sortOrder") int sortOrder);

    @Select("SELECT COUNT(*) FROM knowledge_pages WHERE category_id=#{categoryId}")
    int countPagesByCategory(Long categoryId);
}
