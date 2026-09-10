package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageDivision;
import com.example.demo.modules.cageshelf.mapper.CageDivisionMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 笼位划分服务：把 type2 笼位预分给本课题组的某人。
 *
 * 划分只作为「谁能申请/使用该笼位」的限制依据与渲染依据，**不写入任何表单数据**。
 * 记录独立于笼位状态存在，不随笼位被占用而失效 —— 撤销/改划由管家手动做。
 *
 * 判定口径：本方法只管"划分"这一条规则；教职工/管理员放行由调用方短路（见各注入点）。
 */
@Service
public class CageDivisionService {

    /** 全量索引缓存时长；管家手动划分，写入即失效，10 秒足够挡住一次请求内的重复查询。 */
    private static final long CACHE_TTL_MS = 10_000L;

    private final CageDivisionMapper mapper;

    public CageDivisionService(CageDivisionMapper mapper) {
        this.mapper = mapper;
    }

    private volatile Map<Long, Set<String>> indexCache;
    private volatile long indexAt = 0L;

    /** cageId → 被划分人 accountId 集合。带 TTL 缓存，供判定高频复用。 */
    public Map<Long, Set<String>> index() {
        long now = System.currentTimeMillis();
        Map<Long, Set<String>> c = indexCache;
        if (c != null && now - indexAt < CACHE_TTL_MS) return c;

        Map<Long, Set<String>> m = new HashMap<>();
        for (CageDivision d : mapper.listAll()) {
            if (d.getAnimalCageId() == null || d.getAssigneeId() == null) continue;
            m.computeIfAbsent(d.getAnimalCageId(), k -> new LinkedHashSet<>()).add(d.getAssigneeId());
        }
        indexCache = m;
        indexAt = now;
        return m;
    }

    /**
     * 该账号对该笼位是否被划分规则拦住。
     * 未划分 → false（不拦）；已划分且账号不在名单 → true。
     */
    public boolean isBlocked(Long animalCageId, String accountId) {
        if (animalCageId == null) return false;
        Set<String> assignees = index().get(animalCageId);
        if (assignees == null || assignees.isEmpty()) return false;
        return accountId == null || !assignees.contains(accountId);
    }

    /** 渲染用：按笼位批量取划分行（含姓名），不走缓存 —— 渲染要的是最新名单。 */
    public Map<Long, List<CageDivision>> rowsByCages(Collection<Long> cageIds) {
        Map<Long, List<CageDivision>> m = new LinkedHashMap<>();
        List<Long> ids = distinct(cageIds);
        if (ids.isEmpty()) return m;
        for (CageDivision d : mapper.listByCageIds(ids)) {
            m.computeIfAbsent(d.getAnimalCageId(), k -> new ArrayList<>()).add(d);
        }
        return m;
    }

    /**
     * 全量覆盖这批笼位的划分名单（先删后插）。
     * 传空名单即等于清空 —— 支持「改划 / 撤销」两种操作走同一条路径。
     */
    @Transactional
    public int replaceBatch(List<Long> cageIds, List<AssigneeRef> assignees,
                            String operatorId, String operatorName, String groupName) {
        List<Long> ids = distinct(cageIds);
        if (ids.isEmpty()) return 0;
        mapper.deleteByCageIds(ids);
        int written = 0;
        if (assignees != null) {
            for (Long cageId : ids) {
                for (AssigneeRef a : assignees) {
                    if (a == null || a.id() == null || a.id().isBlank()) continue;
                    CageDivision row = new CageDivision();
                    row.setAnimalCageId(cageId);
                    row.setAssigneeId(a.id());
                    row.setAssigneeName(a.name());
                    row.setGroupName(groupName);
                    row.setCreatedBy(operatorId);
                    row.setCreatedByName(operatorName);
                    mapper.insert(row);
                    written++;
                }
            }
        }
        invalidate();
        return written;
    }

    /** 清除：不传 assigneeIds 则清空这批笼位的全部划分，否则只移除指定的人。 */
    @Transactional
    public int clearBatch(List<Long> cageIds, List<String> assigneeIds) {
        List<Long> ids = distinct(cageIds);
        if (ids.isEmpty()) return 0;
        List<String> aids = assigneeIds == null ? List.of()
                : assigneeIds.stream().filter(s -> s != null && !s.isBlank()).distinct().toList();
        int deleted = 0;
        if (aids.isEmpty()) {
            deleted = mapper.deleteByCageIds(ids);
        } else {
            for (Long cageId : ids) deleted += mapper.deleteByCageAndAssignee(cageId, aids);
        }
        invalidate();
        return deleted;
    }

    private void invalidate() {
        indexAt = 0L;
    }

    private static List<Long> distinct(Collection<Long> cageIds) {
        if (cageIds == null || cageIds.isEmpty()) return List.of();
        return cageIds.stream().filter(Objects::nonNull).distinct().toList();
    }

    /** 被划分人引用：人员选择组件回传的 id/name。 */
    public record AssigneeRef(String id, String name) {}
}
