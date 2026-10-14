package com.example.demo.modules.broadcast.dto;

/** 曲目在两个曲库列表之间移动。 */
public record SongMoveRequest(String fromListId, String toListId, String songPath) {
}
