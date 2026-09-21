package com.example.demo.modules.cageshelf.service;

import lombok.Data;

/**
 * 转移请求里的一组「源→目标」对，恰好一个源、一个目标。
 *
 * <p>落 {@code cage_op_request.pairs} 的 JSON 数组元素，形如 {@code {"source": ..., "target": ...}}。
 */
@Data
public class CageOpPair {

    private Long source;
    private Long target;
}
