package com.example.demo.modules.auth.service;

import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
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
 * STAFF_* 账号经 user_aro_binding 展开为 aro_user_id 后再查 personnel / aro_personnel。
 */
@Service
public class UserDisplayNameService {
    private final AroDatabaseMapper aroDatabaseMapper;
    private final UserMapper userMapper;
    private final PersonnelMapper personnelMapper;
    private final UserAroBindingMapper userAroBindingMapper;

    public UserDisplayNameService(AroDatabaseMapper aroDatabaseMapper,
                                  UserMapper userMapper,
                                  PersonnelMapper personnelMapper,
                                  UserAroBindingMapper userAroBindingMapper) {
        this.aroDatabaseMapper = aroDatabaseMapper;
        this.userMapper = userMapper;
        this.personnelMapper = personnelMapper;
        this.userAroBindingMapper = userAroBindingMapper;
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
        for (String key : expandedLookupKeys(id)) {
            String personnelName = aroDatabaseMapper.findPersonnelNameByUserId(key);
            if (StringUtils.hasText(personnelName)) {
                return personnelName.trim();
            }
        }
        User u = userMapper.findById(id);
        String fromUser = displayNameFromUser(u);
        if (StringUtils.hasText(fromUser)) {
            return fromUser;
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
        Map<String, String> staffToAro = resolveStaffAroBindings(idList);

        Map<String, String> unifiedNames = resolvePersonnelNames(idList, staffToAro);

        List<String> needAroLookup = new ArrayList<>();
        for (String id : idList) {
            if (!StringUtils.hasText(unifiedNames.get(id))) {
                needAroLookup.addAll(expandedLookupKeys(id, staffToAro));
            }
        }
        Map<String, String> personnelNames = new HashMap<>();
        if (!needAroLookup.isEmpty()) {
            LinkedHashSet<String> aroKeys = new LinkedHashSet<>(needAroLookup);
            List<Map<String, Object>> personnelRows = aroDatabaseMapper.findPersonnelNamesByUserIds(new ArrayList<>(aroKeys));
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
                        && !StringUtils.hasText(resolveAroName(id, staffToAro, personnelNames)))
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
            String pn = resolveAroName(id, staffToAro, personnelNames);
            if (StringUtils.hasText(pn)) {
                out.put(id, pn);
                continue;
            }
            User u = userById.get(id);
            String fromUser = displayNameFromUser(u);
            if (StringUtils.hasText(fromUser)) {
                out.put(id, fromUser);
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
        Map<String, String> staffToAro = resolveStaffAroBindings(List.of(accountId.trim()));
        Map<String, String> names = resolvePersonnelNames(List.of(accountId.trim()), staffToAro);
        return names.get(accountId.trim());
    }

    /** 将 staff_id / aro_user_id（含 STAFF_* 经 binding 展开的 aro id）命中的统一人员姓名回填到各自请求键。 */
    private Map<String, String> resolvePersonnelNames(List<String> idList, Map<String, String> staffToAro) {
        Map<String, String> out = new HashMap<>();
        if (idList == null || idList.isEmpty()) {
            return out;
        }
        LinkedHashSet<String> lookupIds = new LinkedHashSet<>();
        for (String id : idList) {
            lookupIds.addAll(expandedLookupKeys(id, staffToAro));
        }
        List<Personnel> rows = personnelMapper.findByAccountIds(new ArrayList<>(lookupIds));
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
            String name = nameForAccountKeys(expandedLookupKeys(id, staffToAro), byStaff, byAro);
            if (StringUtils.hasText(name)) {
                out.put(id, name);
            }
        }
        return out;
    }

    private static String nameForAccountKeys(List<String> keys, Map<String, String> byStaff, Map<String, String> byAro) {
        for (String key : keys) {
            String name = byStaff.get(key);
            if (!StringUtils.hasText(name)) {
                name = byAro.get(key);
            }
            if (StringUtils.hasText(name)) {
                return name;
            }
        }
        return null;
    }

    private String resolveAroName(String id, Map<String, String> staffToAro, Map<String, String> personnelNames) {
        for (String key : expandedLookupKeys(id, staffToAro)) {
            String pn = personnelNames.get(key);
            if (StringUtils.hasText(pn)) {
                return pn;
            }
        }
        return null;
    }

    /** STAFF_* → user_aro_binding.aro_user_id，供 personnel / aro_personnel 二次索引。 */
    private Map<String, String> resolveStaffAroBindings(Collection<String> ids) {
        Map<String, String> out = new HashMap<>();
        if (ids == null || ids.isEmpty()) {
            return out;
        }
        List<String> staffIds = ids.stream()
                .filter(StringUtils::hasText)
                .map(String::trim)
                .filter(id -> id.startsWith("STAFF_"))
                .distinct()
                .collect(Collectors.toList());
        if (staffIds.isEmpty()) {
            return out;
        }
        List<UserAroBinding> bindings = userAroBindingMapper.selectByUserIds(staffIds);
        if (bindings == null) {
            return out;
        }
        for (UserAroBinding binding : bindings) {
            if (binding == null || !StringUtils.hasText(binding.getUserId())
                    || !StringUtils.hasText(binding.getAroUserId())) {
                continue;
            }
            out.put(binding.getUserId().trim(), binding.getAroUserId().trim());
        }
        return out;
    }

    private List<String> expandedLookupKeys(String accountId) {
        return expandedLookupKeys(accountId, resolveStaffAroBindings(
                StringUtils.hasText(accountId) ? List.of(accountId.trim()) : List.of()));
    }

    private List<String> expandedLookupKeys(String accountId, Map<String, String> staffToAro) {
        List<String> keys = new ArrayList<>();
        if (!StringUtils.hasText(accountId)) {
            return keys;
        }
        String id = accountId.trim();
        keys.add(id);
        if (id.startsWith("STAFF_")) {
            String aro = staffToAro.get(id);
            if (StringUtils.hasText(aro) && !keys.contains(aro)) {
                keys.add(aro);
            }
        }
        return keys;
    }

    private static String displayNameFromUser(User u) {
        if (u == null) {
            return null;
        }
        if (StringUtils.hasText(u.getName())) {
            return u.getName().trim();
        }
        if (StringUtils.hasText(u.getDisplayNickname())) {
            return u.getDisplayNickname().trim();
        }
        if (StringUtils.hasText(u.getUsername())) {
            return u.getUsername().trim();
        }
        return null;
    }
}
