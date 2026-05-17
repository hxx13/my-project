package com.example.demo.modules.auth.service;

import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
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
 * 展示用姓名：优先人员库姓名，其次账号名，最后回退 userId。
 */
@Service
public class UserDisplayNameService {
    private final AroDatabaseMapper aroDatabaseMapper;
    private final UserMapper userMapper;

    public UserDisplayNameService(AroDatabaseMapper aroDatabaseMapper, UserMapper userMapper) {
        this.aroDatabaseMapper = aroDatabaseMapper;
        this.userMapper = userMapper;
    }

    public String resolveDisplayName(String userId) {
        if (!StringUtils.hasText(userId)) {
            return "";
        }
        String id = userId.trim();
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
     * 批量解析展示名（与 {@link #resolveDisplayName(String)} 规则一致），每人最多两次查询（人员库 + 账号表）。
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
        Map<String, String> personnelNames = new HashMap<>();
        List<Map<String, Object>> personnelRows = aroDatabaseMapper.findPersonnelNamesByUserIds(idList);
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
        List<String> needUserLookup = idList.stream()
                .filter(id -> !StringUtils.hasText(personnelNames.get(id)))
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
}
