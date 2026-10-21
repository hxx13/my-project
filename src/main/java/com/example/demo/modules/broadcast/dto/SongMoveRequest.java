package com.example.demo.modules.broadcast.dto;

import java.util.List;

/**
 * 曲目在两个曲库列表之间移动（支持批量）。
 *
 * @param songPaths 批量：要移动的曲目路径
 * @param songPath  单个：老调用方（小程序）仍按单首传，两者给其一即可
 */
public record SongMoveRequest(String fromListId, String toListId, String songPath, List<String> songPaths) {
}
