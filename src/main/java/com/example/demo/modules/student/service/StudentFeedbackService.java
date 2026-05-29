package com.example.demo.modules.student.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.dto.StudentFeedbackTicketRequest;
import com.example.demo.modules.student.entity.StudentFeedbackTicket;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Service
public class StudentFeedbackService {

    private static final Logger log = LoggerFactory.getLogger(StudentFeedbackService.class);

    public List<Map<String, Object>> getFaqGroups() {
        return Collections.emptyList();
    }

    public Map<String, Object> getTickets(User user, int page, int size) {
        return Map.of(
                "data", Collections.emptyList(),
                "total", 0
        );
    }

    public StudentFeedbackTicket createTicket(User user, StudentFeedbackTicketRequest req) {
        StudentFeedbackTicket ticket = new StudentFeedbackTicket();
        ticket.setId(System.currentTimeMillis());
        ticket.setUserId(user.getId());
        ticket.setSubject(req.getSubject());
        ticket.setContent(req.getContent());
        ticket.setType(req.getType() != null ? req.getType() : "suggestion");
        ticket.setStatus("pending");
        ticket.setCreatedAt(LocalDateTime.now());
        ticket.setUpdatedAt(LocalDateTime.now());
        return ticket;
    }

    public StudentFeedbackTicket getTicketDetail(Long ticketId) {
        return null;
    }
}
