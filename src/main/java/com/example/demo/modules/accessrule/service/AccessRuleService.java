package com.example.demo.modules.accessrule.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.accessrule.dto.AccessRuleDetailView;
import com.example.demo.modules.accessrule.dto.AccessRuleItemPayload;
import com.example.demo.modules.accessrule.dto.AccessRuleSaveRequest;
import com.example.demo.modules.accessrule.entity.AccessRule;
import com.example.demo.modules.accessrule.entity.AccessRuleItem;
import com.example.demo.modules.accessrule.entity.AccessRuleItemUser;
import com.example.demo.modules.accessrule.mapper.AccessRuleItemMapper;
import com.example.demo.modules.accessrule.mapper.AccessRuleItemUserMapper;
import com.example.demo.modules.accessrule.mapper.AccessRuleMapper;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AccessRuleService {

    private final AccessRuleMapper ruleMapper;
    private final AccessRuleItemMapper itemMapper;
    private final AccessRuleItemUserMapper itemUserMapper;

    public AccessRuleService(AccessRuleMapper ruleMapper,
                             AccessRuleItemMapper itemMapper,
                             AccessRuleItemUserMapper itemUserMapper) {
        this.ruleMapper = ruleMapper;
        this.itemMapper = itemMapper;
        this.itemUserMapper = itemUserMapper;
    }

    public Map<String, Object> list(String keyword, int page, int pageSize) {
        int p = Math.max(1, page);
        int size = Math.min(100, Math.max(1, pageSize));
        String kw = keyword != null ? keyword.trim() : "";
        long total = ruleMapper.countList(kw.isEmpty() ? null : kw);
        int offset = (p - 1) * size;
        List<AccessRule> rows = ruleMapper.selectPage(kw.isEmpty() ? null : kw, offset, size);
        Map<String, Object> out = new HashMap<>();
        out.put("list", rows);
        out.put("total", total);
        out.put("page", p);
        out.put("pageSize", size);
        return out;
    }

    public AccessRuleDetailView getDetail(long id) {
        AccessRule r = ruleMapper.selectById(id);
        if (r == null) {
            return null;
        }
        AccessRuleDetailView v = new AccessRuleDetailView();
        v.setId(r.getId());
        v.setRuleCode(r.getRuleCode());
        v.setName(r.getName());
        v.setEnabled(r.getEnabled() != null && r.getEnabled() == 1);
        v.setCreatedAt(r.getCreatedAt());
        v.setUpdatedAt(r.getUpdatedAt());
        List<AccessRuleItem> items = itemMapper.selectByRuleId(id);
        if (items != null) {
            for (AccessRuleItem it : items) {
                AccessRuleItemPayload pl = new AccessRuleItemPayload();
                pl.setId(it.getId());
                pl.setRoomId(it.getRoomId());
                pl.setSortOrder(it.getSortOrder());
                if (StringUtils.hasText(it.getChannelCodesJson())) {
                    pl.setChannelCodes(JSON.parseArray(it.getChannelCodesJson(), String.class));
                }
                if (StringUtils.hasText(it.getDoorGroupIdsJson())) {
                    pl.setDoorGroupIds(JSON.parseArray(it.getDoorGroupIdsJson(), Long.class));
                }
                List<AccessRuleItemUser> users = itemUserMapper.selectByItemId(it.getId());
                if (users != null) {
                    for (AccessRuleItemUser u : users) {
                        pl.getAroUserIds().add(u.getAroUserId());
                    }
                }
                v.getItems().add(pl);
            }
        }
        return v;
    }

    @Transactional(rollbackFor = Exception.class)
    public long create(AccessRuleSaveRequest req) {
        validateSave(req);
        AccessRule r = new AccessRule();
        r.setName(req.getName().trim());
        r.setRuleCode(null);
        r.setEnabled(req.getEnabled() != null && req.getEnabled() ? 1 : 0);
        ruleMapper.insert(r);
        String code = "AR" + String.format("%06d", r.getId());
        ruleMapper.updateRuleCode(r.getId(), code);
        replaceItems(r.getId(), req.getItems());
        return r.getId();
    }

    @Transactional(rollbackFor = Exception.class)
    public void update(long id, AccessRuleSaveRequest req) {
        validateSave(req);
        AccessRule existing = ruleMapper.selectById(id);
        if (existing == null) {
            throw new IllegalArgumentException("规则不存在");
        }
        ruleMapper.updateMeta(id, req.getName().trim(), req.getEnabled() != null && req.getEnabled() ? 1 : 0);
        itemMapper.deleteByRuleId(id);
        replaceItems(id, req.getItems());
    }

    private void replaceItems(long ruleId, List<AccessRuleItemPayload> items) {
        if (items == null) {
            return;
        }
        int order = 0;
        for (AccessRuleItemPayload pl : items) {
            AccessRuleItem it = new AccessRuleItem();
            it.setRuleId(ruleId);
            it.setRoomId(pl.getRoomId().trim());
            it.setSortOrder(pl.getSortOrder() != null ? pl.getSortOrder() : order++);
            it.setChannelCodesJson(pl.getChannelCodes() == null || pl.getChannelCodes().isEmpty()
                    ? null : JSON.toJSONString(pl.getChannelCodes()));
            it.setDoorGroupIdsJson(pl.getDoorGroupIds() == null || pl.getDoorGroupIds().isEmpty()
                    ? null : JSON.toJSONString(pl.getDoorGroupIds()));
            itemMapper.insert(it);
            List<AccessRuleItemUser> rows = new ArrayList<>();
            if (pl.getAroUserIds() != null) {
                for (String uid : pl.getAroUserIds()) {
                    if (!StringUtils.hasText(uid)) {
                        continue;
                    }
                    AccessRuleItemUser u = new AccessRuleItemUser();
                    u.setItemId(it.getId());
                    u.setRoomId(it.getRoomId());
                    u.setAroUserId(uid.trim());
                    rows.add(u);
                }
            }
            if (!rows.isEmpty()) {
                try {
                    itemUserMapper.insertBatch(rows);
                } catch (DataIntegrityViolationException e) {
                    throw new IllegalArgumentException(
                            "人员与房间组合已被其他规则占用：房间 " + it.getRoomId() + " 与人员不可重复配置（全库唯一）");
                }
            }
        }
    }

    private static void validateSave(AccessRuleSaveRequest req) {
        if (req == null || !StringUtils.hasText(req.getName())) {
            throw new IllegalArgumentException("规则名称不能为空");
        }
        if (req.getItems() == null || req.getItems().isEmpty()) {
            throw new IllegalArgumentException("至少配置一条子规则");
        }
        for (AccessRuleItemPayload pl : req.getItems()) {
            if (!StringUtils.hasText(pl.getRoomId())) {
                throw new IllegalArgumentException("每条子规则必须选择房间 id");
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(long id) {
        ruleMapper.deleteById(id);
    }

    /**
     * 扫码匹配：启用规则下唯一子项。
     */
    public AccessRuleItem findMatchingItem(String roomId, String aroUserId) {
        if (!StringUtils.hasText(roomId)) {
            return null;
        }
        String uid = StringUtils.hasText(aroUserId) ? aroUserId.trim() : "";
        return itemMapper.selectMatchingItem(roomId.trim(), uid);
    }
}
