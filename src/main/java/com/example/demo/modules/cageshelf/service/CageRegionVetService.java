package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.mapper.CageRegionVetMapper;
import com.example.demo.modules.identity.service.PersonIdentityService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 区域指定兽医（cage_region_vet）：健康异常「通知兽医」那条通道的收件人来源。
 *
 * <p><b>兽医是「指定人员」而不是「全部持 VETERINARIAN 标签的人」</b>（用户 2026-09-17 口径）：
 * 一个区域一般一位兽医，同一兽医可以覆盖多个区域（表里多行）。
 *
 * <p><b>解析：ROOM &gt; FLOOR &gt; CAMPUS 就近命中，同级取并集</b> —— 与阈值规则同一口径。
 * 同级并集而不是互斥拒绝：阈值那边「计时起点分歧」必须拒是因为会折出谁都没配过的第三态，
 * 这里并集有明确语义（多通知一位兽医），拒绝反而挡住合法的多人协同。
 *
 * <p>写入门槛由调用方（控制器）负责，与本服务的读/写语义无关；写入时校验每个账号确实是
 * VETERINARIAN 持有人 —— 这个接口在信任边界上，不能只靠前端候选列表把关。
 */
@Service
public class CageRegionVetService {

    /** 层级就近的优先序：ROOM 最细，CAMPUS 最粗。与 {@link CageAlertRuleService} 同序。 */
    private static final List<String> REGION_PRIORITY = List.of("ROOM", "FLOOR", "CAMPUS");

    private final CageRegionVetMapper mapper;
    private final CageRegionCapabilityService regionCapabilityService;
    private final PersonIdentityService personIdentityService;

    public CageRegionVetService(CageRegionVetMapper mapper,
                                CageRegionCapabilityService regionCapabilityService,
                                PersonIdentityService personIdentityService) {
        this.mapper = mapper;
        this.regionCapabilityService = regionCapabilityService;
        this.personIdentityService = personIdentityService;
    }

    /**
     * 某笼位该通知哪些兽医（账号 id 集合）。
     *
     * <p>一路都没配 → 空集，由调用方退回 push-config 里为该源配的接收人（通知不能凭空消失）。
     * 单笼位调用，一次 IN 查该笼位涉及的 3 个区域键，不做全表扫。
     */
    public Set<String> resolveVetsForCage(long cageId) {
        List<Map<String, String>> keys;
        try {
            Map<Long, List<Map<String, String>>> byCage =
                    regionCapabilityService.regionsOfCages(new ArrayList<>(List.of(cageId)));
            keys = byCage == null ? null : byCage.get(cageId);
        } catch (Exception e) {
            return Set.of();
        }
        if (keys == null || keys.isEmpty()) return Set.of();

        List<Map<String, String>> regions = new ArrayList<>();
        for (Map<String, String> k : keys) {
            if (k == null) continue;
            Map<String, String> one = new LinkedHashMap<>();
            one.put("regionType", str(k.get("regionType")));
            one.put("regionId", str(k.get("regionId")));
            if (one.get("regionType") != null && one.get("regionId") != null) regions.add(one);
        }
        if (regions.isEmpty()) return Set.of();
        List<Map<String, Object>> rows = mapper.listByRegions(regions);
        if (rows == null || rows.isEmpty()) return Set.of();

        // 就近命中即止：房间配过就不再看楼层/校区（与阈值规则的层级语义一致）。
        for (String type : REGION_PRIORITY) {
            String regionId = regionIdOf(keys, type);
            if (regionId == null) continue;
            Set<String> vets = new LinkedHashSet<>();
            for (Map<String, Object> r : rows) {
                if (r == null) continue;
                if (!type.equals(str(r.get("regionType"))) || !regionId.equals(str(r.get("regionId")))) continue;
                String vet = str(r.get("vetAccountId"));
                if (StringUtils.hasText(vet)) vets.add(vet);
            }
            if (!vets.isEmpty()) return vets;
        }
        return Set.of();
    }

    /**
     * 某区域的兽医配置视图（照 {@link CageAlertConfigService#regionView} 的形状）：
     * mine = 操作人自己配的 / others = 别人的（只读）。超管视角 mine 回该区域**全部**行、others 空
     * —— 超管保存即重置本区。
     */
    public Map<String, Object> regionVets(String regionType, String regionId,
                                          String operatorId, boolean asAdmin) {
        List<Map<String, Object>> rows = mapper.listByRegion(regionType, regionId);
        List<String> mine = new ArrayList<>();
        List<String> others = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            if (r == null) continue;
            String vet = str(r.get("vetAccountId"));
            if (!StringUtils.hasText(vet)) continue;
            if (asAdmin || operatorId.equals(str(r.get("configuredBy")))) mine.add(vet);
            else others.add(vet);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("regionType", regionType);
        out.put("regionId", regionId);
        out.put("asAdmin", asAdmin);
        out.put("mine", mine);
        out.put("others", others);
        return out;
    }

    /**
     * 全量替换**本人在该区域**指定的兽医（先删自己的后插，事务内）。asAdmin 时先清全区域再写。
     * 空列表是合法输入 = 本人在本区不再指定兽医（不是「不限」，兽医没有「不限」的语义）。
     */
    @Transactional
    public void replaceRegionVets(String regionType, String regionId, Collection<String> accountIds,
                                  String operatorId, boolean asAdmin) {
        if (!StringUtils.hasText(regionType) || !StringUtils.hasText(regionId)) {
            throw new IllegalArgumentException("区域类型与区域 id 必填");
        }
        LinkedHashSet<String> target = new LinkedHashSet<>();
        if (accountIds != null) {
            for (String id : accountIds) {
                if (StringUtils.hasText(id)) target.add(id.trim());
            }
        }
        // 必须在删行之前校验：先删后拒会把本区既有配置删光又没写回，留下半残。
        for (String id : target) {
            if (!personIdentityService.isVeterinarian(id)) {
                throw new IllegalArgumentException("账号 " + id + " 不是「兽医」身份，无法指定为区域兽医");
            }
        }
        if (asAdmin) {
            mapper.deleteAllRegionVets(regionType, regionId);
        } else {
            mapper.deleteRegionVets(regionType, regionId, operatorId);
        }
        for (String id : target) {
            mapper.insertRegionVet(regionType, regionId, id, operatorId);
        }
    }

    private static String regionIdOf(List<Map<String, String>> regionKeys, String type) {
        if (regionKeys == null) return null;
        for (Map<String, String> r : regionKeys) {
            if (r != null && type.equals(str(r.get("regionType")))) return str(r.get("regionId"));
        }
        return null;
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v).trim();
    }
}
