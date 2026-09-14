package com.example.demo.modules.sop.mapper;

import com.example.demo.modules.sop.entity.SopDocument;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface SopDocumentMapper {

    String SELECT_WITH_FILE = """
            SELECT d.id, d.node_id AS nodeId, d.file_id AS fileId, d.title, d.sort_order AS sortOrder,
                   d.created_by AS createdBy, d.created_at AS createdAt, d.updated_at AS updatedAt,
                   f.original_name AS originalName, f.size_bytes AS sizeBytes, f.mime_type AS mimeType
            FROM sop_document d
            LEFT JOIN admin_file_template f
                   ON f.id COLLATE utf8mb4_unicode_ci = d.file_id COLLATE utf8mb4_unicode_ci
            """;
    // COLLATE 写死两边：sop_document 与 admin_file_template 的排序规则不一致时会抛 1267（生产上两拨表混着 general_ci/unicode_ci）；
    // 代价是 f.id 上的索引用不上（两张表都小，可接受），全库排序规则统一后可去掉。

    @Select(SELECT_WITH_FILE + " ORDER BY d.sort_order ASC, d.id ASC")
    List<SopDocument> listAll();

    @Select(SELECT_WITH_FILE + " WHERE d.id = #{id}")
    SopDocument findById(@Param("id") Long id);

    @Select("SELECT COUNT(1) FROM sop_document WHERE node_id = #{nodeId}")
    int countByNodeId(@Param("nodeId") Long nodeId);

    /** 还有几条 SOP 文档引用这个文件 —— 删到 0 才允许删 blob */
    @Select("SELECT COUNT(1) FROM sop_document WHERE file_id = #{fileId}")
    int countByFileId(@Param("fileId") String fileId);

    @Insert("""
            INSERT INTO sop_document (node_id, file_id, title, sort_order, created_by)
            VALUES (#{nodeId}, #{fileId}, #{title}, #{sortOrder}, #{createdBy})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(SopDocument d);

    @Update("""
            UPDATE sop_document
            SET node_id = #{nodeId}, title = #{title}, sort_order = #{sortOrder}, updated_at = NOW()
            WHERE id = #{id}
            """)
    int update(SopDocument d);

    @Delete("DELETE FROM sop_document WHERE id = #{id}")
    int delete(@Param("id") Long id);
}
