package com.example.demo.modules.student.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.dto.StudentFeedbackTicketRequest;
import com.example.demo.modules.student.entity.StudentFeedbackTicket;
import com.example.demo.modules.student.mapper.StudentFeedbackTicketMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

@Service
public class StudentFeedbackService {

    private static final Logger log = LoggerFactory.getLogger(StudentFeedbackService.class);

    private final StudentFeedbackTicketMapper ticketMapper;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public StudentFeedbackService(StudentFeedbackTicketMapper ticketMapper,
                                  JdbcTemplate jdbcTemplate,
                                  ObjectMapper objectMapper) {
        this.ticketMapper = ticketMapper;
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * 学生 FAQ 分组：从 portal_content 读取（page_key = student_faq，已发布版本）。
     * 内容由后台「学生Q&A」编辑器维护，此处不再硬编码。
     */
    public List<Map<String, Object>> getFaqGroups() {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT extension_json FROM portal_content"
                            + " WHERE content_type = 'PAGE' AND status = 'PUBLISHED' AND deleted = 0"
                            + " AND JSON_UNQUOTE(JSON_EXTRACT(extension_json, '$.page_key')) = 'student_faq'"
                            + " ORDER BY updated_at DESC LIMIT 1");
            if (!rows.isEmpty()) {
                Object ext = rows.get(0).get("extension_json");
                if (ext != null) {
                    JsonNode root = objectMapper.readTree(ext.toString());
                    JsonNode groupsNode = root.get("groups");
                    if (groupsNode != null && groupsNode.isArray()) {
                        return objectMapper.convertValue(groupsNode, new TypeReference<List<Map<String, Object>>>() {});
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[student-feedback] 读取学生FAQ失败，返回空列表: {}", e.getMessage());
        }
        return Collections.emptyList();
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
