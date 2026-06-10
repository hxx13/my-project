package com.example.demo.modules.knowledge.mapper;

import com.example.demo.modules.knowledge.entity.KnowledgePage;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface KnowledgePageMapper {

    @Select("SELECT * FROM knowledge_pages WHERE id=#{id}")
    KnowledgePage findById(Long id);

    @Select("SELECT * FROM knowledge_pages WHERE category_id=#{categoryId} AND slug=#{slug}")
    KnowledgePage findByCategoryAndSlug(@Param("categoryId") Long categoryId, @Param("slug") String slug);

    @Select("SELECT * FROM knowledge_pages WHERE category_id=#{categoryId} ORDER BY title ASC")
    List<KnowledgePage> findByCategory(Long categoryId);

    @Select("SELECT * FROM knowledge_pages WHERE title LIKE CONCAT('%', #{q}, '%') OR content_html LIKE CONCAT('%', #{q}, '%') OR content_md LIKE CONCAT('%', #{q}, '%') ORDER BY updated_at DESC")
    List<KnowledgePage> search(@Param("q") String q);

    @Select("SELECT * FROM knowledge_pages WHERE (title LIKE CONCAT('%', #{q}, '%') OR content_html LIKE CONCAT('%', #{q}, '%') OR content_md LIKE CONCAT('%', #{q}, '%')) AND category_id=#{categoryId} ORDER BY updated_at DESC")
    List<KnowledgePage> searchByCategory(@Param("q") String q, @Param("categoryId") Long categoryId);

    @Insert("INSERT INTO knowledge_pages (category_id, slug, title, content_html, content_md, source, version, author, is_published, created_at, updated_at) " +
            "VALUES (#{categoryId}, #{slug}, #{title}, #{contentHtml}, #{contentMd}, #{source}, #{version}, #{author}, #{isPublished}, NOW(), NOW())")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(KnowledgePage page);

    @Update("UPDATE knowledge_pages SET title=#{title}, slug=#{slug}, content_html=#{contentHtml}, content_md=#{contentMd}, " +
            "version=#{version}, author=#{author}, is_published=#{isPublished}, updated_at=NOW() WHERE id=#{id}")
    int update(KnowledgePage page);

    @Delete("DELETE FROM knowledge_pages WHERE id=#{id}")
    int deleteById(Long id);

    @Select("SELECT COUNT(*) FROM knowledge_pages WHERE category_id=#{categoryId} AND slug=#{slug}")
    int countByCategoryAndSlug(@Param("categoryId") Long categoryId, @Param("slug") String slug);

    @Select("SELECT * FROM knowledge_pages ORDER BY updated_at DESC")
    List<KnowledgePage> findAll();

    @Select("SELECT * FROM knowledge_pages WHERE title=#{title} LIMIT 1")
    KnowledgePage findByTitle(String title);

    // findByCategoryId is a convenience alias for findByCategory
    default List<KnowledgePage> findByCategoryId(Long categoryId) {
        return findByCategory(categoryId);
    }
}
