package com.example.demo.modules.sop.service;

import com.example.demo.modules.sop.entity.SopDocument;
import com.example.demo.modules.sop.entity.SopNode;
import com.example.demo.modules.sop.mapper.SopDocumentMapper;
import com.example.demo.modules.sop.mapper.SopFavoriteMapper;
import com.example.demo.modules.sop.mapper.SopNodeMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SOP 分类树两道结构性守卫的回归。
 *
 * <p>守的是「树不会被打断成孤儿数据」：删非空节点、把节点移进自己的子树。
 * 这两条都从**同一个入口**放行所有调用方（改名/移动共用一个接口），
 * 所以守卫放服务层、靠这个测试钉住；漏掉任何一条都会在库里留下谁都看不见、
 * 界面上再也点不到的文档。
 */
@ExtendWith(MockitoExtension.class)
class SopTreeServiceTest {

    @Mock private SopNodeMapper nodeMapper;
    @Mock private SopDocumentMapper documentMapper;
    @Mock private SopFavoriteMapper favoriteMapper;

    private SopTreeService service;

    @BeforeEach
    void setUp() {
        service = new SopTreeService(nodeMapper, documentMapper, favoriteMapper);
    }

    private static SopNode node(long id, Long parentId, String name) {
        SopNode n = new SopNode();
        n.setId(id);
        n.setParentId(parentId);
        n.setName(name);
        n.setSortOrder(0);
        return n;
    }

    /** A(1) → B(2) → C(3)：1 是 3 的祖先 */
    private void stubChain() {
        when(nodeMapper.findById(1L)).thenReturn(node(1L, null, "A"));
        when(nodeMapper.findById(2L)).thenReturn(node(2L, 1L, "B"));
        when(nodeMapper.findById(3L)).thenReturn(node(3L, 2L, "C"));
    }

    @Test
    void deleteNodeRefusesWhenItHasChildren() {
        when(nodeMapper.findById(1L)).thenReturn(node(1L, null, "A"));
        when(nodeMapper.countChildren(1L)).thenReturn(2);

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> service.deleteNode(1L));
        assertTrue(e.getMessage().contains("子分类"));
        verify(nodeMapper, never()).delete(1L);
    }

    @Test
    void deleteNodeRefusesWhenItHasDocuments() {
        when(nodeMapper.findById(1L)).thenReturn(node(1L, null, "A"));
        when(nodeMapper.countChildren(1L)).thenReturn(0);
        when(documentMapper.countByNodeId(1L)).thenReturn(1);

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> service.deleteNode(1L));
        assertTrue(e.getMessage().contains("文档"));
        verify(nodeMapper, never()).delete(1L);
    }

    @Test
    void deleteNodeSucceedsWhenEmpty() {
        when(nodeMapper.findById(1L)).thenReturn(node(1L, null, "A"));
        when(nodeMapper.countChildren(1L)).thenReturn(0);
        when(documentMapper.countByNodeId(1L)).thenReturn(0);

        service.deleteNode(1L);
        verify(nodeMapper).delete(1L);
    }

    @Test
    void moveNodeRefusesWhenTargetIsItsOwnDescendant() {
        stubChain();

        // 把 A(1) 移到 C(3) 下：3 → 2 → 1，撞上自己
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.updateNode(1L, null, 3L, true, null));
        assertTrue(e.getMessage().contains("子分类"));
        verify(nodeMapper, never()).update(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void moveNodeRefusesWhenTargetIsItself() {
        when(nodeMapper.findById(1L)).thenReturn(node(1L, null, "A"));

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.updateNode(1L, null, 1L, true, null));
        assertTrue(e.getMessage().contains("自己"));
        verify(nodeMapper, never()).update(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void renameWithoutMoveParentKeepsParentIntact() {
        when(nodeMapper.findById(3L)).thenReturn(node(3L, 2L, "C"));

        service.updateNode(3L, "C 改名", null, false, null);

        ArgumentCaptor<SopNode> cap = ArgumentCaptor.forClass(SopNode.class);
        verify(nodeMapper).update(cap.capture());
        assertEquals("C 改名", cap.getValue().getName());
        // moveParent=false 时 parentId 必须原样保留，否则每次改名都会把节点甩到顶层
        assertEquals(2L, cap.getValue().getParentId());
    }

    /* ── 删文档时的文件本体释放：差一条判断就是「删别人的文件」或「永久漏文件」 ── */

    private static SopDocument doc(long id, String fileId) {
        SopDocument d = new SopDocument();
        d.setId(id);
        d.setFileId(fileId);
        d.setTitle("t" + id);
        return d;
    }

    @Test
    void deleteLastDocumentReleasesTheFile() {
        when(documentMapper.findById(9L)).thenReturn(doc(9L, "FILE_A"));
        when(documentMapper.countByFileId("FILE_A")).thenReturn(0);

        assertEquals("FILE_A", service.deleteDocument(9L));
        verify(documentMapper).delete(9L);
    }

    @Test
    void deleteDocumentKeepsFileWhileAnotherStillReferencesIt() {
        when(documentMapper.findById(9L)).thenReturn(doc(9L, "FILE_A"));
        when(documentMapper.countByFileId("FILE_A")).thenReturn(1);

        // 还有人引用 → 返回 null，调用方就不会去删 blob
        assertEquals(null, service.deleteDocument(9L));
        verify(documentMapper).delete(9L);
    }

    @Test
    void deleteMissingDocumentIsANoOp() {
        when(documentMapper.findById(9L)).thenReturn(null);

        assertEquals(null, service.deleteDocument(9L));
        verify(documentMapper, never()).delete(9L);
    }

    /* ── 收藏 ── */

    @Test
    void deletingADocumentAlsoDropsItsFavorites() {
        when(documentMapper.findById(9L)).thenReturn(doc(9L, "FILE_A"));
        when(documentMapper.countByFileId("FILE_A")).thenReturn(0);

        service.deleteDocument(9L);

        // 不清的话会留下永远点不开的孤儿收藏行
        verify(favoriteMapper).deleteByDocumentId(9L);
    }

    @Test
    void addingFavoriteRefusesUnknownDocument() {
        when(documentMapper.findById(9L)).thenReturn(null);

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.addFavorite("STAFF_1", 9L));
        assertTrue(e.getMessage().contains("文档不存在"));
        verify(favoriteMapper, never()).insert(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void addingFavoriteInsertsForCurrentUser() {
        when(documentMapper.findById(9L)).thenReturn(doc(9L, "FILE_A"));

        service.addFavorite("STAFF_1", 9L);

        verify(favoriteMapper).insert("STAFF_1", 9L);
    }
}
