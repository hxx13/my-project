package com.example.demo.modules.cageshelf.service;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 回归：转移/复制/归档用的字段集合必须**父子同进退**。
 *
 * <p>2026-09-18 用户报「转移笼位或分笼时，轻微/中度/重度这些标签没跟着转移」。
 * 根因不是转移逻辑写错，而是仓库里**两份**字段白名单都只登记了 5 个状态的**父值**，
 * 漏了 3 个**子值**（严重程度、瘙痒、特殊饲养明细）：
 * <ul>
 *   <li>{@code ARCHIVE_CLEAR_CANONICALS} → 转移带不走子值（目标只剩「健康异常」），归档也清不掉（空笼位还挂着「中度」）；</li>
 *   <li>{@code OCCUPANCY_CANONICALS} → 占用复制/转笼带不走，退出也清不掉（另一条独立路径）。</li>
 * </ul>
 *
 * <p>漏登记是静默的：不报错，只有用户看得出来。所以两份集合都用这条测试钉住。
 */
class CageInfoValueTransferCanonicalsTest {

    /** 集合名 → 集合本体，失败信息里能直接看出是哪一份漏了 */
    private Map<String, Set<String>> bothSets() {
        Map<String, Set<String>> m = new LinkedHashMap<>();
        m.put("随占用迁移（转移/归档）", CageInfoValueService.transferableCanonicals());
        m.put("占用字段（复制/转笼/退出）", CageInfoValueService.OCCUPANCY_CANONICALS);
        return m;
    }

    @Test
    void 两份集合都必须含状态子值() {
        for (Map.Entry<String, Set<String>> e : bothSets().entrySet()) {
            String where = e.getKey();
            Set<String> set = e.getValue();
            assertTrue(set.contains(CageInfoValueService.HEALTH_SEVERITY_CANONICAL),
                    where + " 漏了健康异常严重程度（轻微/中度/重度）");
            assertTrue(set.contains(CageInfoValueService.HEALTH_ITCH_CANONICAL),
                    where + " 漏了健康异常「瘙痒」");
            assertTrue(set.contains(CageInfoValueService.SPECIAL_DETAIL_CANONICAL),
                    where + " 漏了特殊饲养明细（父状态 needs_special_feeding 在集合里）");
        }
    }

    @Test
    void 父状态本身也都在() {
        for (Map.Entry<String, Set<String>> e : bothSets().entrySet()) {
            for (String parent : new String[]{
                    "needs_division", "needs_special_feeding", "needs_transfer",
                    "has_health_abnormality", "needs_cohabitation"}) {
                assertTrue(e.getValue().contains(parent), e.getKey() + " 漏了父状态 " + parent);
            }
        }
    }

    @Test
    void 转移不带课题组归属() {
        Set<String> transferable = CageInfoValueService.transferableCanonicals();
        assertTrue(!transferable.contains("aup_number"), "AUP 锚笼位分配，不能跟着动物跑到目标笼位");
        assertTrue(!transferable.contains("project_pi_name"), "课题组归属锚笼位分配");
        assertTrue(!transferable.contains("project_name"), "项目名锚笼位分配");
        assertTrue(!transferable.contains("department_name"), "部门锚笼位分配");
    }
}
