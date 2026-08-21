package com.example.demo.modules.identity.service;

import com.example.demo.modules.identity.dto.IdentityTagVO;
import com.example.demo.modules.identity.entity.PersonIdentity;
import com.example.demo.modules.identity.entity.PersonIdentityTag;
import com.example.demo.modules.identity.mapper.PersonIdentityMapper;
import com.example.demo.modules.identity.mapper.PersonIdentityTagMapper;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 人员身份标识服务：下游业务复用的统一入口（可注入、不经 HTTP、无鉴权）。
 * 统一一套、不分视角，key = personnel.id（人级唯一）；内置组长/秘书/专家三个默认标签种子（code 稳定，环境变量可配），其余管理员配置，id 由后端自增生成。
 * 鉴权侧传参为 sys_user.id（staff_id 或 aro_user_id），需先经 {@link #resolveIdByAccount} 转 personnel.id；
 * 通知/指派侧收件人需经 {@link #resolveStaffIds} 转回 staff_id。
 */
@Service
public class PersonIdentityService {

    @Value("${aup.identity.pi-code:PI}")
    private String piCode;

    @Value("${aup.identity.secretary-code:SECRETARY}")
    private String secretaryCode;

    private final PersonIdentityTagMapper tagMapper;
    private final PersonIdentityMapper identityMapper;
    private final PersonnelMapper personnelMapper;

    public PersonIdentityService(PersonIdentityTagMapper tagMapper, PersonIdentityMapper identityMapper, PersonnelMapper personnelMapper) {
        this.tagMapper = tagMapper;
        this.identityMapper = identityMapper;
        this.personnelMapper = personnelMapper;
    }

    /** 启用中的标签，按 sortOrder 升序（同序按 id）。 */
    public List<IdentityTagVO> listTags() {
        return tagMapper.listActive().stream()
                .map(t -> toVO(t.getId(), t))
                .collect(Collectors.toList());
    }

    /** 批量：返回 userId → 标签列表；userIds 为空时返回全部有身份的人。 */
    public Map<String, List<IdentityTagVO>> listByUserIds(Collection<String> userIds) {
        List<PersonIdentity> rows;
        if (userIds == null || userIds.isEmpty()) {
            rows = identityMapper.listAll();
        } else {
            rows = identityMapper.listByUserIds(new ArrayList<>(userIds));
        }
        Map<Long, PersonIdentityTag> tags = tagMap(rows);
        Map<String, List<IdentityTagVO>> result = new LinkedHashMap<>();
        for (PersonIdentity row : rows) {
            result.computeIfAbsent(row.getUserId(), k -> new ArrayList<>())
                    .add(toVO(row.getTagId(), tags.get(row.getTagId())));
        }
        return result;
    }

    public List<IdentityTagVO> getByUser(String userId) {
        List<PersonIdentity> rows = identityMapper.listByUser(userId);
        Map<Long, PersonIdentityTag> tags = tagMap(rows);
        return rows.stream()
                .map(r -> toVO(r.getTagId(), tags.get(r.getTagId())))
                .collect(Collectors.toList());
    }

    /** 是否 PI：入参为 sys_user.id（staff_id 或 aro_user_id），内部 resolve 到 personnel.id 后查标签。下游业务复用，替代已废弃的 RoleEnum.PI。 */
    public boolean isPi(String userId) {
        if (userId == null || userId.isBlank()) {
            return false;
        }
        String pid = resolveIdByAccount(userId);
        if (pid == null) {
            return false;
        }
        for (IdentityTagVO tag : getByUser(pid)) {
            if (tag != null && Objects.equals(tag.getCode(), piCode)) {
                return true;
            }
        }
        return false;
    }

    /** 持有指定标签 code 的全部 userId（通知/接收人用）。 */
    public List<String> listUserIdsByCode(String code) {
        Map<String, List<IdentityTagVO>> byUser = listByUserIds(null);
        List<String> result = new ArrayList<>();
        for (Map.Entry<String, List<IdentityTagVO>> e : byUser.entrySet()) {
            for (IdentityTagVO tag : e.getValue()) {
                if (tag != null && Objects.equals(tag.getCode(), code)) {
                    result.add(e.getKey());
                    break;
                }
            }
        }
        return result;
    }

    /** 全部秘书 userId（持有「秘书」标签，动物订购订单接收人默认值）。返回 staff_id，供通知按 sys_user.id 发推送。 */
    public List<String> listSecretaryUserIds() {
        return resolveStaffIds(listUserIdsByCode(secretaryCode));
    }

    /** 鉴权侧：sys_user.id（staff_id 或 aro_user_id）→ personnel.id 字符串；personnel 不存在返回 null。 */
    public String resolveIdByAccount(String accountId) {
        if (accountId == null || accountId.isBlank()) {
            return null;
        }
        Personnel p = personnelMapper.findByStaffId(accountId);
        if (p == null) {
            p = personnelMapper.findByAroUserId(accountId);
        }
        return p == null ? null : String.valueOf(p.getId());
    }

    /** 通知/指派侧：personnel.id 集合 → staff_id 列表（过滤 staff_id 空者，无账号人员不参与账号通知）。 */
    public List<String> resolveStaffIds(Collection<String> personnelIds) {
        if (personnelIds == null || personnelIds.isEmpty()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (String pid : personnelIds) {
            if (pid == null || pid.isBlank()) {
                continue;
            }
            try {
                Personnel p = personnelMapper.findById(Long.parseLong(pid));
                if (p != null && p.getStaffId() != null && !p.getStaffId().isBlank()) {
                    result.add(p.getStaffId());
                }
            } catch (NumberFormatException ignore) {
                // 非数字 id 忽略（迁移前残留 staff_id 不会出现在此处）
            }
        }
        return result;
    }

    /** 全量替换（先删后插）；校验 tagIds 均存在于字典，否则抛 IllegalArgumentException。 */
    @Transactional
    public void setByUser(String userId, List<Long> tagIds) {
        List<Long> normalized = normalizeIds(tagIds);
        if (!normalized.isEmpty()) {
            Set<Long> existing = tagMapper.listByIds(normalized).stream()
                    .map(PersonIdentityTag::getId)
                    .collect(Collectors.toSet());
            for (Long id : normalized) {
                if (!existing.contains(id)) {
                    throw new IllegalArgumentException("身份标签不存在: " + id);
                }
            }
        }
        identityMapper.deleteByUser(userId);
        for (Long tagId : normalized) {
            PersonIdentity row = new PersonIdentity();
            row.setUserId(userId);
            row.setTagId(tagId);
            identityMapper.insert(row);
        }
    }

    /** 新建标签，返回自增 id。code 为落库稳定标识（唯一，必填），label 为展示文本。 */
    @Transactional
    public Long createTag(String code, String label, Integer sortOrder) {
        String c = trimToNull(code);
        if (c == null) {
            throw new IllegalArgumentException("身份标识 code 不能为空");
        }
        String l = trimToNull(label);
        if (l == null) {
            throw new IllegalArgumentException("身份名称不能为空");
        }
        PersonIdentityTag tag = new PersonIdentityTag();
        tag.setCode(c);
        tag.setLabel(l);
        tag.setSortOrder(sortOrder != null ? sortOrder : 0);
        tag.setActive(1);
        tagMapper.insert(tag);
        return tag.getId();
    }

    @Transactional
    public void updateTag(Long id, String label, Integer sortOrder, Integer active) {
        if (id == null) {
            throw new IllegalArgumentException("id 不能为空");
        }
        PersonIdentityTag tag = tagMapper.findById(id);
        if (tag == null) {
            throw new IllegalArgumentException("标签不存在: " + id);
        }
        boolean changed = false;
        if (label != null) {
            tag.setLabel(label.trim());
            changed = true;
        }
        if (sortOrder != null) {
            tag.setSortOrder(sortOrder);
            changed = true;
        }
        if (active != null) {
            tag.setActive(active);
            changed = true;
        }
        if (changed) {
            tagMapper.update(tag);
        }
    }

    /** 被 person_identity 引用时拒绝删除。 */
    @Transactional
    public void deleteTag(Long id) {
        if (id == null) {
            throw new IllegalArgumentException("id 不能为空");
        }
        if (tagMapper.findById(id) == null) {
            throw new IllegalArgumentException("标签不存在: " + id);
        }
        int refs = identityMapper.countByTagId(id);
        if (refs > 0) {
            throw new IllegalArgumentException("该标签已被 " + refs + " 个人员引用，无法删除");
        }
        tagMapper.deleteById(id);
    }

    private Map<Long, PersonIdentityTag> tagMap(List<PersonIdentity> rows) {
        if (rows == null || rows.isEmpty()) {
            return Collections.emptyMap();
        }
        Set<Long> ids = rows.stream()
                .map(PersonIdentity::getTagId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return Collections.emptyMap();
        }
        Map<Long, PersonIdentityTag> map = new HashMap<>();
        for (PersonIdentityTag t : tagMapper.listByIds(ids)) {
            map.put(t.getId(), t);
        }
        return map;
    }

    private List<Long> normalizeIds(List<Long> ids) {
        List<Long> result = new ArrayList<>();
        if (ids == null) {
            return result;
        }
        Set<Long> seen = new HashSet<>();
        for (Long id : ids) {
            if (id != null && seen.add(id)) {
                result.add(id);
            }
        }
        return result;
    }

    private IdentityTagVO toVO(Long id, PersonIdentityTag tag) {
        IdentityTagVO vo = new IdentityTagVO();
        vo.setId(id);
        if (tag != null) {
            vo.setCode(tag.getCode());
            vo.setLabel(tag.getLabel());
        } else {
            vo.setLabel(String.valueOf(id));
        }
        return vo;
    }

    private String trimToNull(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        return s.trim();
    }
}
