package com.example.demo.modules.sop.service;

import com.example.demo.modules.sop.entity.SopDocument;
import com.example.demo.modules.sop.entity.SopNode;
import com.example.demo.modules.sop.mapper.SopDocumentMapper;
import com.example.demo.modules.sop.mapper.SopFavoriteMapper;
import com.example.demo.modules.sop.mapper.SopNodeMapper;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * SOP 分类树、文档登记与收藏。
 *
 * 两道结构性守卫是**非平凡逻辑**，放服务层而不是控制器：删除非空节点、把节点移进自己的子树
 * 都会把树打断成孤儿数据，必须在落库前拦住，且两条路径（改名接口与移动接口）共用同一个入口。
 */
@Service
public class SopTreeService {

    /** 节点层级上限，防止环形父子链把遍历拖成死循环 */
    private static final int MAX_DEPTH = 32;

    private final SopNodeMapper nodeMapper;
    private final SopDocumentMapper documentMapper;
    private final SopFavoriteMapper favoriteMapper;

    public SopTreeService(SopNodeMapper nodeMapper, SopDocumentMapper documentMapper, SopFavoriteMapper favoriteMapper) {
        this.nodeMapper = nodeMapper;
        this.documentMapper = documentMapper;
        this.favoriteMapper = favoriteMapper;
    }

    public List<SopNode> listNodes() {
        return nodeMapper.listAll();
    }

    public List<SopDocument> listDocuments() {
        return documentMapper.listAll();
    }

    public SopNode createNode(Long parentId, String name) {
        if (parentId != null && nodeMapper.findById(parentId) == null) {
            throw new IllegalArgumentException("父分类不存在");
        }
        SopNode n = new SopNode();
        n.setParentId(parentId);
        n.setName(name);
        n.setSortOrder(0);
        nodeMapper.insert(n);
        return nodeMapper.findById(n.getId());
    }

    /**
     * 改名 / 移动 / 改排序共用入口。
     *
     * @param moveParent 是否改父节点。JSON 里「移到顶层」与「不改父节点」都是 parentId=null，
     *                   靠这个布尔区分，否则每次改名都会被误判成"移到顶层"。
     */
    public SopNode updateNode(Long id, String name, Long parentId, boolean moveParent, Integer sortOrder) {
        SopNode cur = nodeMapper.findById(id);
        if (cur == null) {
            throw new IllegalArgumentException("分类不存在");
        }
        if (moveParent && parentId != null) {
            if (parentId.equals(id)) {
                throw new IllegalArgumentException("不能把分类移动到它自己下面");
            }
            if (nodeMapper.findById(parentId) == null) {
                throw new IllegalArgumentException("目标分类不存在");
            }
            if (isDescendant(id, parentId)) {
                throw new IllegalArgumentException("不能把分类移动到它自己的子分类下");
            }
        }
        if (name != null) {
            cur.setName(name);
        }
        if (moveParent) {
            cur.setParentId(parentId);
        }
        if (sortOrder != null) {
            cur.setSortOrder(sortOrder);
        }
        nodeMapper.update(cur);
        return nodeMapper.findById(id);
    }

    public void deleteNode(Long id) {
        if (nodeMapper.findById(id) == null) {
            throw new IllegalArgumentException("分类不存在");
        }
        if (nodeMapper.countChildren(id) > 0) {
            throw new IllegalArgumentException("该分类下还有子分类，请先移走或删除它们");
        }
        if (documentMapper.countByNodeId(id) > 0) {
            throw new IllegalArgumentException("该分类下还有文档，请先移走或删除它们");
        }
        nodeMapper.delete(id);
    }

    public SopDocument createDocument(Long nodeId, String fileId, String title, String createdBy) {
        if (nodeId != null && nodeMapper.findById(nodeId) == null) {
            throw new IllegalArgumentException("分类不存在");
        }
        SopDocument d = new SopDocument();
        d.setNodeId(nodeId);
        d.setFileId(fileId);
        d.setTitle(title);
        d.setSortOrder(0);
        d.setCreatedBy(createdBy);
        documentMapper.insert(d);
        return documentMapper.findById(d.getId());
    }

    /** 改名 / 转移分类 / 改排序共用入口 */
    public SopDocument updateDocument(Long id, String title, Long nodeId, boolean moveNode, Integer sortOrder) {
        SopDocument cur = documentMapper.findById(id);
        if (cur == null) {
            throw new IllegalArgumentException("文档不存在");
        }
        if (moveNode && nodeId != null && nodeMapper.findById(nodeId) == null) {
            throw new IllegalArgumentException("目标分类不存在");
        }
        if (title != null) {
            cur.setTitle(title);
        }
        if (moveNode) {
            cur.setNodeId(nodeId);
        }
        if (sortOrder != null) {
            cur.setSortOrder(sortOrder);
        }
        documentMapper.update(cur);
        return documentMapper.findById(id);
    }

    public SopDocument findDocument(Long id) {
        return documentMapper.findById(id);
    }

    /**
     * 删除登记行。若此后**没有任何** SOP 文档再引用同一个文件，返回那个 fileId 供调用方连带清理文件本体；
     * 还有人引用则返回 null，不能删别人的 blob。
     *
     * 不在这里直接删文件：文件表属于 adminfile 模块，跨模块的写由控制器协调，服务层只碰自己的表。
     */
    public String deleteDocument(Long id) {
        SopDocument cur = documentMapper.findById(id);
        if (cur == null) {
            return null;
        }
        documentMapper.delete(id);
        // 收藏跟着文档走：不清的话会留下永远点不开的孤儿行，越攒越多
        favoriteMapper.deleteByDocumentId(id);
        String fileId = cur.getFileId();
        if (fileId != null && documentMapper.countByFileId(fileId) == 0) {
            return fileId;
        }
        return null;
    }

    /* ── 收藏（按人存，跨设备可见） ── */

    public List<Long> listFavoriteDocumentIds(String userId) {
        return favoriteMapper.listDocumentIds(userId);
    }

    /** 加收藏前确认文档存在，避免收藏到一个不存在的 id */
    public void addFavorite(String userId, Long documentId) {
        if (documentMapper.findById(documentId) == null) {
            throw new IllegalArgumentException("文档不存在");
        }
        favoriteMapper.insert(userId, documentId);
    }

    public void removeFavorite(String userId, Long documentId) {
        favoriteMapper.delete(userId, documentId);
    }

    /**
     * candidate 是否位于 ancestor 的子树内（沿 parentId 向上走）。
     * 走到根仍未命中即返回 false。
     */
    private boolean isDescendant(Long ancestorId, Long candidateId) {
        Long walk = candidateId;
        for (int i = 0; i < MAX_DEPTH; i++) {
            if (walk == null) {
                return false;
            }
            if (walk.equals(ancestorId)) {
                return true;
            }
            SopNode n = nodeMapper.findById(walk);
            if (n == null) {
                return false;
            }
            walk = n.getParentId();
        }
        // 走满上限还没到根 = 数据成了环，保守当作命中拒绝移动
        return true;
    }
}
