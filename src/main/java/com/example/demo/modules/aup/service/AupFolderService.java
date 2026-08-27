package com.example.demo.modules.aup.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.aup.dto.AupFolderCreateRequest;
import com.example.demo.modules.aup.dto.AupFolderMoveRequest;
import com.example.demo.modules.aup.dto.AupFolderUpdateRequest;
import com.example.demo.modules.aup.dto.AupFolderVO;
import com.example.demo.modules.aup.entity.AupFolder;
import com.example.demo.modules.aup.mapper.AupFieldDefMapper;
import com.example.demo.modules.aup.mapper.AupFolderMapper;
import com.example.demo.modules.aup.mapper.DictMapper;
import com.example.demo.modules.aup.mapper.FormTemplateMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.nhp.mapper.CrfFormMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** AUP 配置面通用文件夹（码表/字段/原子域共用）：树查询 + 增删改移。 */
@Service
public class AupFolderService {

    private static final int MAX_LEVEL = 5;
    /**
     * 表结构（owner_type/parent_id/name/sort_order）不含 aup 业务语义，故作为通用目录表复用。
     * NHP_FORM 由 NHP 表单管理页使用（crf_form.folder_id 指向本表），删除保护见 countRefs。
     * 新增取值时必须同步在 countRefs 里补引用计数分支，否则非空文件夹会被误删。
     */
    private static final Set<String> ALLOWED_OWNER_TYPES = Set.of("CODELIST", "FIELD", "ATOM", "NHP_FORM");

    private final AupFolderMapper folderMapper;
    private final DictMapper dictMapper;
    private final AupFieldDefMapper fieldDefMapper;
    private final FormTemplateMapper templateMapper;
    private final CrfFormMapper crfFormMapper;
    private final AupConfigAuditService auditService;

    public AupFolderService(AupFolderMapper folderMapper, DictMapper dictMapper,
                            AupFieldDefMapper fieldDefMapper, FormTemplateMapper templateMapper,
                            CrfFormMapper crfFormMapper,
                            AupConfigAuditService auditService) {
        this.folderMapper = folderMapper;
        this.dictMapper = dictMapper;
        this.fieldDefMapper = fieldDefMapper;
        this.templateMapper = templateMapper;
        this.crfFormMapper = crfFormMapper;
        this.auditService = auditService;
    }

    public List<AupFolderVO> tree(String ownerType) {
        String ot = normalizeOwnerType(ownerType);
        if (ot == null) {
            return new ArrayList<>();
        }
        List<AupFolder> all = folderMapper.listByOwnerType(ot);
        return buildTree(all);
    }

    @Transactional
    public Result<AupFolderVO> create(AupFolderCreateRequest req, User user) {
        String ot = normalizeOwnerType(req.getOwnerType());
        if (ot == null) {
            return Result.fail(400, "ownerType 必须为 CODELIST/FIELD/ATOM/NHP_FORM");
        }
        if (isBlank(req.getName())) {
            return Result.fail(400, "文件夹名称不能为空");
        }
        long parentId = req.getParentId() == null ? 0L : req.getParentId();
        if (parentId != 0) {
            AupFolder parent = folderMapper.findById(parentId);
            if (parent == null || !ot.equals(parent.getOwnerType())) {
                return Result.fail(400, "父文件夹不存在或 ownerType 不匹配");
            }
            if (depth(parentId) + 1 > MAX_LEVEL) {
                return Result.fail(400, "文件夹层级不能超过 " + MAX_LEVEL + " 层");
            }
        }
        String name = req.getName().trim();
        if (folderMapper.countByName(ot, parentId, name) > 0) {
            return Result.fail(400, "同级已存在同名文件夹");
        }
        AupFolder f = new AupFolder();
        f.setOwnerType(ot);
        f.setParentId(parentId);
        f.setName(name);
        f.setSortOrder(req.getSortOrder() != null ? req.getSortOrder() : 0);
        f.setDescription(req.getDescription());
        folderMapper.insert(f);

        auditService.log("folder", f.getId(), null, f.getName(), "CREATE", null, f, user, null);
        return Result.success(toVO(f));
    }

    @Transactional
    public Result<AupFolderVO> update(Long id, AupFolderUpdateRequest req, User user) {
        AupFolder f = folderMapper.findById(id);
        if (f == null) {
            return Result.error("文件夹不存在");
        }
        AupFolder before = copy(f);
        if (req.getName() != null && !req.getName().isBlank()) {
            String name = req.getName().trim();
            if (!name.equals(f.getName()) && folderMapper.countByName(f.getOwnerType(), f.getParentId(), name) > 0) {
                return Result.fail(400, "同级已存在同名文件夹");
            }
            f.setName(name);
        }
        if (req.getSortOrder() != null) {
            f.setSortOrder(req.getSortOrder());
        }
        if (req.getDescription() != null) {
            f.setDescription(req.getDescription());
        }
        folderMapper.update(f);
        auditService.log("folder", f.getId(), null, f.getName(), "UPDATE", before, f, user, null);
        return Result.success(toVO(folderMapper.findById(id)));
    }

    @Transactional
    public Result<Void> move(Long id, AupFolderMoveRequest req, User user) {
        AupFolder f = folderMapper.findById(id);
        if (f == null) {
            return Result.error("文件夹不存在");
        }
        long newParent = req.getParentId() == null ? 0L : req.getParentId();
        if (newParent != 0) {
            AupFolder parent = folderMapper.findById(newParent);
            if (parent == null || !f.getOwnerType().equals(parent.getOwnerType())) {
                return Result.fail(400, "目标父文件夹不存在或 ownerType 不匹配");
            }
            if (newParent == id.longValue() || isDescendant(id, newParent)) {
                return Result.fail(400, "不能移动到自身或子孙文件夹下");
            }
            if (depth(newParent) + 1 > MAX_LEVEL) {
                return Result.fail(400, "文件夹层级不能超过 " + MAX_LEVEL + " 层");
            }
        }
        if (f.getParentId() == null || f.getParentId().longValue() != newParent) {
            if (folderMapper.countByName(f.getOwnerType(), newParent, f.getName()) > 0) {
                return Result.fail(400, "同级已存在同名文件夹");
            }
        }
        Long beforeParent = f.getParentId();
        folderMapper.updateParent(id, newParent);
        f.setParentId(newParent);
        auditService.log("folder", f.getId(), null, f.getName(), "MOVE",
                Map.of("parentId", beforeParent == null ? 0L : beforeParent),
                Map.of("parentId", newParent), user, null);
        return Result.success(null);
    }

    @Transactional
    public Result<Void> delete(Long id, User user) {
        AupFolder f = folderMapper.findById(id);
        if (f == null) {
            return Result.error("文件夹不存在");
        }
        if (folderMapper.countChildren(id) > 0) {
            return Result.fail(400, "文件夹下还有子文件夹，禁止删除");
        }
        int refs = countRefs(f.getOwnerType(), id);
        if (refs > 0) {
            return Result.fail(400, "文件夹下有 " + refs + " 个关联项，禁止删除");
        }
        folderMapper.deleteById(id);
        auditService.log("folder", id, null, f.getName(), "DELETE", f, null, user, null);
        return Result.success(null);
    }

    private int countRefs(String ownerType, Long folderId) {
        switch (ownerType) {
            case "CODELIST": return dictMapper.countByFolderId(folderId);
            case "FIELD": return fieldDefMapper.countByFolderId(folderId);
            case "ATOM": return templateMapper.countByFolderId(folderId);
            case "NHP_FORM": return crfFormMapper.countByFolderId(folderId);
            default: return 0;
        }
    }

    /** 根=1 层，逐层向上累加。 */
    private int depth(Long folderId) {
        int d = 0;
        Long cur = folderId;
        Set<Long> visited = new java.util.HashSet<>();
        while (cur != null && cur != 0 && d < 100 && visited.add(cur)) {
            d++;
            AupFolder f = folderMapper.findById(cur);
            cur = f == null ? 0L : f.getParentId();
        }
        return d;
    }

    private boolean isDescendant(Long ancestorId, Long candidateId) {
        Long cur = candidateId;
        Set<Long> visited = new java.util.HashSet<>();
        while (cur != null && cur != 0 && visited.add(cur)) {
            if (cur.equals(ancestorId)) {
                return true;
            }
            AupFolder f = folderMapper.findById(cur);
            cur = f == null ? 0L : f.getParentId();
        }
        return false;
    }

    private List<AupFolderVO> buildTree(List<AupFolder> all) {
        Map<Long, AupFolderVO> nodes = new LinkedHashMap<>();
        for (AupFolder f : all) {
            nodes.put(f.getId(), toVO(f));
        }
        List<AupFolderVO> roots = new ArrayList<>();
        for (AupFolder f : all) {
            AupFolderVO vo = nodes.get(f.getId());
            if (f.getParentId() == null || f.getParentId() == 0 || !nodes.containsKey(f.getParentId())) {
                roots.add(vo);
            } else {
                AupFolderVO parent = nodes.get(f.getParentId());
                if (parent.getChildren() == null) {
                    parent.setChildren(new ArrayList<>());
                }
                parent.getChildren().add(vo);
            }
        }
        return roots;
    }

    private AupFolderVO toVO(AupFolder f) {
        AupFolderVO v = new AupFolderVO();
        v.setId(f.getId());
        v.setOwnerType(f.getOwnerType());
        v.setParentId(f.getParentId());
        v.setName(f.getName());
        v.setSortOrder(f.getSortOrder());
        v.setDescription(f.getDescription());
        return v;
    }

    private AupFolder copy(AupFolder f) {
        AupFolder c = new AupFolder();
        c.setId(f.getId());
        c.setOwnerType(f.getOwnerType());
        c.setParentId(f.getParentId());
        c.setName(f.getName());
        c.setSortOrder(f.getSortOrder());
        c.setDescription(f.getDescription());
        return c;
    }

    private String normalizeOwnerType(String ownerType) {
        if (ownerType == null || ownerType.isBlank()) {
            return null;
        }
        String up = ownerType.trim().toUpperCase();
        return ALLOWED_OWNER_TYPES.contains(up) ? up : null;
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
