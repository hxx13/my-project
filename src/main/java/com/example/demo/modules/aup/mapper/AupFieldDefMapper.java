package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.AupFieldDef;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface AupFieldDefMapper {
    int insert(AupFieldDef row);
    int update(AupFieldDef row);
    AupFieldDef findById(@Param("id") Long id);
    AupFieldDef findByFieldCode(@Param("fieldCode") String fieldCode);
    List<AupFieldDef> listByFilter(@Param("folderId") Long folderId, @Param("status") String status,
                                   @Param("keyword") String keyword,
                                   @Param("limit") int limit, @Param("offset") int offset);
    int countByFilter(@Param("folderId") Long folderId, @Param("status") String status,
                      @Param("keyword") String keyword);
    int countByFolderId(@Param("folderId") Long folderId);
    int countByDictKey(@Param("dictKey") String dictKey);
    int updateStatus(@Param("id") Long id, @Param("status") String status);
    int updateFolder(@Param("id") Long id, @Param("folderId") Long folderId, @Param("sortOrder") int sortOrder);
    /** 发布：置 PUBLISHED + 冻结元数据。 */
    int markPublished(@Param("id") Long id, @Param("frozenAt") LocalDateTime frozenAt,
                      @Param("frozenBy") String frozenBy);
    int deleteById(@Param("id") Long id);
}
