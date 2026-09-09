package com.example.demo.modules.asset.service;

import com.example.demo.modules.asset.entity.AssetRecord;
import com.example.demo.modules.asset.mapper.AssetMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.upload.service.UploadFileService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** 地点文本写入后统一回填 location_node_id（mapper/service 用 mock，不起 Spring） */
class AssetLocationNodeBackfillTest {

    private static AssetService serviceWith(AssetMapper mapper, AssetLocationService locationService) {
        return new AssetService(mapper, mock(UploadFileService.class),
                mock(UserDisplayNameService.class), locationService);
    }

    private static AssetRecord asset(String id, String location) {
        AssetRecord r = new AssetRecord();
        r.setId(id);
        r.setAssetCode("C1");
        r.setAssetName("资产1");
        r.setStatus("NORMAL");
        r.setLocation(location);
        r.setLocked(0);
        return r;
    }

    @Test
    void blankTextSkipsResolveEntirely() {
        AssetLocationService locationService = mock(AssetLocationService.class);
        assertNull(AssetService.resolveLocationNodeQuietly(locationService, null));
        assertNull(AssetService.resolveLocationNodeQuietly(locationService, ""));
        assertNull(AssetService.resolveLocationNodeQuietly(locationService, "   　 "));
        verifyNoInteractions(locationService);
    }

    @Test
    void resolveFailureDoesNotThrowAndReturnsNull() {
        AssetLocationService locationService = mock(AssetLocationService.class);
        when(locationService.resolveOrCreateTopLevelByName("坏地点"))
                .thenThrow(new IllegalStateException("db down"));
        assertNull(AssetService.resolveLocationNodeQuietly(locationService, "坏地点"));
    }

    @Test
    void patchAssetBackfillsPointerWhenLocationChanged() {
        AssetMapper mapper = mock(AssetMapper.class);
        AssetLocationService locationService = mock(AssetLocationService.class);
        when(mapper.findAssetById("A1")).thenReturn(asset("A1", "旧地点"));
        when(mapper.updateAssetBase(org.mockito.ArgumentMatchers.any(AssetRecord.class))).thenReturn(1);
        when(mapper.listColumnDefs()).thenReturn(List.of());
        when(locationService.resolveOrCreateTopLevelByName("新地点")).thenReturn(88L);

        serviceWith(mapper, locationService).patchAsset("A1", null, null, null, "新地点", null, null, null);

        verify(locationService, times(1)).resolveOrCreateTopLevelByName("新地点");
        verify(mapper).updateAssetLocationNode("A1", 88L);
    }

    @Test
    void createAssetBackfillsPointerWhenLocationPresent() {
        AssetMapper mapper = mock(AssetMapper.class);
        AssetLocationService locationService = mock(AssetLocationService.class);
        when(mapper.findAssetByCode("C1")).thenReturn(null);
        when(locationService.resolveOrCreateTopLevelByName("新地点")).thenReturn(88L);

        serviceWith(mapper, locationService)
                .createAsset("op", "C1", "资产1", null, "新地点", null, null, null, null);

        verify(mapper).updateAssetLocationNode(anyString(), eq(88L));
    }

    @Test
    void batchUpdateResolvesOnceAndWritesPointerInOneBatch() {
        AssetMapper mapper = mock(AssetMapper.class);
        AssetLocationService locationService = mock(AssetLocationService.class);
        when(mapper.listColumnDefs()).thenReturn(List.of());
        when(mapper.batchUpdateAssetFields(List.of("A1", "A2"), null, "新地点", null, "op")).thenReturn(2);
        when(locationService.resolveOrCreateTopLevelByName("新地点")).thenReturn(88L);

        serviceWith(mapper, locationService)
                .batchUpdate(List.of("A1", "A2"), Map.of("location", "新地点"), null, null, "op");

        // 整批同一文本只解析一次，且不逐条写指针
        verify(locationService, times(1)).resolveOrCreateTopLevelByName("新地点");
        verify(mapper).batchUpdateAssetLocationNode(List.of("A1", "A2"), 88L);
        verify(mapper, never()).updateAssetLocationNode(anyString(), eq(88L));
    }
}
