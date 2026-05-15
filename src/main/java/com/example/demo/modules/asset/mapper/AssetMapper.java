package com.example.demo.modules.asset.mapper;

import com.example.demo.modules.asset.entity.AssetColumnDef;
import com.example.demo.modules.asset.entity.AssetRecord;
import com.example.demo.modules.asset.entity.AssetTransferExportFile;
import com.example.demo.modules.asset.entity.AssetTransferRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface AssetMapper {
    List<AssetColumnDef> listColumnDefs();

    AssetColumnDef findColumnDefByKey(@Param("columnKey") String columnKey);

    int insertColumnDef(AssetColumnDef columnDef);

    int updateColumnDefLabel(@Param("columnKey") String columnKey, @Param("columnLabel") String columnLabel);

    AssetRecord findAssetById(@Param("id") String id);

    AssetRecord findAssetByCode(@Param("assetCode") String assetCode);

    int insertAsset(AssetRecord asset);

    int updateAssetBase(AssetRecord asset);

    int updateAssetNote(@Param("id") String id, @Param("note") String note);

    int updateAssetLock(@Param("id") String id, @Param("locked") int locked, @Param("operatorId") String operatorId);

    int updateLatestTransferRequest(@Param("id") String id,
                                    @Param("requestId") String requestId,
                                    @Param("operatorId") String operatorId);

    List<AssetRecord> listAssets(@Param("keyword") String keyword,
                                 @Param("assetName") String assetName,
                                 @Param("campus") String campus,
                                 @Param("user") String user,
                                 @Param("model") String model,
                                 @Param("campusKeys") List<String> campusKeys,
                                 @Param("userKeys") List<String> userKeys,
                                 @Param("modelKeys") List<String> modelKeys,
                                 @Param("lockStatus") Integer lockStatus,
                                 @Param("status") String status,
                                 @Param("limit") int limit,
                                 @Param("offset") int offset,
                                 @Param("sortBy") String sortBy,
                                 @Param("sortDirection") String sortDirection);

    int countAssets(@Param("keyword") String keyword,
                    @Param("assetName") String assetName,
                    @Param("campus") String campus,
                    @Param("user") String user,
                    @Param("model") String model,
                    @Param("campusKeys") List<String> campusKeys,
                    @Param("userKeys") List<String> userKeys,
                    @Param("modelKeys") List<String> modelKeys,
                    @Param("lockStatus") Integer lockStatus,
                    @Param("status") String status);

    List<AssetRecord> listAssetsAll(@Param("keyword") String keyword,
                                    @Param("assetName") String assetName,
                                    @Param("campus") String campus,
                                    @Param("user") String user,
                                    @Param("model") String model,
                                    @Param("campusKeys") List<String> campusKeys,
                                    @Param("userKeys") List<String> userKeys,
                                    @Param("modelKeys") List<String> modelKeys,
                                    @Param("lockStatus") Integer lockStatus,
                                    @Param("status") String status);

    List<Map<String, Object>> listAssetValuesByAssetIds(@Param("assetIds") List<String> assetIds);

    List<Map<String, Object>> listAssetValuesByAssetId(@Param("assetId") String assetId);

    int upsertAssetValue(@Param("assetId") String assetId,
                         @Param("columnKey") String columnKey,
                         @Param("columnValue") String columnValue);

    List<AssetRecord> searchAssetsForPicker(@Param("keyword") String keyword, @Param("limit") int limit);

    int insertTransferRequest(AssetTransferRequest request);

    AssetTransferRequest findTransferRequestById(@Param("id") String id);

    int updateTransferRequestAfterPhotos(@Param("id") String id, @Param("photoUrlsAfterJson") String photoUrlsAfterJson);

    int updateTransferRequestStatus(@Param("id") String id,
                                    @Param("status") String status,
                                    @Param("expectedCurrentStatus") String expectedCurrentStatus);

    int insertTransferLog(@Param("id") String id,
                          @Param("requestId") String requestId,
                          @Param("assetId") String assetId,
                          @Param("actionType") String actionType,
                          @Param("operatorId") String operatorId,
                          @Param("remark") String remark,
                          @Param("createdTime") LocalDateTime createdTime);

    List<AssetTransferRequest> listTransferRequests(@Param("keyword") String keyword,
                                                    @Param("limit") int limit,
                                                    @Param("offset") int offset);

    int countTransferRequests(@Param("keyword") String keyword);

    List<AssetTransferRequest> listTransferRequestsByIds(@Param("ids") List<String> ids);

    /**
     * Latest request for asset among active workflow states (excludes WITHDRAWN etc.).
     */
    String selectLatestActiveTransferRequestId(@Param("assetId") String assetId);

    int updateAssetLatestTransferPointer(@Param("assetId") String assetId,
                                         @Param("requestId") String requestId,
                                         @Param("operatorId") String operatorId);

    int deleteTransferRequestById(@Param("id") String id);

    int insertTransferExportFile(AssetTransferExportFile file);

    AssetTransferExportFile selectLatestValidTransferExportFile(@Param("requestId") String requestId,
                                                                @Param("now") LocalDateTime now);

    List<AssetTransferExportFile> listTransferExportFiles(@Param("requestId") String requestId,
                                                          @Param("limit") int limit);

    AssetTransferExportFile findTransferExportFileByToken(@Param("downloadToken") String downloadToken);

    int markExpiredTransferExportFiles(@Param("now") LocalDateTime now);

    List<String> listDistinctAssetNames();

    List<String> listDistinctDynamicValuesByKey(@Param("columnKey") String columnKey);

    List<String> listDistinctDynamicValuesByKeys(@Param("columnKeys") List<String> columnKeys);

    int deleteAllAssetValues();

    int deleteAllTransferLogs();

    int deleteAllTransferRequests();

    int deleteAllAssets();

    int deleteAllColumnDefs();

    int moveAssetToRecycle(@Param("id") String id,
                           @Param("operatorId") String operatorId,
                           @Param("deletedTime") LocalDateTime deletedTime,
                           @Param("purgeAfterTime") LocalDateTime purgeAfterTime);

    int restoreRecycledAsset(@Param("id") String id, @Param("operatorId") String operatorId);

    int purgeAssetById(@Param("id") String id);

    List<AssetRecord> listRecycledAssets(@Param("keyword") String keyword,
                                         @Param("limit") int limit,
                                         @Param("offset") int offset);

    int countRecycledAssets(@Param("keyword") String keyword);

    int deleteAssetValuesByAssetId(@Param("assetId") String assetId);
}

