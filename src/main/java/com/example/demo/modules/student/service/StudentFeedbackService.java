package com.example.demo.modules.student.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.dto.StudentFeedbackTicketRequest;
import com.example.demo.modules.student.entity.StudentFeedbackTicket;
import com.example.demo.modules.student.mapper.StudentFeedbackTicketMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

@Service
public class StudentFeedbackService {

    private static final Logger log = LoggerFactory.getLogger(StudentFeedbackService.class);

    private final StudentFeedbackTicketMapper ticketMapper;

    public StudentFeedbackService(StudentFeedbackTicketMapper ticketMapper) {
        this.ticketMapper = ticketMapper;
    }

    public List<Map<String, Object>> getFaqGroups() {
        List<Map<String, Object>> groups = new ArrayList<>();

        Map<String, Object> g1 = new LinkedHashMap<>();
        g1.put("category", "门禁与进出");
        g1.put("items", List.of(
                Map.of("question", "如何查看我的门禁权限？", "answer", "登录后在首页仪表盘可查看可进房间数量，点击「快捷操作」中的「我的门禁权限」可查看详情（即将开放）。"),
                Map.of("question", "门禁刷卡失败怎么办？", "answer", "请确认卡片是否有效、是否在规定时间段内、该房间是否在您的授权范围内。如仍有问题，请联系管理员。")
        ));
        groups.add(g1);

        Map<String, Object> g2 = new LinkedHashMap<>();
        g2.put("category", "违规记录");
        g2.put("items", List.of(
                Map.of("question", "违规记录是如何产生的？", "answer", "系统根据进出记录的异常情况（如未授权进入、超时未离开等）自动生成违规记录。"),
                Map.of("question", "如何申诉违规记录？", "answer", "在「出入记录」页面的「违规记录」标签页中可查看详情，申诉功能即将上线。")
        ));
        groups.add(g2);

        Map<String, Object> g3 = new LinkedHashMap<>();
        g3.put("category", "账户与注册");
        g3.put("items", List.of(
                Map.of("question", "如何注册学生账号？", "answer", "使用您的工号/学号和 QR 码在登录页面选择「学生注册」进行注册。"),
                Map.of("question", "忘记密码怎么办？", "answer", "请联系管理员重置密码。自助找回密码功能即将上线。")
        ));
        groups.add(g3);

        return groups;
    }

    public Map<String, Object> getTickets(User user, int page, int size) {
        int offset = (page - 1) * size;
        List<StudentFeedbackTicket> tickets = ticketMapper.selectByUserId(user.getId(), offset, size);
        int total = ticketMapper.countByUserId(user.getId());

        List<Map<String, Object>> data = new ArrayList<>();
        if (tickets != null) {
            for (StudentFeedbackTicket t : tickets) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", String.valueOf(t.getId()));
                item.put("subject", t.getSubject());
                item.put("content", t.getContent());
                item.put("type", t.getType());
                item.put("status", t.getStatus());
                item.put("replyContent", t.getReplyContent());
                item.put("repliedBy", t.getRepliedBy());
                item.put("repliedAt", t.getRepliedAt() != null ? t.getRepliedAt().toString() : null);
                item.put("createdAt", t.getCreatedAt() != null ? t.getCreatedAt().toString() : "");
                item.put("updatedAt", t.getUpdatedAt() != null ? t.getUpdatedAt().toString() : "");
                data.add(item);
            }
        }

        return Map.of("data", data, "total", total);
    }

    public StudentFeedbackTicket createTicket(User user, StudentFeedbackTicketRequest req) {
        StudentFeedbackTicket ticket = new StudentFeedbackTicket();
        ticket.setUserId(user.getId());
        ticket.setSubject(req.getSubject());
        ticket.setContent(req.getContent());
        ticket.setType(req.getType() != null ? req.getType() : "suggestion");
        ticket.setStatus("pending");
        LocalDateTime now = LocalDateTime.now();
        ticket.setCreatedAt(now);
        ticket.setUpdatedAt(now);
        ticketMapper.insert(ticket);
        return ticket;
    }

    public StudentFeedbackTicket getTicketDetail(Long ticketId) {
        return ticketMapper.selectById(ticketId);
    }
}
