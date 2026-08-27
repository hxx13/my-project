package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageAuditAssignment;
import com.example.demo.modules.cageshelf.mapper.CageAuditAssignmentMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 笼位申请审核人归属服务：审核人 → 楼层/房间，用于审批分发与角标按审核人过滤。
 * reviewer_user_id = sys_user.id（与前端登录态 u.getId() 同口径）。
 */
@Service
public class CageAuditAssignmentService {

    private final CageAuditAssignmentMapper mapper;

    public CageAuditAssignmentService(CageAuditAssignmentMapper mapper) {
        this.mapper = mapper;
    }

    public List<CageAuditAssignment> listByReviewer(String reviewerUserId) {
        return mapper.listByReviewer(reviewerUserId);
    }

    /** 按 scope_type 分组返回，便于范围命中判定取并集。 */
    public Map<String, List<String>> listGroupedByType(String reviewerUserId) {
        Map<String, List<String>> grouped = new LinkedHashMap<>();
        for (CageAuditAssignment a : listByReviewer(reviewerUserId)) {
            grouped.computeIfAbsent(a.getScopeType(), k -> new ArrayList<>()).add(a.getScopeId());
        }
        return grouped;
    }

    @Transactional
    public void replaceByReviewer(String reviewerUserId, List<CageAuditAssignment> assignments) {
        mapper.deleteByReviewer(reviewerUserId);
        for (CageAuditAssignment a : assignments) {
            if (a.getScopeType() == null || a.getScopeId() == null) continue;
            CageAuditAssignment row = new CageAuditAssignment();
            row.setReviewerUserId(reviewerUserId);
            row.setScopeType(a.getScopeType());
            row.setScopeId(a.getScopeId());
            mapper.insert(row);
        }
    }

    /**
     * 某审核人是否能审批某笼位（按楼层/房间/校区归属）。
     * ADMIN/SUPER_ADMIN 逃生口：全量可审；否则命中 cage_audit_assignment 才可审。
     * roomId/floorId/campusId 传字符串化 id（null 跳过）。
     */
    public boolean canReview(User user, String roomId, String floorId, String campusId) {
        if (user == null) return false;
        if (user.getRole() != null && user.getRole().getLevel() >= RoleEnum.ADMIN.getLevel()) return true;
        Map<String, List<String>> grouped = listGroupedByType(user.getId());
        if (grouped.isEmpty()) return false;
        if (roomId != null && grouped.getOrDefault("ROOM", List.of()).contains(roomId)) return true;
        if (floorId != null && grouped.getOrDefault("FLOOR", List.of()).contains(floorId)) return true;
        if (campusId != null && grouped.getOrDefault("CAMPUS", List.of()).contains(campusId)) return true;
        return false;
    }
}
