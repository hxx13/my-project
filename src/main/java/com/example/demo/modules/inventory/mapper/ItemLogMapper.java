package com.example.demo.modules.inventory.mapper;

import com.example.demo.modules.inventory.entity.InvItemLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface ItemLogMapper {
    int insert(InvItemLog log);
    List<InvItemLog> selectByItemId(@Param("itemId") Long itemId);
}
