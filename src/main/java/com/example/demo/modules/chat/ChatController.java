package com.example.demo.modules.chat;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/chat")
@Tag(name = "站内信", description = "教职工一对一消息与附件")
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    @GetMapping("/staff-contacts")
    @Operation(summary = "可发起会话的教职工列表（排除学号绑定小程序身份；含展示名）")
    public Result<?> staffContacts(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @RequestParam(required = false) String keyword,
                                   @RequestParam(defaultValue = "1") int page,
                                   @RequestParam(defaultValue = "30") int size) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        return Result.success(chatService.listContacts(me, keyword, page, size));
    }

    @GetMapping("/contact-groups")
    @Operation(summary = "本人通讯录分组（仅本人数据）")
    public Result<?> contactGroups(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        return Result.success(Map.of("data", chatService.listContactGroups(me)));
    }

    @PostMapping("/contact-groups")
    @Operation(summary = "新建通讯录分组")
    public Result<?> createContactGroup(@RequestHeader(value = "Authorization", required = false) String authorization,
                                        @RequestBody Map<String, String> body) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        String name = body == null ? null : body.get("name");
        try {
            return Result.success(chatService.createContactGroup(me, name));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/contact-groups/{groupId}")
    @Operation(summary = "删除通讯录分组（联系人回到未分组）")
    public Result<?> deleteContactGroup(@RequestHeader(value = "Authorization", required = false) String authorization,
                                        @PathVariable String groupId) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        try {
            chatService.deleteContactGroup(me, groupId);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/contact-assignments")
    @Operation(summary = "将教职工联系人归入分组；groupId 为空则清除分组并保留通讯录")
    public Result<?> setContactAssignment(@RequestHeader(value = "Authorization", required = false) String authorization,
                                          @RequestBody Map<String, String> body) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        String peer = body == null ? null : body.get("peerUserId");
        String gid = body == null ? null : body.get("groupId");
        try {
            chatService.setPeerContactGroup(me, peer, gid);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/contact-bookmarks")
    @Operation(summary = "本人已加入通讯录的教职工 peerUserId 列表（含分组与未分组）")
    public Result<?> listContactBookmarks(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        return Result.success(new ArrayList<>(chatService.listBookmarkedPeerIds(me)));
    }

    @PostMapping("/contact-bookmarks/{peerUserId}")
    @Operation(summary = "将教职工加入本人通讯录（无分组；若已有分组则保留）")
    public Result<?> addContactBookmark(@RequestHeader(value = "Authorization", required = false) String authorization,
                                        @PathVariable String peerUserId) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        try {
            chatService.addStaffContactBookmark(me, peerUserId);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/contact-bookmarks/{peerUserId}")
    @Operation(summary = "从本人通讯录移除教职工")
    public Result<?> removeContactBookmark(@RequestHeader(value = "Authorization", required = false) String authorization,
                                           @PathVariable String peerUserId) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        try {
            chatService.removeStaffContactBookmark(me, peerUserId);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/conversations/{conversationId}/read")
    @Operation(summary = "标记会话已读到当前最新消息（好友角标清零）")
    public Result<?> markConversationRead(@RequestHeader(value = "Authorization", required = false) String authorization,
                                          @PathVariable String conversationId) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        try {
            chatService.markConversationRead(me, conversationId);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/conversations")
    @Operation(summary = "我的会话列表")
    public Result<?> conversations(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        List<Map<String, Object>> list = chatService.listConversations(me);
        return Result.success(Map.of("data", list));
    }

    @PutMapping("/conversations/{conversationId}/pinned")
    @Operation(summary = "置顶或取消置顶会话（仅本人列表排序）")
    public Result<?> setConversationPinned(@RequestHeader(value = "Authorization", required = false) String authorization,
                                           @PathVariable String conversationId,
                                           @RequestBody Map<String, Object> body) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        boolean pinned = false;
        if (body != null && body.containsKey("pinned")) {
            Object v = body.get("pinned");
            if (v instanceof Boolean b) {
                pinned = b;
            } else if (v instanceof Number n) {
                pinned = n.intValue() != 0;
            } else if (v != null) {
                pinned = Boolean.parseBoolean(v.toString());
            }
        }
        try {
            chatService.setConversationPinned(me, conversationId, pinned);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/conversations/{conversationId}/from-my-list")
    @Operation(summary = "从本人会话列表移除（不删消息；从通讯录再打开可恢复）")
    public Result<?> hideConversationFromMyList(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                @PathVariable String conversationId) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        try {
            chatService.hideConversationFromMyList(me, conversationId);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/conversations/open/{peerUserId}")
    @Operation(summary = "打开或创建与对方的会话")
    public Result<?> open(@RequestHeader(value = "Authorization", required = false) String authorization,
                          @PathVariable String peerUserId) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        try {
            String cid = chatService.openOrGetConversation(me, peerUserId);
            return Result.success(Map.of("conversationId", cid));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/conversations/{conversationId}/messages")
    @Operation(summary = "拉取消息（afterMessageId 为空则返回最近一页，正序）")
    public Result<?> messages(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @PathVariable String conversationId,
                              @RequestParam(required = false) String afterMessageId,
                              @RequestParam(defaultValue = "50") int limit) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        try {
            List<Map<String, Object>> list = chatService.listMessages(me, conversationId, afterMessageId, limit);
            return Result.success(Map.of("data", list));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/conversations/{conversationId}/messages")
    @Operation(summary = "发送文本或引用已有附件")
    public Result<?> postMessage(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @PathVariable String conversationId,
                                 @RequestBody Map<String, String> body) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        String text = body == null ? null : body.get("body");
        String att = body == null ? null : body.get("attachmentId");
        try {
            return Result.success(chatService.postMessage(me, conversationId, text, att));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/conversations/{conversationId}/attachments")
    @Operation(summary = "上传附件")
    public Result<?> upload(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable String conversationId,
                            @RequestParam("file") MultipartFile file) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return Result.error("未登录或无权使用站内信");
        }
        try {
            return Result.success(chatService.uploadAttachment(me, conversationId, file));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("上传失败：" + e.getMessage());
        }
    }

    @GetMapping("/attachments/{attachmentId}/download")
    @Operation(summary = "下载附件")
    public ResponseEntity<Resource> download(@RequestHeader(value = "Authorization", required = false) String authorization,
                                            @PathVariable String attachmentId) {
        User me = chatService.requireChatUser(authorization);
        if (me == null) {
            return ResponseEntity.status(401).build();
        }
        try {
            Resource res = chatService.downloadAttachment(me, attachmentId);
            String name = chatService.downloadFilename(attachmentId, me);
            String mime = chatService.downloadMime(attachmentId, me);
            ContentDisposition disposition = ContentDisposition.attachment()
                    .filename(name, StandardCharsets.UTF_8)
                    .build();
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                    .contentType(MediaType.parseMediaType(mime))
                    .body(res);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(404).build();
        } catch (Exception e) {
            return ResponseEntity.status(500).build();
        }
    }
}
