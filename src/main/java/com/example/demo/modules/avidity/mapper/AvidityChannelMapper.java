package com.example.demo.modules.avidity.mapper;

import com.example.demo.modules.avidity.entity.AvidityChannel;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface AvidityChannelMapper {

    /** 通道是平台的快照，每轮先清后写。 */
    int deleteAll();

    int insert(AvidityChannel row);

    List<AvidityChannel> selectAll();
}
