package com.example.demo.modules.portal.mapper;

import com.example.demo.modules.portal.entity.PortalContent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface PortalContentMapper {
    int insert(PortalContent row);
    int update(PortalContent row);
    PortalContent findById(@Param("id") Long id);
    List<PortalContent> listPublic(@Param("type") String type, @Param("categoryId") Long categoryId,
                                   @Param("search") String search, @Param("sort") String sort,
                                   @Param("limit") int limit, @Param("offset") int offset);
    int countPublic(@Param("type") String type, @Param("categoryId") Long categoryId,
                    @Param("search") String search);
    List<PortalContent> listAdmin(@Param("type") String type, @Param("status") String status,
                                  @Param("search") String search, @Param("limit") int limit,
                                  @Param("offset") int offset);
    int countAdmin(@Param("type") String type, @Param("status") String status,
                   @Param("search") String search);
    int softDelete(@Param("id") Long id, @Param("deletedBy") String deletedBy);
    int restoreById(@Param("id") Long id);
    List<PortalContent> listRecycle(@Param("limit") int limit, @Param("offset") int offset);
    int countRecycle();
    int hardDeleteById(@Param("id") Long id);
}
