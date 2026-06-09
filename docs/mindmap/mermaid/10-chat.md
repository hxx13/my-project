# chat

## 模块结构

```mermaid
mindmap
  root((chat))
    ChatController
      GET /api/chat/staff-contacts
      GET /api/chat/contact-groups
      GET /api/chat/contact-bookmarks
      GET /api/chat/conversations
      GET /api/chat/conversations/{conversationId}/messages
      GET /api/chat/attachments/{attachmentId}/download
      ... +11 more
    ChatService
      → ChatJdbcRepository
      → UserMapper
      → UserDisplayNameService
      → AuthContextService
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/chat/staff-contacts` | ChatController |  |
| GET | `/api/chat/contact-groups` | ChatController |  |
| GET | `/api/chat/contact-bookmarks` | ChatController |  |
| GET | `/api/chat/conversations` | ChatController |  |
| GET | `/api/chat/conversations/{conversationId}/messages` | ChatController |  |
| GET | `/api/chat/attachments/{attachmentId}/download` | ChatController |  |
| POST | `/api/chat/contact-groups` | ChatController |  |
| POST | `/api/chat/contact-bookmarks/{peerUserId}` | ChatController |  |
| POST | `/api/chat/conversations/{conversationId}/read` | ChatController |  |
| POST | `/api/chat/conversations/open/{peerUserId}` | ChatController |  |
| POST | `/api/chat/conversations/{conversationId}/messages` | ChatController |  |
| POST | `/api/chat/conversations/{conversationId}/attachments` | ChatController |  |
| PUT | `/api/chat/contact-assignments` | ChatController |  |
| PUT | `/api/chat/conversations/{conversationId}/pinned` | ChatController |  |
| DELETE | `/api/chat/contact-groups/{groupId}` | ChatController |  |
| DELETE | `/api/chat/contact-bookmarks/{peerUserId}` | ChatController |  |
| DELETE | `/api/chat/conversations/{conversationId}/from-my-list` | ChatController |  |
