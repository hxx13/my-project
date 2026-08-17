package com.example.demo.modules.inventory.mapper;

import com.example.demo.modules.inventory.entity.InvUploadIcon;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface UploadIconMapper {
    int insert(InvUploadIcon icon);
    List<InvUploadIcon> selectAll();
    InvUploadIcon selectById(@Param("id") Long id);
    int deleteById(@Param("id") Long id);
}
