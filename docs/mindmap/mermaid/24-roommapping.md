# roommapping

## 模块结构

```mermaid
mindmap
  root((roommapping))
    RoomMappingController
      GET /api/v1/room-mapping/facets
      GET /api/v1/room-mapping/rooms
      GET /api/v1/room-mapping/by-room-id/{roomId}
      POST /api/v1/room-mapping/refresh-from-classpath
      PATCH /api/v1/room-mapping/rooms/{roomId}/official-permission-level
    RoomMappingService
      → RoomMappingRoomMapper
      → RoomMappingChannelMapper
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/v1/room-mapping/facets` | RoomMappingController |  |
| GET | `/api/v1/room-mapping/rooms` | RoomMappingController |  |
| GET | `/api/v1/room-mapping/by-room-id/{roomId}` | RoomMappingController |  |
| POST | `/api/v1/room-mapping/refresh-from-classpath` | RoomMappingController |  |
| PATCH | `/api/v1/room-mapping/rooms/{roomId}/official-permission-level` | RoomMappingController |  |
