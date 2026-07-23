package com.example.demo.modules.mp.dto;

import lombok.Data;

@Data
public class MpHomeBulletinListItemDto {
    private String id;
    /** announcement | release */
    private String kind;
    private String title;
    private String summary;
    /** 展示用 yyyy-MM-dd HH:mm */
    private String publishedAtText;
    /** 版本记录专有 */
    private String versionCode;
}
