package com.example.demo.modules.personnel.service;

import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 人员键归一：一个自然人有教职工侧（STAFF_*）与学生侧（aro 数字 id）两个账号 id，
 * 人级数据（健康调查表、资格）必须绑在「人」身上，不能只绑某一个账号。
 *
 * 主键取统一人员表 {@code personnel.id}；同时提供 {@link #lookupKeys} 返回该人的全部
 * 可能键（人员主键 + 两个账号 id），供查询兼容历史按账号 id 存下的旧数据。
 */
@Service
public class PersonKeyResolver {

    private final PersonnelMapper personnelMapper;

    public PersonKeyResolver(PersonnelMapper personnelMapper) {
        this.personnelMapper = personnelMapper;
    }

    /** 任一账号 id → 该人的统一主键；未建人员档案时回退原 id。 */
    public String toPersonKey(String accountId) {
        if (!StringUtils.hasText(accountId)) {
            return accountId;
        }
        List<Personnel> rows = personnelMapper.findByAccountIds(List.of(accountId.trim()));
        if (rows != null && !rows.isEmpty() && rows.get(0).getId() != null) {
            return String.valueOf(rows.get(0).getId());
        }
        return accountId;
    }

    /**
     * 该人全部可用的查询键：人员主键 + staff_id + aro_user_id（含传入的账号 id）。
     * 用于 `person_id IN (...)`，既命中新数据（人员主键），也命中历史按账号 id 存的数据。
     */
    public List<String> lookupKeys(String accountId) {
        LinkedHashSet<String> keys = new LinkedHashSet<>();
        if (!StringUtils.hasText(accountId)) {
            return List.of();
        }
        keys.add(accountId.trim());
        List<Personnel> rows = personnelMapper.findByAccountIds(List.of(accountId.trim()));
        if (rows != null) {
            for (Personnel p : rows) {
                if (p == null) continue;
                if (p.getId() != null) keys.add(String.valueOf(p.getId()));
                if (StringUtils.hasText(p.getStaffId())) keys.add(p.getStaffId().trim());
                if (StringUtils.hasText(p.getAroUserId())) keys.add(p.getAroUserId().trim());
            }
        }
        return new ArrayList<>(keys);
    }

    /** 批量：请求的账号 id → 该人的全部查询键。 */
    public Map<String, List<String>> lookupKeysOf(Collection<String> accountIds) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        if (accountIds == null) {
            return out;
        }
        List<String> ids = accountIds.stream().filter(StringUtils::hasText).map(String::trim).distinct().toList();
        if (ids.isEmpty()) {
            return out;
        }
        Map<String, List<String>> byAccountId = new LinkedHashMap<>();
        for (Personnel p : personnelMapper.findByAccountIds(ids)) {
            if (p == null) continue;
            List<String> keys = new ArrayList<>();
            if (p.getId() != null) keys.add(String.valueOf(p.getId()));
            if (StringUtils.hasText(p.getStaffId())) keys.add(p.getStaffId().trim());
            if (StringUtils.hasText(p.getAroUserId())) keys.add(p.getAroUserId().trim());
            if (StringUtils.hasText(p.getStaffId())) byAccountId.put(p.getStaffId().trim(), keys);
            if (StringUtils.hasText(p.getAroUserId())) byAccountId.put(p.getAroUserId().trim(), keys);
        }
        for (String id : ids) {
            List<String> keys = byAccountId.get(id);
            out.put(id, keys != null ? keys : List.of(id));
        }
        return out;
    }
}
