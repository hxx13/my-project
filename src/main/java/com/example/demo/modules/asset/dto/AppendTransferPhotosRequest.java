package com.example.demo.modules.asset.dto;

import lombok.Data;

import java.util.List;

@Data
public class AppendTransferPhotosRequest {
    private List<String> photoUrls;
}
