package com.example.demo.modules.twin.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PagedDataResponseDTO<T> {
    private List<T> data;
    private long total;
}
