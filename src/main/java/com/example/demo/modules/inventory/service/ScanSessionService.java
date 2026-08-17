package com.example.demo.modules.inventory.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.inventory.dto.ScanCommitResult;
import com.example.demo.modules.inventory.dto.ScanLineView;
import com.example.demo.modules.inventory.dto.ScanSessionView;
import com.example.demo.modules.inventory.entity.InvItem;
import com.example.demo.modules.inventory.entity.InvItemLog;
import com.example.demo.modules.inventory.entity.InvScanLine;
import com.example.demo.modules.inventory.entity.InvScanSession;
import com.example.demo.modules.inventory.entity.InvSpace;
import com.example.demo.modules.inventory.mapper.ItemLogMapper;
import com.example.demo.modules.inventory.mapper.ItemMapper;
import com.example.demo.modules.inventory.mapper.ScanLineMapper;
import com.example.demo.modules.inventory.mapper.ScanSessionMapper;
import com.example.demo.modules.inventory.mapper.SpaceMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class ScanSessionService {

    private final ItemMapper itemMapper;
    private final ItemLogMapper itemLogMapper;
    private final ScanSessionMapper scanSessionMapper;
    private final ScanLineMapper scanLineMapper;
    private final SpaceMapper spaceMapper;

    public ScanSessionService(ItemMapper itemMapper,
                              ItemLogMapper itemLogMapper,
                              ScanSessionMapper scanSessionMapper,
                              ScanLineMapper scanLineMapper,
                              SpaceMapper spaceMapper) {
        this.itemMapper = itemMapper;
        this.itemLogMapper = itemLogMapper;
        this.scanSessionMapper = scanSessionMapper;
        this.scanLineMapper = scanLineMapper;
        this.spaceMapper = spaceMapper;
    }

    /** 开始盘点会话：建一条 IN_PROGRESS 会话 */
    public Result<ScanSessionView> startSession(Long spaceId, String operatorUserId) {
        if (spaceId == null) {
            return Result.error("盘点空间不能为空");
        }
        InvScanSession session = new InvScanSession();
        session.setSpaceId(spaceId);
        session.setOperatorUserId(operatorUserId);
        scanSessionMapper.insert(session);
        return Result.success(toView(scanSessionMapper.selectById(session.getId())));
    }

    /** 灌入一个码：同会话同码去重，按命中情况三分类 */
    public Result<ScanLineView> addLine(Long sessionId, String rfidCode) {
        InvScanSession session = scanSessionMapper.selectById(sessionId);
        if (session == null) {
            return Result.error("盘点会话不存在");
        }
        if (!"IN_PROGRESS".equals(session.getStatus())) {
            return Result.error("会话状态不允许添加明细");
        }
        InvScanLine existing = scanLineMapper.selectBySessionAndCode(sessionId, rfidCode);
        if (existing != null) {
            return Result.success(toView(existing));
        }

        List<Long> descendants = descendantIds(session.getSpaceId());
        InvItem item = itemMapper.selectByRfidCode(rfidCode);
        if (item != null && "RETIRED".equals(item.getStatus())) {
            return Result.error("该码已废弃");
        }

        InvScanLine line = new InvScanLine();
        line.setSessionId(sessionId);
        line.setRfidCode(rfidCode);
        if (item == null) {
            line.setLineType("NEW");
            line.setMatchedItemId(null);
        } else if (item.getSpaceId() != null && descendants.contains(item.getSpaceId())) {
            line.setLineType("IN_PLACE");
            line.setMatchedItemId(item.getId());
        } else {
            line.setLineType("ELSEWHERE");
            line.setMatchedItemId(item.getId());
        }
        scanLineMapper.insert(line);
        return Result.success(toView(line));
    }

    /** 会话详情：session + lines + 实时「在册未扫到」预览 */
    public Result<Map<String, Object>> getSession(Long sessionId) {
        InvScanSession session = scanSessionMapper.selectById(sessionId);
        if (session == null) {
            return Result.error("盘点会话不存在");
        }
        List<InvScanLine> lines = scanLineMapper.selectBySessionId(sessionId);

        List<ScanLineView> lineViews = new ArrayList<>();
        Set<String> scannedCodes = new HashSet<>();
        for (InvScanLine line : lines) {
            lineViews.add(toView(line));
            if (line.getRfidCode() != null) {
                scannedCodes.add(line.getRfidCode());
            }
        }

        List<InvItem> missing = computeMissing(session.getSpaceId(), scannedCodes);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("session", toView(session));
        data.put("lines", lineViews);
        data.put("missing", missing);
        return Result.success(data);
    }

    /** 提交对账：一次性批量落库 + 留痕（原子一致） */
    @Transactional
    public Result<ScanCommitResult> commit(Long sessionId, String operatorUserId) {
        InvScanSession session = scanSessionMapper.selectById(sessionId);
        if (session == null) {
            return Result.error("盘点会话不存在");
        }
        if (!"IN_PROGRESS".equals(session.getStatus())) {
            return Result.error("会话状态不允许提交");
        }

        // 先「认领」会话：仅 IN_PROGRESS 时可置 COMMITTED，返回 0 表示已被并发提交/取消。
        // 提前作为守卫，保证后续任何异常都能随事务回滚该认领，避免重复落库。
        if (scanSessionMapper.markCommitted(sessionId) == 0) {
            return Result.error("会话已提交或已取消");
        }

        List<InvScanLine> lines = scanLineMapper.selectBySessionId(sessionId);
        List<Long> descendants = descendantIds(session.getSpaceId());
        List<InvItem> subtreeItems = itemMapper.selectBySpaceIds(descendants);

        int foundCount = 0;
        int newCount = 0;
        int missingCount = 0;
        Set<String> scannedCodes = new HashSet<>();

        for (InvScanLine line : lines) {
            if (line.getRfidCode() != null) {
                scannedCodes.add(line.getRfidCode());
            }
            String type = line.getLineType();
            if ("IN_PLACE".equals(type)) {
                if (line.getMatchedItemId() != null) {
                    itemMapper.updateLastScannedAt(line.getMatchedItemId());
                    writeLog(line.getMatchedItemId(), "SCAN_FOUND", null, null, operatorUserId);
                }
                foundCount++;
            } else if ("ELSEWHERE".equals(type)) {
                if (line.getMatchedItemId() != null) {
                    InvItem item = itemMapper.selectById(line.getMatchedItemId());
                    Long fromSpaceId = item != null ? item.getSpaceId() : null;
                    itemMapper.updateSpace(line.getMatchedItemId(), session.getSpaceId());
                    writeLog(line.getMatchedItemId(), "TRANSFER", fromSpaceId, session.getSpaceId(), operatorUserId);
                    itemMapper.updateLastScannedAt(line.getMatchedItemId());
                }
            } else if ("NEW".equals(type)) {
                InvItem newItem = new InvItem();
                newItem.setRfidCode(line.getRfidCode());
                newItem.setName("新发现 " + line.getRfidCode());
                newItem.setSpaceId(session.getSpaceId());
                newItem.setGranularity("UNIT");
                newItem.setQty(1);
                newItem.setStatus("IN_USE");
                newItem.setCreatedBy(operatorUserId);
                itemMapper.insert(newItem);
                writeLog(newItem.getId(), "SCAN_NEW", null, session.getSpaceId(), operatorUserId);
                newCount++;
            }
        }

        // 疑似丢失：子树内有码且本次未扫到的在册物品
        for (InvItem item : subtreeItems) {
            if (item.getRfidCode() == null || item.getRfidCode().isBlank()) {
                continue;
            }
            if (scannedCodes.contains(item.getRfidCode())) {
                continue;
            }
            if ("MISSING".equals(item.getStatus())) {
                continue;
            }
            itemMapper.updateStatus(item.getId(), "MISSING");
            writeLog(item.getId(), "SCAN_MISSING", null, null, operatorUserId);
            missingCount++;
        }

        int scannedCount = lines.size();
        scanSessionMapper.updateStats(sessionId, scannedCount, foundCount, newCount, missingCount);

        ScanCommitResult result = new ScanCommitResult();
        result.setSessionId(sessionId);
        result.setScannedCount(scannedCount);
        result.setFoundCount(foundCount);
        result.setNewCount(newCount);
        result.setMissingCount(missingCount);
        return Result.success(result);
    }

    /** 取消会话：置 CANCELLED 并清空明细 */
    public Result<?> cancel(Long sessionId) {
        InvScanSession session = scanSessionMapper.selectById(sessionId);
        if (session == null) {
            return Result.error("盘点会话不存在");
        }
        if (!"IN_PROGRESS".equals(session.getStatus())) {
            return Result.error("会话状态不允许取消");
        }
        scanSessionMapper.updateStatus(sessionId, "CANCELLED");
        scanLineMapper.deleteBySessionId(sessionId);
        return Result.success(null);
    }

    /** 空间子树（含自身）后代 id 集合，用于判定在册范围 */
    private List<Long> descendantIds(Long rootId) {
        List<InvSpace> spaces = spaceMapper.selectAll();
        Map<Long, List<Long>> children = new HashMap<>();
        for (InvSpace space : spaces) {
            if (space.getParentId() != null) {
                children.computeIfAbsent(space.getParentId(), k -> new ArrayList<>()).add(space.getId());
            }
        }
        List<Long> result = new ArrayList<>();
        Deque<Long> stack = new ArrayDeque<>();
        Set<Long> seen = new HashSet<>();
        stack.push(rootId);
        while (!stack.isEmpty()) {
            Long id = stack.pop();
            if (id == null || !seen.add(id)) {
                continue;
            }
            result.add(id);
            List<Long> cs = children.get(id);
            if (cs != null) {
                for (Long c : cs) {
                    stack.push(c);
                }
            }
        }
        return result;
    }

    /** 子树内「有码且未在本次扫描集合中」的在册物品（实时预览用，不落库） */
    private List<InvItem> computeMissing(Long spaceId, Set<String> scannedCodes) {
        List<Long> descendants = descendantIds(spaceId);
        List<InvItem> subtreeItems = itemMapper.selectBySpaceIds(descendants);
        List<InvItem> missing = new ArrayList<>();
        for (InvItem item : subtreeItems) {
            if (item.getRfidCode() == null || item.getRfidCode().isBlank()) {
                continue;
            }
            if (!scannedCodes.contains(item.getRfidCode())) {
                missing.add(item);
            }
        }
        return missing;
    }

    private void writeLog(Long itemId, String logType, Long fromSpaceId, Long toSpaceId, String operatorUserId) {
        InvItemLog log = new InvItemLog();
        log.setItemId(itemId);
        log.setLogType(logType);
        log.setFromSpaceId(fromSpaceId);
        log.setToSpaceId(toSpaceId);
        log.setOperatorUserId(operatorUserId);
        itemLogMapper.insert(log);
    }

    private ScanSessionView toView(InvScanSession session) {
        ScanSessionView view = new ScanSessionView();
        view.setId(session.getId());
        view.setSpaceId(session.getSpaceId());
        view.setOperatorUserId(session.getOperatorUserId());
        view.setStatus(session.getStatus());
        view.setStartedAt(session.getStartedAt());
        view.setCommittedAt(session.getCommittedAt());
        view.setScannedCount(session.getScannedCount());
        view.setFoundCount(session.getFoundCount());
        view.setNewCount(session.getNewCount());
        view.setMissingCount(session.getMissingCount());
        return view;
    }

    private ScanLineView toView(InvScanLine line) {
        ScanLineView view = new ScanLineView();
        view.setId(line.getId());
        view.setRfidCode(line.getRfidCode());
        view.setMatchedItemId(line.getMatchedItemId());
        view.setLineType(line.getLineType());
        view.setScannedAt(line.getScannedAt());
        return view;
    }
}
