package com.example.demo.modules.broadcast.dto;

import java.util.List;

/** 曲库列表面向业务方的视图。 */
public record SongListView(
        String id,
        String name,
        int songCount,
        List<SongView> songs
) {

    /** 一首曲目。曲目的身份是**平台上的绝对路径**，播放与定时方案都用它。 */
    public record SongView(
            String pathName,
            String fileName,
            Integer durationSeconds,
            Long sizeBytes
    ) {
    }
}
