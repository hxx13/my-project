package com.example.demo.modules.animalorder.mapper;

import com.example.demo.modules.animalorder.entity.AnimalOrderHoliday;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AnimalOrderHolidayMapper {
    List<AnimalOrderHoliday> listByYear(@Param("year") int year);

    int countByYear(@Param("year") int year);

    AnimalOrderHoliday findById(@Param("id") Long id);

    int upsert(AnimalOrderHoliday row);

    int deleteById(@Param("id") Long id);
}
