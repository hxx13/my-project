package com.example.demo.modules.asset.service;

import com.example.demo.modules.asset.entity.AssetLocation;
import com.example.demo.modules.asset.mapper.AssetLocationMapper;
import com.example.demo.modules.asset.mapper.AssetMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** resolveOrCreateTopLevelByName：归一化 + 精确匹配 + 找不到建顶层节点（mapper 用 mock，不起 Spring） */
class AssetLocationResolveTest {

    private static AssetLocation node(long id, Long parentId, String name) {
        AssetLocation n = new AssetLocation();
        n.setId(id);
        n.setParentId(parentId);
        n.setName(name);
        n.setSortOrder(0);
        return n;
    }

    private static AssetLocationService serviceWith(AssetLocationMapper mapper) {
        return new AssetLocationService(mapper, mock(AssetMapper.class));
    }

    @Test
    void nullOrBlankNameReturnsNullWithoutTouchingDb() {
        AssetLocationMapper mapper = mock(AssetLocationMapper.class);
        AssetLocationService svc = serviceWith(mapper);
        assertNull(svc.resolveOrCreateTopLevelByName(null));
        assertNull(svc.resolveOrCreateTopLevelByName(""));
        assertNull(svc.resolveOrCreateTopLevelByName("   　  "));
        verifyNoInteractions(mapper);
    }

    @Test
    void normalizesWhitespaceBeforeMatching() {
        AssetLocationMapper mapper = mock(AssetLocationMapper.class);
        when(mapper.listAll()).thenReturn(List.of(node(7L, 3L, "西6")));
        assertEquals(7L, serviceWith(mapper).resolveOrCreateTopLevelByName("  　西6  "));
    }

    @Test
    void matchesNodeAtAnyDepth() {
        AssetLocationMapper mapper = mock(AssetLocationMapper.class);
        when(mapper.listAll()).thenReturn(List.of(
                node(1L, null, "浦东校区"),
                node(2L, 1L, "动科部")
        ));
        assertEquals(2L, serviceWith(mapper).resolveOrCreateTopLevelByName("动科部"));
    }

    @Test
    void createsTopLevelNodeWhenNoMatch() {
        AssetLocationMapper mapper = mock(AssetLocationMapper.class);
        when(mapper.listAll()).thenReturn(new ArrayList<>(List.of(node(1L, null, "动科部"))));
        when(mapper.insert(any(AssetLocation.class))).thenAnswer(inv -> {
            inv.getArgument(0, AssetLocation.class).setId(42L);
            return 1;
        });

        Long id = serviceWith(mapper).resolveOrCreateTopLevelByName("浦东校区 新地点");

        assertEquals(42L, id);
        ArgumentCaptor<AssetLocation> captor = ArgumentCaptor.forClass(AssetLocation.class);
        verify(mapper).insert(captor.capture());
        assertNull(captor.getValue().getParentId());
        assertEquals("浦东校区 新地点", captor.getValue().getName());
    }
}
