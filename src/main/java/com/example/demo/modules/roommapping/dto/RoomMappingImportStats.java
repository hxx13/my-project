package com.example.demo.modules.roommapping.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RoomMappingImportStats {
    /** 成功写入/更新的房间行数 */
    private int roomsUpserted;
    /** 因缺 room_id 跳过的行 */
    private int rowsSkipped;
    /** CSV 数据行总数（不含表头） */
    private int rowsRead;
    /** 因本行填写了门禁通道编码而替换写入的通道条目总数 */
    private int channelRowsWritten;
    /** 执行了通道替换的房间数 */
    private int roomsChannelReplaced;
}
