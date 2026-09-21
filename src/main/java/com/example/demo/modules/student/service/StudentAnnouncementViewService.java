package com.example.demo.modules.student.service;

import com.example.demo.modules.student.mapper.StudentAnnouncementViewMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;

/**
 * 移动端公告已读游标（一人一行）。
 *
 * <p>与 chat_conversation_read 同型：只记「看到哪个时间点为止」，不逐条记已读。
 * 手机端公告红点 = 最新一条公告晚于本人游标（或本人还没有游标行）。
 */
@Service
public class StudentAnnouncementViewService {

    private final StudentAnnouncementViewMapper mapper;

    public StudentAnnouncementViewService(StudentAnnouncementViewMapper mapper) {
        this.mapper = mapper;
    }

    /** 最后一次查看时间；从未查看返回 null */
    public LocalDateTime lastViewedAt(String userId) {
        if (!StringUtils.hasText(userId)) {
            return null;
        }
        return mapper.selectLastViewedAt(userId);
    }

    /** 标记已看到当前时间：无则插入，有则推进游标 */
    public void markViewed(String userId) {
        if (!StringUtils.hasText(userId)) {
            return;
        }
        mapper.upsertLastViewedAt(userId);
    }
}
