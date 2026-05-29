package com.example.demo.modules.student.mapper;

import com.example.demo.modules.student.entity.StudentFeedbackTicket;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface StudentFeedbackTicketMapper {
    int insert(StudentFeedbackTicket ticket);

    StudentFeedbackTicket selectById(@Param("id") Long id);

    List<StudentFeedbackTicket> selectByUserId(@Param("userId") String userId,
                                                @Param("offset") int offset,
                                                @Param("limit") int limit);

    int countByUserId(@Param("userId") String userId);
}
