package com.example.demo.modules.dahua.service;

import com.example.demo.modules.dahua.entity.DahuaDeviceChannelCache;
import com.example.demo.modules.dahua.mapper.DahuaDeviceChannelCacheMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DahuaDeviceChannelCacheService {
    public static final int DEFAULT_DEVICE_CATEGORY = 8;
    /** 视频大类：IPC + NVR 通道，电视墙上墙的通道源。 */
    public static final int VIDEO_DEVICE_CATEGORY = 1;
    /**
     * 解码器/电视墙大类：设备「大屏」的输入槽位（槽位02-01…）、各解码器的 HDMIOUT 等。
     * 这些不在 1 类里，预设与真实上墙却会引用（如 `1000072$1$0$32`），不拉就永远选不到。
     */
    public static final int DECODER_DEVICE_CATEGORY = 45;
    /** 入库占位值：0 = 未按小类过滤（大华通道分页接口不回传设备小类，本地仅作标记）。 */
    public static final int DEVICE_TYPE_ALL = 0;

    /** 一次刷新要拉的大类：门禁 + 视频 + 解码器槽位。 */
    private static final int[] REFRESH_CATEGORIES = {
            DEFAULT_DEVICE_CATEGORY, VIDEO_DEVICE_CATEGORY, DECODER_DEVICE_CATEGORY};
    /** 电视墙的通道源：摄像机通道 + 解码器槽位 */
    private static final List<Integer> WALL_CHANNEL_CATEGORIES =
            List.of(VIDEO_DEVICE_CATEGORY, DECODER_DEVICE_CATEGORY);

    private final DahuaDeviceChannelCacheMapper mapper;
    private final DahuaOpenApiService openApiService;
    private final ObjectMapper objectMapper;
    private final DahuaDeviceChannelRemarkCategoryService remarkCategoryService;

    public DahuaDeviceChannelCacheService(DahuaDeviceChannelCacheMapper mapper,
                                          DahuaOpenApiService openApiService,
                                          ObjectMapper objectMapper,
                                          DahuaDeviceChannelRemarkCategoryService remarkCategoryService) {
        this.mapper = mapper;
        this.openApiService = openApiService;
        this.objectMapper = objectMapper;
        this.remarkCategoryService = remarkCategoryService;
    }

    public Map<String, Object> refreshFromUpstream() {
        Map<String, Object> stats = new HashMap<>();
        Map<String, Integer> byCategory = new LinkedHashMap<>();
        int total = 0;
        int synced = 0;
        for (int category : REFRESH_CATEGORIES) {
            List<Map<String, Object>> all = openApiService.fetchAllDeviceChannels(category, null);
            for (Map<String, Object> item : all) {
                DahuaDeviceChannelCache d = fromUpstreamMap(item, category);
                if (d.getId() == null) {
                    continue;
                }
                synced += mapper.upsert(d);
            }
            byCategory.put(String.valueOf(category), all.size());
            total += all.size();
        }
        stats.put("upstreamCount", total);
        stats.put("syncedRows", synced);
        stats.put("byCategory", byCategory);
        // 兼容旧字段
        stats.put("deviceCategory", DEFAULT_DEVICE_CATEGORY);
        stats.put("deviceType", DEVICE_TYPE_ALL);
        return stats;
    }

    /** 视频通道（IPC + NVR + 解码器槽位），读本地缓存。 */
    public List<DahuaDeviceChannelCache> listVideoChannels() {
        return mapper.listByDeviceCategory(WALL_CHANNEL_CATEGORIES);
    }

    public Map<String, Object> list(String keyword, String channelType, String ownerCode, Integer unitType,
                                      Long remarkCategoryId, boolean unassignedOnly,
                                      int page, int pageSize) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(pageSize, 1);
        int offset = (safePage - 1) * safeSize;
        Boolean ua = unassignedOnly ? Boolean.TRUE : null;
        Long rid = unassignedOnly ? null : remarkCategoryId;
        List<DahuaDeviceChannelCache> rows = mapper.list(keyword, channelType, ownerCode, unitType, rid, ua, offset, safeSize);
        int total = mapper.count(keyword, channelType, ownerCode, unitType, rid, ua);
        Map<String, Object> data = new HashMap<>();
        data.put("list", rows);
        data.put("total", total);
        data.put("page", safePage);
        data.put("pageSize", safeSize);
        return data;
    }

    /**
     * 设置通道备注分类；{@code remarkCategoryId} 为 null 表示清空。
     */
    public void setRemarkCategory(long channelId, Long remarkCategoryId) {
        if (remarkCategoryId != null) {
            remarkCategoryService.requireExists(remarkCategoryId);
        }
        int n = mapper.updateRemarkCategory(channelId, remarkCategoryId);
        if (n == 0) {
            throw new IllegalArgumentException("通道不存在");
        }
    }

    public Map<String, Object> facets() {
        Map<String, Object> data = new HashMap<>();
        data.put("channelTypes", mapper.distinctChannelTypes());
        data.put("ownerCodes", mapper.distinctOwnerCodes());
        data.put("unitTypes", mapper.distinctUnitTypes());
        return data;
    }

    public Map<String, Object> classifySummary() {
        Map<String, Object> data = new HashMap<>();
        data.put("total", mapper.count(null, null, null, null, null, null));
        data.put("byChannelType", rollup(mapper.statsByChannelType()));
        data.put("byOwnerCode", rollup(mapper.statsByOwnerCode()));
        data.put("byUnitType", rollup(mapper.statsByUnitType()));
        return data;
    }

    private static Map<String, Long> rollup(List<Map<String, Object>> rows) {
        Map<String, Long> out = new LinkedHashMap<>();
        if (rows == null) {
            return out;
        }
        for (Map<String, Object> row : rows) {
            Object k = row.get("bucketKey");
            Object c = row.get("cnt");
            String key = k == null ? "" : String.valueOf(k);
            long n = 0L;
            if (c instanceof Number num) {
                n = num.longValue();
            } else if (c != null) {
                try {
                    n = Long.parseLong(String.valueOf(c));
                } catch (NumberFormatException ignored) {
                    // keep 0
                }
            }
            out.put(key, n);
        }
        return out;
    }

    private DahuaDeviceChannelCache fromUpstreamMap(Map<String, Object> item, int deviceCategory) {
        DahuaDeviceChannelCache d = new DahuaDeviceChannelCache();
        d.setId(DahuaOpenApiService.parseLong(item.get("id")));
        d.setDeviceCode(str(item.get("deviceCode")));
        d.setUnitType(parseIntegerOrNull(item.get("unitType")));
        d.setUnitSeq(str(item.get("unitSeq")));
        d.setChannelSeq(str(item.get("channelSeq")));
        d.setChannelCode(str(item.get("channelCode")));
        d.setChannelSn(str(item.get("channelSn")));
        d.setChannelName(str(item.get("channelName")));
        d.setChannelType(str(item.get("channelType")));
        d.setCameraType(str(item.get("cameraType")));
        d.setOwnerCode(str(item.get("ownerCode")));
        d.setGpsX(str(item.get("gpsX")));
        d.setGpsY(str(item.get("gpsY")));
        d.setGpsZ(str(item.get("gpsZ")));
        d.setMapId(str(item.get("mapId")));
        d.setDomainId(str(item.get("domainId")));
        d.setMemo(str(item.get("memo")));
        d.setIsOnline(parseTinyInt(item.get("isOnline")));
        d.setStat(str(item.get("stat")));
        d.setSleepStat(str(item.get("sleepStat")));
        d.setAccessS(firstStr(item, "access", "accessS"));
        d.setCapability(toJsonText(item.get("capability")));
        d.setChExt(toJsonText(firstObj(item, "chExt", "ch_ext")));
        d.setIsVirtual(parseTinyInt(item.get("isVirtual")));
        d.setDeviceCategory(deviceCategory);
        d.setDeviceType(DEVICE_TYPE_ALL);
        return d;
    }

    private String toJsonText(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof String s) {
            return s;
        }
        try {
            return objectMapper.writeValueAsString(v);
        } catch (Exception e) {
            return String.valueOf(v);
        }
    }

    private static Object firstObj(Map<String, Object> item, String... keys) {
        for (String k : keys) {
            if (item.containsKey(k) && item.get(k) != null) {
                return item.get(k);
            }
        }
        return null;
    }

    private static String firstStr(Map<String, Object> item, String... keys) {
        Object v = firstObj(item, keys);
        return str(v);
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v);
        return s.isEmpty() ? null : s;
    }

    private static Integer parseIntegerOrNull(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception e) {
            return null;
        }
    }

    private static Integer parseTinyInt(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Boolean b) {
            return b ? 1 : 0;
        }
        Integer n = parseIntegerOrNull(v);
        return n;
    }
}
