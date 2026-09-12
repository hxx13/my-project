package com.example.demo.modules.identity.service;

import com.example.demo.modules.identity.dto.IdentityTagVO;
import com.example.demo.modules.identity.entity.PersonIdentity;
import com.example.demo.modules.identity.entity.PersonIdentityTag;
import com.example.demo.modules.identity.mapper.PersonIdentityMapper;
import com.example.demo.modules.identity.mapper.PersonIdentityTagMapper;
import com.example.demo.modules.personnel.service.PersonnelService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
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

    /** 饲养组长身份标识稳定码（种子标签 BREEDING_GROUP_LEADER / 饲养组长，与 PI 区分）。 */
    private static final String BREEDING_GROUP_LEADER_CODE = "BREEDING_GROUP_LEADER";
    private static final String GROUP_STEWARD_CODE = "GROUP_STEWARD";
    /** 业务身份标识稳定码（种子标签 BUSINESS / 业务）——动物订购审核人。 */
    private static final String BUSINESS_CODE = "BUSINESS";

    @Value("${aup.identity.pi-code:PI}")
    private String piCode;

    @Value("${aup.identity.secretary-code:SECRETARY}")
    private String secretaryCode;

    private final PersonIdentityTagMapper tagMapper;
    private final PersonIdentityMapper identityMapper;
    private final PersonnelService personnelService;

    public PersonIdentityService(PersonIdentityTagMapper tagMapper, PersonIdentityMapper identityMapper, PersonnelService personnelService) {
        this.tagMapper = tagMapper;
        this.identityMapper = identityMapper;
        this.personnelService = personnelService;
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
            // 入参常是账号 id（staff_id / aro_user_id，通用选人组件给的就是 aro_user_id），
            // 而身份表的主键口径是 personnel.id，先统一；解析不到就按原值试（调用方可能本来就传 personnel.id）。
            LinkedHashSet<String> normalized = new LinkedHashSet<>();
            for (String uid : userIds) {
                if (!StringUtils.hasText(uid)) continue;
                String pid = resolveIdByAccount(uid.trim());
                normalized.add(pid != null ? pid : uid.trim());
            }
            rows = normalized.isEmpty() ? List.of() : identityMapper.listByUserIds(new ArrayList<>(normalized));
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

    /** 是否饲养组长：与 PI 区分，code 固定 {@link #BREEDING_GROUP_LEADER_CODE}（与 PersonIdentityTagSeedBootstrap 种子一致）。 */
    public boolean isBreedingGroupLeader(String userId) {
        if (userId == null || userId.isBlank()) {
            return false;
        }
        String pid = resolveIdByAccount(userId);
        if (pid == null) {
            return false;
        }
        for (IdentityTagVO tag : getByUser(pid)) {
            if (tag != null && Objects.equals(tag.getCode(), BREEDING_GROUP_LEADER_CODE)) {
                return true;
            }
        }
        return false;
    }

    /** 是否课题组管家：code 固定 {@link #GROUP_STEWARD_CODE}（与 PersonIdentityTagSeedBootstrap 种子一致）。 */
    public boolean isGroupSteward(String userId) {
        if (userId == null || userId.isBlank()) {
            return false;
        }
        String pid = resolveIdByAccount(userId);
        if (pid == null) {
            return false;
        }
        for (IdentityTagVO tag : getByUser(pid)) {
            if (tag != null && Objects.equals(tag.getCode(), GROUP_STEWARD_CODE)) {
                return true;
            }
        }
        return false;
    }

    /** 是否业务：code 固定 {@link #BUSINESS_CODE}（与 PersonIdentityTagSeedBootstrap 种子一致）。动物订购审核人。 */
    public boolean isBusiness(String userId) {
        if (userId == null || userId.isBlank()) {
            return false;
        }
        String pid = resolveIdByAccount(userId);
        if (pid == null) {
            return false;
        }
        for (IdentityTagVO tag : getByUser(pid)) {
            if (tag != null && Objects.equals(tag.getCode(), BUSINESS_CODE)) {
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

    /** 全部秘书 userId（持有「秘书」标签）。返回 staff_id，供通知按 sys_user.id 发推送。 */
    public List<String> listSecretaryUserIds() {
        return resolveStaffIds(listUserIdsByCode(secretaryCode));
    }

    /** 全部业务 userId（持有「业务」标签，动物订购订单审核人/接收人）。返回 staff_id。 */
    public List<String> listBusinessUserIds() {
        return resolveStaffIds(listUserIdsByCode(BUSINESS_CODE));
    }

    /** 鉴权侧：sys_user.id（staff_id 或 aro_user_id）→ personnel.id 字符串；personnel 不存在返回 null。 */
    public String resolveIdByAccount(String accountId) {
        return personnelService.resolveIdByAccount(accountId);
    }

    /**
     * 两个账号 id 是不是同一个人 —— 人级判定一律走这里，不要用裸账号 id 直接 equals。
     *
     * <p>同一个人可能同时持有两个 sys_user 账号（`STAFF_xxx` 与它的 `aro_user_id`，
     * 例如教职工账号和他自己的学生账号），两个 id 指向同一个 `personnel.id`。
     * 「这行是不是本人加购的」「这个笼位是不是本人预定的」这类判断若直接比账号 id，
     * 换个视角看自己的数据就会变成「别人的」——用户报的「双视角被当成两个人」就是这个。
     */
    public boolean samePerson(String accountIdA, String accountIdB) {
        if (!StringUtils.hasText(accountIdA) || !StringUtils.hasText(accountIdB)) {
            return false;
        }
        String a = accountIdA.trim();
        String b = accountIdB.trim();
        if (a.equals(b)) {
            return true;
        }
        String pa = resolveIdByAccount(a);
        String pb = resolveIdByAccount(b);
        return pa != null && pa.equals(pb);
    }

    /** 通知/指派侧：personnel.id 集合 → staff_id 列表（过滤 staff_id 空者，无账号人员不参与账号通知）。 */
    public List<String> resolveStaffIds(Collection<String> personnelIds) {
        return personnelService.resolveStaffIds(personnelIds);
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
