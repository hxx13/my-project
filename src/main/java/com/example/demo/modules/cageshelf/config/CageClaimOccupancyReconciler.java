package com.example.demo.modules.cageshelf.config;

import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.service.CageInfoValueService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 历史数据修正：修复「到位确认写占用」上线前已 confirmed 的认领——
 * 这些笼位仍停在 cage_type_code=2 且未写入占用者，导致归档提示「无笼盒/未占用」、网格状态错。
 * 幂等：仅处理仍为 type2(或缺失) 的 confirmed 笼位，修到 type3 后跳过。
 */
@Component
@Order(200)
public class CageClaimOccupancyReconciler implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CageClaimOccupancyReconciler.class);
    private final JdbcTemplate jdbc;
    private final CageCellDetailMapper detailMapper;
    private final CageInfoValueService infoValueService;

    public CageClaimOccupancyReconciler(JdbcTemplate jdbc,
                                        CageCellDetailMapper detailMapper,
                                        CageInfoValueService infoValueService) {
        this.jdbc = jdbc;
        this.detailMapper = detailMapper;
        this.infoValueService = infoValueService;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT animal_cage_id, claimant_name FROM cage_claims WHERE claim_status = 'confirmed'");
            int fixed = 0;
            for (Map<String, Object> row : rows) {
                Long cageId = toLong(row.get("animal_cage_id"));
                String name = row.get("claimant_name") == null ? null : String.valueOf(row.get("claimant_name"));
                if (cageId == null) continue;
                CageCellDetail d = detailMapper.selectByAnimalCageId(cageId);
                if (d != null && d.getCageTypeCode() != null && d.getCageTypeCode() == 3) continue;
                if (d == null) {
                    d = new CageCellDetail();
                    d.setAnimalCageId(cageId);
                }
                d.setCageTypeCode(3);
                detailMapper.batchUpsert(List.of(d));
                if (name != null && !name.isBlank()) {
                    infoValueService.syncFromMapped(cageId, Map.of("experimenter_name", name));
                }
                fixed++;
            }
            if (fixed > 0) {
                log.info("[cage-claim-reconcile] 修正 confirmed 笼位 {} 条（2→3 + 写占用者）", fixed);
            }
        } catch (Exception e) {
            log.warn("[cage-claim-reconcile] 跳过: {}", e.getMessage());
        }
    }

    private Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
