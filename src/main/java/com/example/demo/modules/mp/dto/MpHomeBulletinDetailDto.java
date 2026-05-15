package com.example.demo.modules.mp.dto;

import lombok.Data;

@Data
public class MpHomeBulletinDetailDto {
    private String id;
    private String kind;
    private String title;
    private String bodyHtml;
    private String publishedAtText;
    private String versionCode;
}
