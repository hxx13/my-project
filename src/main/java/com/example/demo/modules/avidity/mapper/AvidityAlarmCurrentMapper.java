package com.example.demo.modules.avidity.mapper;

import com.example.demo.modules.avidity.entity.AvidityAlarmCurrent;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface AvidityAlarmCurrentMapper {

    /** 描述「此刻」，每轮整表替换：报警恢复了就该消失。 */
    int deleteAll();

    int insert(AvidityAlarmCurrent row);

    List<AvidityAlarmCurrent> selectAll();
}
