package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialDemand;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface MaterialDemandMapper {
    int insert(MaterialDemand demand);
    List<MaterialDemand> selectByUserId(@Param("userId") String userId);
    List<MaterialDemand> selectAll(@Param("offset") int offset, @Param("size") int size);
    int countAll();
    int updateStatus(@Param("id") Long id, @Param("status") Integer status);
}
