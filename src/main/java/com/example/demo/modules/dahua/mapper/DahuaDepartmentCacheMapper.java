package com.example.demo.modules.dahua.mapper;

import com.example.demo.modules.dahua.entity.DahuaDepartmentCache;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface DahuaDepartmentCacheMapper {
    int upsert(DahuaDepartmentCache item);

    List<DahuaDepartmentCache> list(@Param("keyword") String keyword,
                                    @Param("offset") int offset,
                                    @Param("pageSize") int pageSize);

    int count(@Param("keyword") String keyword);

    String selectNameById(@Param("id") Long id);

    Long selectIdByName(@Param("name") String name);

    /** 仅在学生部门 26–29 范围内按名称匹配 */
    Long selectStudentDeptIdByName(@Param("name") String name);
}
