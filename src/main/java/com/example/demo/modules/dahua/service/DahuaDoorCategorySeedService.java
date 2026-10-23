package com.example.demo.modules.dahua.service;

import com.example.demo.modules.dahua.entity.DahuaDeviceChannelRemarkCategory;
import com.example.demo.modules.dahua.mapper.DahuaDeviceChannelCacheMapper;
import com.example.demo.modules.dahua.mapper.DahuaDeviceChannelRemarkCategoryMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 按大华门禁平台的分区（楼层）给本地门禁通道建一级文件夹。
 *
 * 注意：门组（2F饲养员、清洗间工作人员…）是**人员授权**用的资源，不是通道分类；
 * 这里只取门组明细里每个通道自己的 orgName（实验动物中心B1F/1F/2F/3F/4F）作为楼层。
 * 首次执行（种子标记不存在）覆盖所有通道；之后只填未分类，人工文件夹保留。
 */
@Service
public class DahuaDoorCategorySeedService {
    private static final String[] FLOORS = {"B1F", "1F", "2F", "3F", "4F"};

    private final DahuaOpenApiService openApiService;
    private final DahuaDeviceChannelRemarkCategoryService categoryService;
    private final DahuaDeviceChannelRemarkCategoryMapper categoryMapper;
    private final DahuaDeviceChannelCacheMapper channelMapper;
    private final JdbcTemplate jdbcTemplate;

    public DahuaDoorCategorySeedService(DahuaOpenApiService openApiService,
                                        DahuaDeviceChannelRemarkCategoryService categoryService,
                                        DahuaDeviceChannelRemarkCategoryMapper categoryMapper,
                                        DahuaDeviceChannelCacheMapper channelMapper,
                                        JdbcTemplate jdbcTemplate) {
        this.openApiService = openApiService;
        this.categoryService = categoryService;
        this.categoryMapper = categoryMapper;
        this.channelMapper = channelMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    public Map<String, Object> seed() {
        List<Map<String, Object>> groups = openApiService.fetchDoorGroupsWithDetails();
        boolean firstRun = !seedApplied();

        Map<String, Long> floorIds = new LinkedHashMap<>();
        for (int i = 0; i < FLOORS.length; i++) {
            DahuaDeviceChannelRemarkCategory root = categoryService.ensureFolder(FLOORS[i], null, (i + 1) * 10);
            categoryMapper.updateSortOrder(root.getId(), (i + 1) * 10);
            floorIds.put(FLOORS[i], root.getId());
        }

        // 通道 -> 它自己的组织（门组明细里的 orgName；同一门组里各通道的组织也可能不同）
        Map<String, String> orgByChannel = new HashMap<>();
        for (Map<String, Object> group : groups) {
            List<Map<String, Object>> details = DahuaOpenApiService.asListOfMap(group.get("doorGroupDetail"));
            for (Map<String, Object> ch : details) {
                String code = str(ch.get("channelCode")).trim();
                String org = str(ch.get("orgName")).trim();
                if (StringUtils.hasText(code) && StringUtils.hasText(org)) {
                    orgByChannel.putIfAbsent(code, org);
                }
            }
        }

        int assigned = 0;
        int skipped = 0;
        int ungrouped = 0;
        for (Map<String, Object> channel : channelMapper.listDoorChannelsLite()) {
            if (!firstRun && channel.get("remarkCategoryId") != null) {
                skipped++;
                continue;
            }
            String code = str(channel.get("channelCode")).trim();
            String floor = floorOf(orgByChannel.get(code));
            Long channelId = DahuaOpenApiService.parseLong(channel.get("id"));
            Long folderId = floor == null ? null : floorIds.get(floor);
            if (folderId == null || channelId == null) {
                ungrouped++;
                continue;
            }
            assigned += channelMapper.updateRemarkCategory(channelId, folderId);
        }

        if (firstRun) {
            jdbcTemplate.update("INSERT IGNORE INTO dahua_door_category_seed (id) VALUES (1)");
        }
        Map<String, Object> stats = new HashMap<>();
        stats.put("firstRun", firstRun);
        stats.put("groupCount", groups.size());
        stats.put("floors", floorIds.size());
        stats.put("assigned", assigned);
        stats.put("kept", skipped);
        stats.put("ungrouped", ungrouped);
        return stats;
    }

    private boolean seedApplied() {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM dahua_door_category_seed WHERE id = 1", Integer.class);
        return n != null && n > 0;
    }

    /** 实验动物中心2F → 2F；不是楼层组织返回 null（留给未分类/人工归类） */
    private static String floorOf(String orgName) {
        if (!StringUtils.hasText(orgName)) return null;
        String o = orgName.trim();
        if (!o.startsWith("实验动物中心")) return null;
        String rest = o.substring("实验动物中心".length()).trim();
        for (String floor : FLOORS) {
            if (floor.equals(rest)) return floor;
        }
        return null;
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v);
    }
}
