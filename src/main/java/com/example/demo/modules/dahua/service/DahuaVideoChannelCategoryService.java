package com.example.demo.modules.dahua.service;

import com.example.demo.modules.dahua.entity.DahuaDeviceChannelCache;
import com.example.demo.modules.dahua.entity.DahuaVideoChannelCategory;
import com.example.demo.modules.dahua.mapper.DahuaDeviceChannelCacheMapper;
import com.example.demo.modules.dahua.mapper.DahuaVideoChannelCategoryMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 监控通道分类树。独立于门禁的备注分类（两套数据、两套接口）。
 *
 * 骨架照平台视频组织树生成（等价 ICC 客户端实时预览左侧树）：实验动物中心 → 楼层 → 区，
 * 只播一次种；之后靠手工维护（新增文件夹 / 重命名 / 删除 / 挪通道），手动分类不会被自动覆盖。
 * 另把点位表里的设备 IP 补写进通道的跳转地址（只填空着的）。
 */
@Service
public class DahuaVideoChannelCategoryService {

    private static final Logger log = LoggerFactory.getLogger(DahuaVideoChannelCategoryService.class);

    private static final int VIDEO_DEVICE_CATEGORY = 1;
    /** 解码器/电视墙大类：槽位02-01、HDMIOUT… 这些「大屏」的输入口 */
    private static final int DECODER_DEVICE_CATEGORY = 45;
    /** 电视墙通道源 = 摄像机 + 解码器槽位，与 DahuaDeviceChannelCacheService 的口径一致 */
    private static final List<Integer> WALL_CATEGORIES =
            List.of(VIDEO_DEVICE_CATEGORY, DECODER_DEVICE_CATEGORY);
    private static final long ROOT = 0L;
    private static final String LINKS_CSV = "db/video-channel-links.csv";
    private static final String LINK_FIXES_CSV = "db/video-channel-link-fixes.csv";

    /** 分类根节点，与 ICC 客户端实时预览一致；也是「骨架是不是这一版」的判据 */
    private static final String ROOT_NODE = "实验动物中心";
    /** 平台视频域组织根节点（客户端实时预览用的那棵树） */
    private static final String VIDEO_ORG_ROOT = "L02";
    /** 完全没有位置信息的通道收在这里 */
    private static final String NO_FLOOR_NODE = "未标注";
    /** 名称里的楼层，如 `RD1-JK01 1F缓冲间` 的 `1F`、`GYB1F-JK01` 的 `B1F` */
    private static final Pattern FLOOR = Pattern.compile("(B1F|\\d+F)");
    /** 房号里的地下室段：`E10-B106`、`（E10B-B112）` */
    private static final Pattern ROOM_BASEMENT = Pattern.compile("(?:^|[-（(\\s])B(\\d)");
    /** 房号：`(465)`、`（E10-B106）` */
    private static final Pattern ROOM = Pattern.compile("[（(]([^）)]{2,})[）)]");
    /** B1F 分区编号：`E10-`、`E11A-`、`E12-` */
    private static final Pattern ROOM_ZONE = Pattern.compile("E(\\d+[A-C]?)\\s*-");

    private final DahuaVideoChannelCategoryMapper categoryMapper;
    private final DahuaDeviceChannelCacheMapper channelMapper;
    private final DahuaOpenApiService openApiService;

    /** 种子只在每个进程里播一次：每次请求都跑几百条 UPDATE 会拖慢分类树接口 */
    private volatile boolean linkSeedDone = false;

    public DahuaVideoChannelCategoryService(DahuaVideoChannelCategoryMapper categoryMapper,
                                            DahuaDeviceChannelCacheMapper channelMapper,
                                            DahuaOpenApiService openApiService) {
        this.categoryMapper = categoryMapper;
        this.channelMapper = channelMapper;
        this.openApiService = openApiService;
    }

    /** 只取视频输入通道：解码器输出口、报警、音频、门禁通道都不参与分类 */
    private List<DahuaDeviceChannelCache> videoChannels() {
        return channelMapper.listByDeviceCategory(WALL_CATEGORIES).stream()
                .filter(c -> c.getUnitType() != null && c.getUnitType() == 1)
                .toList();
    }

    /** 重建分类树：清掉现有分类与归属，照平台视频组织树重新播一次（会覆盖手工分类） */
    public Map<String, Object> rebuild() {
        channelMapper.clearVideoCategory(WALL_CATEGORIES);
        categoryMapper.deleteAll();
        seedByLocation();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("nodes", categoryMapper.listAll().size());
        out.put("channels", videoChannels().size());
        return out;
    }

    /** 全部节点（扁平，前端自己拼树）+ 每个节点直挂的通道数。树为空时先播种。 */
    public List<Map<String, Object>> listTree() {
        ensureTreeSeeded();
        seedLinkUrls();
        Map<Long, Integer> counts = new HashMap<>();
        for (Map<String, Object> row : categoryMapper.countChannelsByNode()) {
            Object nodeId = row.get("nodeId");
            Object cnt = row.get("cnt");
            if (nodeId != null && cnt != null) {
                counts.put(Long.valueOf(String.valueOf(nodeId)), Integer.valueOf(String.valueOf(cnt)));
            }
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (DahuaVideoChannelCategory c : categoryMapper.listAll()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("parentId", c.getParentId());
            m.put("name", c.getName());
            m.put("sortOrder", c.getSortOrder());
            m.put("channelCount", counts.getOrDefault(c.getId(), 0));
            out.add(m);
        }
        return out;
    }

    public Map<String, Object> createNode(Long parentId, String name) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("文件夹名称不能为空");
        }
        long pid = parentId == null ? ROOT : parentId;
        if (pid != ROOT && categoryMapper.findById(pid) == null) {
            throw new IllegalArgumentException("父节点不存在");
        }
        if (categoryMapper.findIdByParentAndName(pid, trimmed) != null) {
            throw new IllegalArgumentException("同级下已有同名文件夹");
        }
        DahuaVideoChannelCategory row = new DahuaVideoChannelCategory();
        row.setParentId(pid);
        row.setName(trimmed);
        row.setSortOrder(0);
        categoryMapper.insert(row);
        return Map.of("id", row.getId(), "parentId", pid, "name", trimmed);
    }

    public void renameNode(long id, String name) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("文件夹名称不能为空");
        }
        DahuaVideoChannelCategory node = categoryMapper.findById(id);
        if (node == null) {
            throw new IllegalArgumentException("节点不存在");
        }
        Long dup = categoryMapper.findIdByParentAndName(node.getParentId(), trimmed);
        if (dup != null && dup != id) {
            throw new IllegalArgumentException("同级下已有同名文件夹");
        }
        categoryMapper.updateName(id, trimmed);
    }

    /** 只允许删空文件夹：有子节点就先删子节点，免得通道被静默挪走。 */
    public void deleteNode(long id) {
        if (categoryMapper.findById(id) == null) {
            throw new IllegalArgumentException("节点不存在");
        }
        boolean hasChild = categoryMapper.listAll().stream()
                .anyMatch(c -> c.getParentId() != null && c.getParentId() == id);
        if (hasChild) {
            throw new IllegalArgumentException("该文件夹下还有子文件夹，请先删除子文件夹");
        }
        channelMapper.updateVideoCategoryByNode(id, null);
        categoryMapper.deleteById(id);
    }

    /** 把一路通道挪到某个节点；nodeId = null 表示移出到「未分类」。 */
    public void assignChannel(long channelId, Long nodeId) {
        if (nodeId != null && categoryMapper.findById(nodeId) == null) {
            throw new IllegalArgumentException("节点不存在");
        }
        channelMapper.updateVideoCategory(channelId, nodeId);
    }

    /**
     * 设置通道的设备跳转地址。允许只填 IP（自动补 http:// 与结尾斜杠），
     * 也允许填完整地址；传空则清除。只放行 http/https，挡掉 javascript: 之类的伪协议。
     */
    public void setChannelLink(long channelId, String rawUrl) {
        String url = rawUrl == null ? "" : rawUrl.trim();
        if (url.isEmpty()) {
            channelMapper.updateLinkUrl(channelId, null);
            return;
        }
        if (!url.contains("://")) {
            url = "http://" + url;
        }
        String lower = url.toLowerCase();
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
            throw new IllegalArgumentException("只支持 http/https 地址");
        }
        if (url.endsWith("/")) {
            channelMapper.updateLinkUrl(channelId, url);
        } else {
            channelMapper.updateLinkUrl(channelId, url + "/");
        }
    }

    /**
     * 骨架照 ICC 客户端实时预览的树（实验动物中心 → B1F/1F/2F/3F/4F，B1F 再分区）。
     * 判据是根节点「实验动物中心」+ 直接子节点「B1F」；两者都在说明已经按平台树播过种，
     * 之后无论手工怎么改都不再自动重建（只有手动点「重建分类」才会覆盖）。
     */
    private void ensureTreeSeeded() {
        List<DahuaVideoChannelCategory> all = categoryMapper.listAll();
        Long rootId = all.stream()
                .filter(n -> ROOT_NODE.equals(n.getName()) && (n.getParentId() == null || n.getParentId() == ROOT))
                .map(DahuaVideoChannelCategory::getId)
                .findFirst().orElse(null);
        boolean seededFromPlatform = rootId != null && all.stream()
                .anyMatch(n -> "B1F".equals(n.getName()) && rootId.equals(n.getParentId()));
        if (seededFromPlatform) {
            return;
        }
        channelMapper.clearVideoCategory(WALL_CATEGORIES);
        categoryMapper.deleteAll();
        seedByLocation();
    }

    /**
     * 播种：直接照抄平台的视频组织树（`tree/client/device-org`，根节点 L02），
     * 节点与通道归属都以平台为准，不解析通道名称。
     * 平台接口不可用时退回按名称推断（楼层 → 区）。
     */
    private void seedByLocation() {
        List<Map<String, Object>> orgs = openApiService.fetchVideoOrgTree(VIDEO_ORG_ROOT);
        if (orgs.isEmpty()) {
            seedFromNames();
            return;
        }
        Map<String, Long> nodeByCode = new LinkedHashMap<>();
        // 先按层级深度建节点，父节点一定先于子节点出现
        List<Map<String, Object>> sorted = new ArrayList<>(orgs);
        sorted.sort((a, b) -> String.valueOf(a.get("code")).length() - String.valueOf(b.get("code")).length());
        for (Map<String, Object> org : sorted) {
            String code = String.valueOf(org.get("code"));
            Object parentCode = org.get("parentCode");
            long parentId = parentCode == null ? ROOT : nodeByCode.getOrDefault(String.valueOf(parentCode), ROOT);
            String name = String.valueOf(org.get("name"));
            int sort = org.get("sort") instanceof Number n ? n.intValue() : 0;
            nodeByCode.put(code, insertNode(parentId, name, sort));
        }
        for (Map<String, Object> org : orgs) {
            Long nodeId = nodeByCode.get(String.valueOf(org.get("code")));
            if (nodeId == null) {
                continue;
            }
            for (Map<String, Object> ch : DahuaOpenApiService.asListOfMap(org.get("channel"))) {
                Object channelCode = ch.get("channelCode");
                if (channelCode == null) {
                    continue;
                }
                channelMapper.updateVideoCategoryByChannelCode(String.valueOf(channelCode), nodeId);
            }
        }
    }

    /** 兜底：平台树取不到时，按通道名推断「楼层 → 区」 */
    private void seedFromNames() {
        List<DahuaDeviceChannelCache> channels = videoChannels();
        long root = insertNode(ROOT, ROOT_NODE, 0);
        Map<String, Long> floorNodes = new LinkedHashMap<>();
        Map<String, Long> zoneNodes = new LinkedHashMap<>();
        for (DahuaDeviceChannelCache c : channels) {
            String name = c.getChannelName() == null ? "" : c.getChannelName();
            String floor = inferFloor(name);
            if (floor == null) {
                long unlabeled = floorNodes.computeIfAbsent(NO_FLOOR_NODE, n -> insertNode(root, n, 900));
                channelMapper.updateVideoCategory(c.getId(), unlabeled);
                continue;
            }
            long floorId = floorNodes.computeIfAbsent(floor, f -> insertNode(root, f, floorRank(f)));
            long target = floorId;
            String zone = "B1F".equals(floor) ? zoneOf(name) : null;
            if (zone != null) {
                target = zoneNodes.computeIfAbsent(zone, z -> insertNode(floorId, z, zoneRank(z)));
            }
            channelMapper.updateVideoCategory(c.getId(), target);
        }
    }

    /** 楼层推断：显式 `2F` → 房号地下室段 `E10-B106` → 房号首字 `(465)`；推不出返回 null */
    private static String inferFloor(String name) {
        Matcher fm = FLOOR.matcher(name);
        if (fm.find()) {
            return fm.group(1);
        }
        Matcher bm = ROOM_BASEMENT.matcher(name);
        if (bm.find()) {
            return "B" + bm.group(1) + "F";
        }
        Matcher rm = ROOM.matcher(name);
        if (rm.find()) {
            Matcher d = Pattern.compile("(\\d{3,})").matcher(rm.group(1));
            if (d.find()) {
                return d.group(1).charAt(0) + "F";
            }
        }
        return null;
    }

    /** B1F 分区：房号里的 `E10-B106` / `E11A-B115` → `E10区` / `E11A区` */
    private static String zoneOf(String name) {
        Matcher m = ROOM_ZONE.matcher(name);
        return m.find() ? "E" + m.group(1) + "区" : null;
    }

    /** 楼层顺序与 ICC 一致：B1F、1F、2F、3F、4F */
    private static int floorRank(String floor) {
        if ("B1F".equals(floor)) return 0;
        Matcher m = Pattern.compile("^(\\d+)F$").matcher(floor);
        return m.matches() ? Integer.parseInt(m.group(1)) : 90;
    }

    /** 分区顺序：E10、E11A、E11B、E11C、E12 */
    private static int zoneRank(String zone) {
        List<String> order = List.of("E10区", "E11A区", "E11B区", "E11C区", "E12区");
        int i = order.indexOf(zone);
        return i >= 0 ? i : order.size();
    }

    private long insertNode(long parentId, String name, int sortOrder) {
        DahuaVideoChannelCategory node = new DahuaVideoChannelCategory();
        node.setParentId(parentId);
        node.setName(name);
        node.setSortOrder(sortOrder);
        categoryMapper.insert(node);
        return node.getId();
    }

    /**
     * IP 种子：把 {@code db/video-channel-links.csv} 里（由点位表生成）的设备地址填进去。
     * 只填空着的，人工改过的不覆盖；表里没有的（SY-NVR-* 那批）留空，等人工补。
     */
    private void seedLinkUrls() {
        if (linkSeedDone) {
            return;
        }
        synchronized (this) {
            if (linkSeedDone) {
                return;
            }
            // 通道缓存还没同步进来时先不标记完成，等下次请求再播
            if (channelMapper.countVideoChannels() == 0) {
                return;
            }
            try {
                int n = 0;
                ClassPathResource res = new ClassPathResource(LINKS_CSV);
                if (res.exists()) {
                    try (BufferedReader r = new BufferedReader(
                            new InputStreamReader(res.getInputStream(), StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = r.readLine()) != null) {
                            if (line.isBlank() || line.startsWith("#")) {
                                continue;
                            }
                            String[] parts = line.split(",", 2);
                            if (parts.length != 2 || parts[0].isBlank() || parts[1].isBlank()) {
                                continue;
                            }
                            n += channelMapper.seedLinkUrlIfEmpty(parts[0].trim(), parts[1].trim());
                        }
                    }
                }
                int fixed = fixWrongLinkUrls();
                linkSeedDone = true;
                int empty = channelMapper.countEmptyVideoLinks();
                log.info("[video-channel] 跳转地址补写 {} 条，定向修正 {} 条，仍为空 {} 条", n, fixed, empty);
            } catch (Exception e) {
                log.warn("[video-channel] 跳转地址种子写入失败：{}", e.getMessage());
            }
        }
    }

    /**
     * 同楼层 RD1/RD2 的 JK 号会重号，通道名里又没带组，早期种子按 JK 号把 RD2 房间对到了 RD1 的地址。
     * 修正文件给出「通道 → 旧地址 → 正确地址」，只改当前仍是旧值的行，人工改过的不动。
     */
    private int fixWrongLinkUrls() throws IOException {
        ClassPathResource res = new ClassPathResource(LINK_FIXES_CSV);
        if (!res.exists()) {
            return 0;
        }
        int fixed = 0;
        try (BufferedReader r = new BufferedReader(
                new InputStreamReader(res.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                if (line.isBlank() || line.startsWith("#")) {
                    continue;
                }
                String[] parts = line.split(",", 3);
                if (parts.length != 3 || parts[0].isBlank() || parts[1].isBlank() || parts[2].isBlank()) {
                    continue;
                }
                fixed += channelMapper.fixLinkUrlIfOld(parts[0].trim(), parts[1].trim(), parts[2].trim());
            }
        }
        return fixed;
    }
}
