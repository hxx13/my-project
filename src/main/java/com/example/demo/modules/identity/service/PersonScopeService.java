package com.example.demo.modules.identity.service;

import com.example.demo.modules.identity.entity.PersonScope;
import com.example.demo.modules.identity.mapper.PersonScopeMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 人员负责范围服务：逐人挂载「校区/楼层/房间」，用于笼架数据范围收口。
 * user_id 与 {@link PersonIdentityService} 同口径 = personnel.id；鉴权侧传 sys_user.id 时先 resolveIdByAccount。
 */
@Service
public class PersonScopeService {

    private final PersonScopeMapper scopeMapper;
    private final PersonIdentityService identityService;

    public PersonScopeService(PersonScopeMapper scopeMapper, PersonIdentityService identityService) {
        this.scopeMapper = scopeMapper;
        this.identityService = identityService;
    }

    /** 查某人全部负责范围；userId 为 sys_user.id（内部转 personnel.id）。 */
    public List<PersonScope> listByAccount(String accountId) {
        String pid = identityService.resolveIdByAccount(accountId);
        if (pid == null || pid.isBlank()) return new ArrayList<>();
        return scopeMapper.listByUser(pid);
    }

    /** 按 scope_type 分组返回，便于数据范围过滤直接取并集。 */
    public Map<String, List<String>> listGroupedByType(String accountId) {
        Map<String, List<String>> grouped = new LinkedHashMap<>();
        for (PersonScope s : listByAccount(accountId)) {
            grouped.computeIfAbsent(s.getScopeType(), k -> new ArrayList<>()).add(s.getScopeId());
        }
        return grouped;
    }

    /** 全量替换某人的负责范围（先删后插，事务内）。 */
    @Transactional
    public void replaceByAccount(String accountId, List<PersonScope> scopes) {
        String pid = identityService.resolveIdByAccount(accountId);
        if (pid == null || pid.isBlank()) throw new IllegalArgumentException("人员不存在，无法分配负责范围");
        scopeMapper.deleteByUser(pid);
        for (PersonScope s : scopes) {
            if (s.getScopeType() == null || s.getScopeId() == null) continue;
            PersonScope row = new PersonScope();
            row.setUserId(pid);
            row.setScopeType(s.getScopeType());
            row.setScopeId(s.getScopeId());
            scopeMapper.insert(row);
        }
    }
}
