package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import com.example.demo.modules.aup.entity.AupRecord;
import com.example.demo.modules.aup.mapper.AupRecordMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * 课题组管家解析：给定课题组，找出该组里所有持有 GROUP_STEWARD（课题组管家）身份的人。
 *
 * 用于表单「管家」字段的动态带出 —— 不落库，每次读表单值时按当前课题组实时算，
 * 这样管家换人或调组时看到的永远是最新值，不会残留过期的同步值。
 */
@Service
public class GroupStewardService {

    /** 与 PersonIdentityTagSeedBootstrap 种子一致的管家标签 code。 */
    private static final String GROUP_STEWARD_CODE = "GROUP_STEWARD";

    private final PersonnelMapper personnelMapper;
    private final AupRecordMapper aupRecordMapper;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;

    public GroupStewardService(PersonnelMapper personnelMapper, AupRecordMapper aupRecordMapper,
                               org.springframework.jdbc.core.JdbcTemplate jdbc) {
        this.personnelMapper = personnelMapper;
        this.aupRecordMapper = aupRecordMapper;
        this.jdbc = jdbc;
    }

    /**
     * 某笼位所属课题组里的全部管家姓名，顿号分隔；该课题组没有管家时返回 null（调用方保持原值）。
     */
    public String stewardsOfCage(CageCellDetail d) {
        if (d == null) return null;
        return stewardsOf(d.getAupNumber(), d.getProjectPiName(), d.getDepartmentName());
    }

    /**
     * 按 AUP 编号 + PI/部门 解析所属课题组并取管家姓名（顿号分隔）；无管家返回 null。
     * 供同步时在 mapped 字段上直接覆盖「管家」用，不依赖已落库的 detail。
     */
    public String stewardsOf(String aupNumber, String projectPiName, String departmentName) {
        String aupGroupName = null;
        if (aupNumber != null && !aupNumber.isBlank()) {
            AupRecord aup = aupRecordMapper.selectByRegisterNo(aupNumber);
            if (aup != null) aupGroupName = aup.getProjectGroupName();
        }
        return stewardsOfGroups(PersonnelProjectGroupUtil.groupNames(
                aupGroupName, projectPiName, departmentName));
    }

    private volatile List<Personnel> stewardCache;
    private volatile long cacheAt = 0L;
    /** 30 秒 TTL：读笼位表单值很频繁，避免每次都全表 JOIN；管家是低频变更的身份数据。 */
    private static final long CACHE_TTL_MS = 30_000L;

    private List<Personnel> stewards() {
        long now = System.currentTimeMillis();
        List<Personnel> c = stewardCache;
        if (c != null && now - cacheAt < CACHE_TTL_MS) return c;
        List<Personnel> fresh = personnelMapper.listByTagCode(GROUP_STEWARD_CODE);
        stewardCache = fresh;
        cacheAt = now;
        return fresh;
    }

    /**
     * 身份标签变更后重算：把该人员所属课题组下的所有笼位，「管家」字段重写一遍。
     *
     * 打上 GROUP_STEWARD → 名字写进去；撤掉 → 从字段里消失（该组没有别的管家时清空）。
     * **不挂在同步上** —— 同步只管 ARO 数据，管家跟身份标签走。
     *
     * @param personnelId **personnel.id**（不是 accountId）——`person_identity.user_id` 用的就是这个，
     *                    传 accountId 会查不到人、静默什么都不做。
     * 反查笼位走 PI 名：课题组名形如「XXX的课题组」，XXX 就是 `cage_cell_detail.project_pi_name`。
     */
    @Transactional
    public int refreshCagesForUser(String personnelId) {
        if (personnelId == null || personnelId.isBlank()) return 0;
        Long pid;
        try {
            pid = Long.valueOf(personnelId.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
        Personnel me = personnelMapper.findById(pid);
        if (me == null) return 0;
        List<String> groups = PersonnelProjectGroupUtil.splitGroups(me.getProjectGroupName());
        if (groups.isEmpty()) return 0;

        // 标签刚变过，缓存作废，重算时必须读最新身份
        stewardCache = null;
        cacheAt = 0L;

        int touched = 0;
        for (String g : groups) {
            String names = stewardsOfGroups(List.of(g));   // 该组当前全部管家，可能为 null（一个都没有）
            String pi = PersonnelProjectGroupUtil.extractPiPrefixFromGroupName(g);
            if (pi == null || pi.isBlank()) continue;
            List<Long> cageIds = jdbc.queryForList(
                    "SELECT animal_cage_id FROM cage_cell_detail WHERE project_pi_name = ?", Long.class, pi);
            for (Long cageId : cageIds) {
                if (cageId == null) continue;
                writeSteward(cageId, names);
                touched++;
            }
        }
        return touched;
    }

    /** 写「管家」到固定表 + 表单；value=null 表示清空（该课题组已无管家）。 */
    private void writeSteward(Long cageId, String value) {
        jdbc.update("UPDATE cage_cell_detail SET lab_assistant_name = ? WHERE animal_cage_id = ?", value, cageId);
        Long fieldId = stewardFieldId();
        if (fieldId != null) {
            // 表单侧唯一约束是 (animal_cage_id, field_id)，没有行时先插一行空壳再更新，避免"清空"漏掉没配过的笼位
            jdbc.update("INSERT IGNORE INTO cage_info_value (animal_cage_id, field_id, value_string, fill_source) VALUES (?, ?, NULL, 'SYNC')",
                    cageId, fieldId);
            jdbc.update("UPDATE cage_info_value SET value_string = ? WHERE animal_cage_id = ? AND field_id = ?",
                    value, cageId, fieldId);
        }
    }

    private volatile Long stewardFieldIdCache;

    private Long stewardFieldId() {
        if (stewardFieldIdCache != null) return stewardFieldIdCache;
        List<Long> ids = jdbc.queryForList(
                "SELECT id FROM cage_info_field WHERE canonical = 'lab_assistant_name' LIMIT 1", Long.class);
        if (ids.isEmpty()) return null;
        stewardFieldIdCache = ids.get(0);
        return stewardFieldIdCache;
    }

    /** 给定课题组名集合 → 这些组里所有管家的姓名（顿号分隔）；无命中返回 null。 */
    public String stewardsOfGroups(List<String> groups) {
        if (groups == null || groups.isEmpty()) return null;

        List<String> names = new ArrayList<>();
        for (Personnel p : stewards()) {
            if (p == null || p.getName() == null || p.getName().isBlank()) continue;
            for (String g : groups) {
                if (PersonnelProjectGroupUtil.belongsToGroup(p.getProjectGroupName(), g)) {
                    names.add(p.getName().trim());
                    break;
                }
            }
        }
        List<String> distinct = names.stream().distinct().toList();
        return distinct.isEmpty() ? null : String.join("、", distinct);
    }
}
