package com.example.demo.modules.student.service;

import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.dto.StudentProfileAccountInfo;
import com.example.demo.modules.student.dto.StudentProfilePersonnelInfo;
import com.example.demo.modules.student.dto.StudentProfileResponse;
import com.example.demo.modules.student.dto.StudentProfileStatsInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class StudentProfileService {

    private static final Logger log = LoggerFactory.getLogger(StudentProfileService.class);

    private final AroPersonnelMapper aroPersonnelMapper;

    public StudentProfileService(AroPersonnelMapper aroPersonnelMapper) {
        this.aroPersonnelMapper = aroPersonnelMapper;
    }

    public StudentProfileResponse buildProfile(User user) {
        StudentProfileResponse resp = new StudentProfileResponse();

        // 1. 构建 AccountInfo
        StudentProfileAccountInfo account = new StudentProfileAccountInfo();
        account.setUsername(user.getUsername());
        account.setRole(user.getRole() != null ? user.getRole().getDescZh() : null);
        account.setCreateTime(user.getCreateTime());
        resp.setAccount(account);

        // 2. 关联 aro_personnel：优先通过 user_id，失败则通过姓名匹配
        AroPersonnel personnel = findPersonnelForUser(user);
        if (personnel != null) {
            StudentProfilePersonnelInfo info = new StudentProfilePersonnelInfo();
            info.setUserId(personnel.getId());
            info.setName(personnel.getName());
            info.setGender(personnel.getGender());
            info.setMobilePhone(personnel.getMobilePhone());
            info.setEmail(personnel.getEmail());
            info.setHead(personnel.getHead());
            info.setDepartmentName(personnel.getDepartmentName());
            info.setProjectGroupName(personnel.getResolvedProjectGroupNames());
            info.setUserTypeNames(personnel.getUserTypeNames());
            info.setAllowedRoomsDisplayZh(personnel.getAllowedRoomsDisplayZh());
            info.setHasOfficialRoomPermission(personnel.getHasOfficialRoomPermission());
            info.setTotalExp(personnel.getTotalExp());
            resp.setPersonnel(info);
        }

        // 3. StatsInfo（占位）
        StudentProfileStatsInfo stats = new StudentProfileStatsInfo();
        stats.setRecentAccessCount(0);
        resp.setStats(stats);

        return resp;
    }

    private AroPersonnel findPersonnelForUser(User user) {
        // 优先：直接以 user.id 作为 user_id 查询（少数场景下 user.id 可能等于 aro user_id）
        AroPersonnel personnel = aroPersonnelMapper.findByUserId(user.getId());
        if (personnel != null) {
            return personnel;
        }
        // 回退：通过姓名匹配
        if (user.getUsername() != null && !user.getUsername().isBlank()) {
            personnel = aroPersonnelMapper.findByName(user.getUsername());
        }
        if (personnel != null) {
            log.debug("Matched aro_personnel by name for user: {}", user.getUsername());
        }
        return personnel;
    }
}
