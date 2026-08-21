package com.example.demo.modules.auth.service;

import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 展示用姓名：优先统一人员表（staff_id / aro_user_id 同源），其次 ARO 人员库，再次账号名，最后回退 userId。
 * 无论存储键是 19 位 aro id 还是 staffId，均解析为同一展示名。
 */
@Service
public class UserDisplayNameService {
    private final AroDatabaseMapper aroDatabaseMapper;
    private final UserMapper userMapper;
    private final PersonnelMapper personnelMapper;

    public UserDisplayNameService(AroDatabaseMapper aroDatabaseMapper,
                                  UserMapper userMapper,
                                  PersonnelMapper personnelMapper) {
        this.aroDatabaseMapper = aroDatabaseMapper;
        this.userMapper = userMapper;
        this.personnelMapper = personnelMapper;
    }

    public String resolveDisplayName(String userId) {
        if (!StringUtils.hasText(userId)) {
            return "";
        }
        String id = userId.trim();
        String personnelUnified = resolvePersonnelName(id);
        if (StringUtils.hasText(personnelUnified)) {
            return personnelUnified;
        }
        String personnelName = aroDatabaseMapper.findPersonnelNameByUserId(id);
        if (StringUtils.hasText(personnelName)) {
            return personnelName.trim();
        }
        User u = userMapper.findById(id);
        if (u != null && StringUtils.hasText(u.getDisplayNickname())) {
            return u.getDisplayNickname().trim();
        }
        if (u != null && StringUtils.hasText(u.getUsername())) {
            return u.getUsername().trim();
        }
        return id;
    }

    /**
     * 批量解析展示名（与 {@link #resolveDisplayName(String)} 规则一致）。
     */
    public Map<String, String> resolveDisplayNames(Collection<String> userIds) {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        if (userIds != null) {
            for (String raw : userIds) {
                if (StringUtils.hasText(raw)) {
                    ids.add(raw.trim());
                }
            }
        }
        if (ids.isEmpty()) {
            return Collections.emptyMap();
        }
        List<String> idList = new ArrayList<>(ids);

        Map<String, String> unifiedNames = resolvePersonnelNames(idList);

        List<String> needAroLookup = idList.stream()
                .filter(id -> !StringUtils.hasText(unifiedNames.get(id)))
                .collect(Collectors.toList());
        Map<String, String> personnelNames = new HashMap<>();
        if (!needAroLookup.isEmpty()) {
            List<Map<String, Object>> personnelRows = aroDatabaseMapper.findPersonnelNamesByUserIds(needAroLookup);
            if (personnelRows != null) {
                for (Map<String, Object> row : personnelRows) {
                    Object uidObj = row.get("userId");
                    if (uidObj == null) {
                        uidObj = row.get("userid");
                    }
                    String uid = uidObj != null ? String.valueOf(uidObj).trim() : "";
                    Object nameObj = row.get("name");
                    String nm = nameObj != null ? String.valueOf(nameObj).trim() : "";
                    if (StringUtils.hasText(uid) && StringUtils.hasText(nm)) {
                        personnelNames.put(uid, nm);
                    }
                }
            }
        }

        List<String> needUserLookup = idList.stream()
                .filter(id -> !StringUtils.hasText(unifiedNames.get(id))
                        && !StringUtils.hasText(personnelNames.get(id)))
                .collect(Collectors.toList());
        Map<String, User> userById = new HashMap<>();
        if (!needUserLookup.isEmpty()) {
            List<User> users = userMapper.findByIds(needUserLookup);
            if (users != null) {
                for (User u : users) {
                    if (u != null && StringUtils.hasText(u.getId())) {
                        userById.put(u.getId().trim(), u);
                    }
                }
            }
        }
        Map<String, String> out = new HashMap<>();
        for (String id : idList) {
            String un = unifiedNames.get(id);
            if (StringUtils.hasText(un)) {
                out.put(id, un);
                continue;
            }
            String pn = personnelNames.get(id);
            if (StringUtils.hasText(pn)) {
                out.put(id, pn);
                continue;
            }
            User u = userById.get(id);
            if (u != null && StringUtils.hasText(u.getDisplayNickname())) {
                out.put(id, u.getDisplayNickname().trim());
                continue;
            }
            if (u != null && StringUtils.hasText(u.getUsername())) {
                out.put(id, u.getUsername().trim());
                continue;
            }
            out.put(id, id);
        }
        return out;
    }

    private String resolvePersonnelName(String accountId) {
        if (!StringUtils.hasText(accountId)) {
            return null;
        }
        Personnel p = personnelMapper.findByStaffId(accountId);
        if (p == null) {
            p = personnelMapper.findByAroUserId(accountId);
        }
        if (p != null && StringUtils.hasText(p.getName())) {
            return p.getName().trim();
        }
        return null;
    }

    /** 将 staff_id / aro_user_id 命中的统一人员姓名回填到各自请求键。 */
    private Map<String, String> resolvePersonnelNames(List<String> idList) {
        Map<String, String> out = new HashMap<>();
        if (idList == null || idList.isEmpty()) {
            return out;
        }
        List<Personnel> rows = personnelMapper.findByAccountIds(idList);
        if (rows == null || rows.isEmpty()) {
            return out;
        }
        Map<String, String> byStaff = new HashMap<>();
        Map<String, String> byAro = new HashMap<>();
        for (Personnel p : rows) {
            if (p == null || !StringUtils.hasText(p.getName())) {
                continue;
            }
            String name = p.getName().trim();
            if (StringUtils.hasText(p.getStaffId())) {
                byStaff.put(p.getStaffId().trim(), name);
            }
            if (StringUtils.hasText(p.getAroUserId())) {
                byAro.put(p.getAroUserId().trim(), name);
            }
        }
        for (String id : idList) {
            String name = byStaff.get(id);
            if (!StringUtils.hasText(name)) {
                name = byAro.get(id);
            }
            if (StringUtils.hasText(name)) {
                out.put(id, name);
            }
        }
        return out;
    }
}
