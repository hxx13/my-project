package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.cageshelf.entity.CageExperimentRecord;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageExperimentRecordMapper;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.service.PersonnelService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 笼位实验记录台账 —— 纯读写，不做身份判定。
 *
 * <p>「谁能看 / 谁能写」在 {@link CageOperationService#canViewExperimentRecords} 与
 * {@link CageOperationService#canWriteExperimentRecords}（那里已经握着课题组、区域分配、
 * 本人、AUP 组长这几套判据）。这样依赖是单向的：CageOperationService → 本服务，
 * 反向调用会成环。
 *
 * <p>**故意没有**改/删已提交记录的方法 —— 台账不可编辑不可删除是设计约束。
 */
@Service
public class CageExperimentRecordService {

    private static final Logger log = LoggerFactory.getLogger(CageExperimentRecordService.class);
    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final CageExperimentRecordMapper mapper;
    private final UserDisplayNameService userDisplayNameService;
    private final CageFormAuditService auditService;
    private final CageCellIndexMapper cellIndexMapper;
    private final PersonnelService personnelService;

    public CageExperimentRecordService(CageExperimentRecordMapper mapper,
                                       UserDisplayNameService userDisplayNameService,
                                       CageFormAuditService auditService,
                                       CageCellIndexMapper cellIndexMapper,
                                       PersonnelService personnelService) {
        this.mapper = mapper;
        this.userDisplayNameService = userDisplayNameService;
        this.auditService = auditService;
        this.cellIndexMapper = cellIndexMapper;
        this.personnelService = personnelService;
    }

    /**
     * 同一个人的**所有账号形态**：personnel.id / STAFF_ / ARO 编号。
     *
     * <p>一个人既可能是 {@code STAFF_xxx}（教职工入口）又可能是 ARO 编号（学生入口），
     * 台账按其中任意一种存都会漏：换个入口登录就看不到自己的草稿、「我的实验记录」也会少几笼
     * （通知模块踩过同一个坑）。所以查询一律按这一组 id 收口。
     */
    private List<String> authorKeys(User user) {
        LinkedHashSet<String> keys = new LinkedHashSet<>();
        Personnel p = personnelService.resolveByAccount(user.getId());
        if (p != null) {
            // 人员的两种账号形态都要带上：只带登录用的那一种，另一种形态写下的草稿就看不见了
            keys.add(p.getStaffId());
            keys.add(p.getAroUserId());
            keys.add(String.valueOf(p.getId()));
        }
        keys.add(user.getId());            // 兜底：解析不到人员行时至少按当前账号 id
        keys.removeIf(k -> k == null || k.isBlank());
        return new ArrayList<>(keys);
    }

    /** 写入时用的**规范作者键**：优先 personnel.id，解析不到才退回账号 id。 */
    private String canonicalAuthorId(User user) {
        String pid = personnelService.resolveIdByAccount(user.getId());
        return (pid != null && !pid.isBlank()) ? pid : user.getId();
    }

    /** 台账正卷（已提交，不带归档） */
    public List<CageExperimentRecord> listSubmitted(Long animalCageId) {
        return mapper.selectSubmitted(animalCageId);
    }

    /** 记录模式用：全部记录含归档 */
    public List<CageExperimentRecord> listAll(Long animalCageId) {
        return mapper.selectAll(animalCageId);
    }

    /** 「我的实验记录」：本人写过的全部记录（含已在历史笼位上归档的） */
    public List<CageExperimentRecord> listMine(User user) {
        return mapper.selectByAuthors(authorKeys(user));
    }

    /**
     * 「我的实验记录」按**房间**分组，供学生端弹窗按房间树看自己的记录。
     *
     * <p>笼位是「我写过的」而不是「我正在用的」—— 失去权限/笼位归档之后记录还在（已归档），
     * 所以历史笼位照样列得出来，这正是学生要的「从开始到最终失去权限的全部快照」。
     * 位置一次性批量查（{@code lookupByAnimalCageIds}），不逐格查。
     *
     * @return [{roomId, roomName, campusName, areaName, floorName, cages:[{animalCageId, shelveName,
     *          positionX, positionY, archived, records:[...]}]}]
     */
    public List<Map<String, Object>> groupMineByRoom(User user) {
        List<CageExperimentRecord> rows = listMine(user);
        if (rows.isEmpty()) return List.of();

        List<Long> cageIds = new ArrayList<>();
        Map<Long, List<CageExperimentRecord>> byCage = new LinkedHashMap<>();
        for (CageExperimentRecord r : rows) {
            Long cageId = r.getAnimalCageId();
            if (cageId == null) continue;
            List<CageExperimentRecord> bucket = byCage.get(cageId);
            if (bucket == null) {
                bucket = new ArrayList<>();
                byCage.put(cageId, bucket);
                cageIds.add(cageId);
            }
            bucket.add(r);
        }
        if (cageIds.isEmpty()) return List.of();

        Map<Long, Map<String, Object>> locByCage = new HashMap<>();
        try {
            for (Map<String, Object> loc : cellIndexMapper.lookupByAnimalCageIds(cageIds)) {
                if (loc == null) continue;
                Object id = loc.get("animalCageId");
                if (id instanceof Number n) locByCage.put(n.longValue(), loc);
            }
        } catch (Exception e) {
            log.warn("[cage-exp-record] 我的实验记录位置解析失败: {}", e.getMessage());
        }

        Map<String, Map<String, Object>> byRoom = new LinkedHashMap<>();
        for (Map.Entry<Long, List<CageExperimentRecord>> e : byCage.entrySet()) {
            Map<String, Object> loc = locByCage.get(e.getKey());
            String roomId = loc == null ? "" : text(loc.get("roomId"));
            Map<String, Object> room = byRoom.computeIfAbsent(roomId.isEmpty() ? "__none__" : roomId, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("roomId", roomId);
                m.put("roomName", loc == null ? "未知房间" : text(loc.get("roomName")));
                m.put("campusName", loc == null ? "" : text(loc.get("campusName")));
                m.put("areaName", loc == null ? "" : text(loc.get("areaName")));
                m.put("floorName", loc == null ? "" : text(loc.get("floorName")));
                m.put("cages", new ArrayList<Map<String, Object>>());
                return m;
            });

            List<CageExperimentRecord> recs = e.getValue();
            boolean archived = recs.stream()
                    .allMatch(r -> CageExperimentRecord.STATUS_ARCHIVED.equals(r.getStatus()));
            Map<String, Object> cage = new LinkedHashMap<>();
            cage.put("animalCageId", e.getKey());
            cage.put("shelveName", loc == null ? "" : text(loc.get("shelveName")));
            cage.put("positionX", loc == null ? null : loc.get("positionX"));
            cage.put("positionY", loc == null ? null : loc.get("positionY"));
            // 整个笼位的记录都归档了 = 我已失去这个笼位（转让/归档），前端按「历史笼位」折叠
            cage.put("archived", archived);
            cage.put("records", recs);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> cages = (List<Map<String, Object>>) room.get("cages");
            cages.add(cage);
        }
        return new ArrayList<>(byRoom.values());
    }

    private static String text(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    /**
     * images_json 是 MySQL JSON 列：空串/空白写进去会报 invalid JSON。
     * 前端「没图」有两种写法（不传 / 传 ""），这里统一折成 NULL。
     */
    private static String normImages(String imagesJson) {
        return (imagesJson == null || imagesJson.isBlank()) ? null : imagesJson;
    }

    /**
     * 转移 / 分笼：把来源笼位的台账整体复制到目标笼位 —— 记录跟着动物走。
     *
     * <p>与旧的 {@code copyTransferableFields} / {@code copyFrom} 对
     * {@code experiment_desc} 做的事一一对应（那两个复制点就是旧字段「跟随笼位」的全部原因），
     * 台账替换旧字段后复制也要跟着搬过来，否则一转移记录就断在原地。
     * 已归档的不复制 —— 归档件只留在来源笼位的记录模式里。
     */
    @Transactional(rollbackFor = Exception.class)
    public int copyForCage(Long fromCageId, Long toCageId) {
        if (fromCageId == null || toCageId == null || fromCageId.equals(toCageId)) return 0;
        int n = 0;
        for (CageExperimentRecord src : mapper.selectAll(fromCageId)) {
            if (src == null || CageExperimentRecord.STATUS_ARCHIVED.equals(src.getStatus())) continue;
            CageExperimentRecord c = new CageExperimentRecord();
            c.setAnimalCageId(toCageId);
            c.setAuthorId(src.getAuthorId());
            c.setAuthorName(src.getAuthorName());
            c.setContent(src.getContent());
            c.setImagesJson(src.getImagesJson());
            c.setStatus(src.getStatus());
            c.setSubmittedAt(src.getSubmittedAt());
            mapper.insert(c);
            n++;
        }
        return n;
    }

    public CageExperimentRecord myDraft(Long animalCageId, User user) {
        return mapper.selectDraft(animalCageId, authorKeys(user));
    }

    /**
     * 保存草稿（upsert）：没有就建一条，有就覆盖内容。
     * 同人同笼位最多一条草稿 —— 这就是「草稿未提交时不能再新增下一条」的落点。
     */
    @Transactional(rollbackFor = Exception.class)
    public void saveDraft(Long animalCageId, User user, String content, String imagesJson) {
        CageExperimentRecord existing = mapper.selectDraft(animalCageId, authorKeys(user));
        if (existing != null) {
            mapper.updateDraftContent(existing.getId(), content, normImages(imagesJson));
            return;
        }
        CageExperimentRecord r = new CageExperimentRecord();
        r.setAnimalCageId(animalCageId);
        r.setAuthorId(canonicalAuthorId(user));
        r.setAuthorName(displayName(user));
        r.setContent(content);
        r.setImagesJson(normImages(imagesJson));
        r.setStatus(CageExperimentRecord.STATUS_DRAFT);
        mapper.insert(r);
    }

    /**
     * 提交：有草稿就地把草稿转正（保留原 created_at，落 submitted_at），没有就直接落一条已提交记录。
     * 两条路都**新增一条台账记录**，从不改写已有已提交记录。
     */
    @Transactional(rollbackFor = Exception.class)
    public void submit(Long animalCageId, User user, String content, String imagesJson) {
        CageExperimentRecord draft = mapper.selectDraft(animalCageId, authorKeys(user));
        if (draft != null) {
            mapper.submitDraft(draft.getId(), content, normImages(imagesJson));
        } else {
            CageExperimentRecord r = new CageExperimentRecord();
            r.setAnimalCageId(animalCageId);
            r.setAuthorId(canonicalAuthorId(user));
            r.setAuthorName(displayName(user));
            r.setContent(content);
            r.setImagesJson(normImages(imagesJson));
            r.setStatus(CageExperimentRecord.STATUS_SUBMITTED);
            r.setSubmittedAt(LocalDateTime.now().format(DT_FMT));
            mapper.insert(r);
        }
        // 留痕进 cage_form_audit_log —— 「记录模式」的 CageHistoryModal 读的就是这张表，
        // 不另开旁路，否则实验记录在记录模式里是空的。
        audit(animalCageId, "实验记录 · " + displayName(user), content, user.getId());
    }

    /**
     * 占用者变更（认领转让/代认领/归档）时把该笼位记录整体归档：退出台账、只在记录模式留痕。
     * 未提交草稿一并退役 —— 换人之后它已经不属于任何人的当前工作。
     */
    @Transactional(rollbackFor = Exception.class)
    public void archiveForCage(Long animalCageId, String operatorId) {
        if (animalCageId == null) return;
        int n = mapper.archiveByAnimalCageId(animalCageId);
        if (n <= 0) return;
        log.info("[cage-exp-record] 归档笼位 {} 的实验记录 {} 条", animalCageId, n);
        audit(animalCageId, "实验记录归档", "占用者变更，归档 " + n + " 条实验记录", operatorId);
    }

    private void audit(Long animalCageId, String label, String afterValue, String operatorId) {
        String code = String.valueOf(animalCageId);
        auditService.logDataChange("UPDATE", "cage_box", animalCageId, code, null,
                "animal_cage", animalCageId, code,
                "experiment_record", label, null, afterValue, operatorId);
    }

    private String displayName(User u) {
        String name = userDisplayNameService.resolveDisplayName(u.getId());
        return (name != null && !name.isBlank()) ? name : u.getId();
    }
}
