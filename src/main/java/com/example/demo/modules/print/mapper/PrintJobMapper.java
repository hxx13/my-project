package com.example.demo.modules.print.mapper;

import com.example.demo.modules.print.entity.PrintJob;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * 打印任务读写。
 *
 * 所有状态迁移都写成「带前置条件的 UPDATE + 检查影响行数」，
 * 并发下天然互斥，不需要加锁。
 */
@Repository
public class PrintJobMapper {

    private static final String COLS =
            "id, station_id, source_type, source_id, file_name, copies, note, priority,"
          + " status, attempts, last_error, created_by, created_at, sent_at, printed_at, ephemeral"
          + ", cups_job_id, queue_state";

    private final JdbcTemplate jdbc;

    public PrintJobMapper(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<PrintJob> ROW = (rs, i) -> {
        PrintJob j = new PrintJob();
        j.setId(rs.getString("id"));
        j.setStationId(rs.getString("station_id"));
        j.setSourceType(rs.getString("source_type"));
        j.setSourceId(rs.getString("source_id"));
        j.setFileName(rs.getString("file_name"));
        j.setCopies(rs.getInt("copies"));
        j.setNote(rs.getString("note"));
        j.setPriority(rs.getInt("priority"));
        j.setStatus(rs.getString("status"));
        j.setAttempts(rs.getInt("attempts"));
        j.setLastError(rs.getString("last_error"));
        j.setCreatedBy(rs.getString("created_by"));
        j.setCreatedAt(String.valueOf(rs.getTimestamp("created_at")));
        Timestamp sent = rs.getTimestamp("sent_at");
        j.setSentAt(sent == null ? null : sent.toString());
        Timestamp printed = rs.getTimestamp("printed_at");
        j.setPrintedAt(printed == null ? null : printed.toString());
        j.setEphemeral(rs.getBoolean("ephemeral"));
        j.setCupsJobId(rs.getString("cups_job_id"));
        j.setQueueState(rs.getString("queue_state"));
        return j;
    };

    /** limit 由调用方传 int 并夹取，拼接进来的只会是数字，无注入面。 */
    private static String limitClause(int limit, int max) {
        return " LIMIT " + Math.max(1, Math.min(limit, max));
    }

    public void insert(PrintJob j) {
        jdbc.update("INSERT INTO print_job(" + COLS + ") VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NULL,NULL,?,?,?)",
                j.getId(), j.getStationId(), j.getSourceType(), j.getSourceId(),
                j.getFileName(), j.getCopies(), j.getNote(), j.getPriority(),
                j.getStatus(), j.getAttempts(), j.getLastError(), j.getCreatedBy(),
                j.isEphemeral(), j.getCupsJobId(), j.getQueueState());
    }

    public Optional<PrintJob> findById(String id) {
        List<PrintJob> r = jdbc.query(
                "SELECT " + COLS + " FROM print_job WHERE id = ? LIMIT 1", ROW, id);
        return r.isEmpty() ? Optional.empty() : Optional.of(r.get(0));
    }

    /**
     * 原子领取：只有 status 仍是 PENDING 时才置为 SENT。
     * 返回 1 = 抢到，0 = 被别人抢走了。这是不重复打印的唯一保证。
     */
    public int claim(String jobId, String stationId) {
        return jdbc.update(
                "UPDATE print_job SET status = ?, sent_at = NOW(), attempts = attempts + 1"
              + " WHERE id = ? AND station_id = ? AND status = ?",
                PrintJob.STATUS_SENT, jobId, stationId, PrintJob.STATUS_PENDING);
    }

    /**
     * 待领取的候选 id。加急的排在前面，同级按先进先出。
     * 每个工位的待打队列通常只有个位数，priority 上不额外建索引 —— 排序成本可以忽略。
     */
    public List<String> findPendingIds(String stationId, int limit) {
        return jdbc.queryForList(
                "SELECT id FROM print_job WHERE station_id = ? AND status = ?"
              + " ORDER BY priority DESC, created_at ASC" + limitClause(limit, 20),
                String.class, stationId, PrintJob.STATUS_PENDING);
    }

    /** 该工位排队中（还没被领走）的条数，给工位页显示。 */
    public int countPending(String stationId) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM print_job WHERE station_id = ? AND status = ?",
                Integer.class, stationId, PrintJob.STATUS_PENDING);
        return n == null ? 0 : n;
    }

    /**
     * 撤回 / 收掉一条任务。可撤的状态只有两种：
     * - `PENDING`：还没被工位领走，撤了就不会打
     * - `FAILED`：打失败了，用户处理完想把它从队列里清掉
     *
     * `SENT` 撤不了 —— 活已经在那台机器上了，改数据库也拦不住。
     *
     * 直发（SERVER 工位）那条路不走这里：`lp` 返回退出码 0 就已经被标成 PRINTED，
     * 但队列被停用时纸根本没出。那种任务要撤得先撤 CUPS 那侧，再用 cancelAny() 落库。
     *
     * **刻意不动 last_error**：失败原因要留着，否则「为什么失败」这条信息
     * 就被一次"收掉"操作抹掉了。
     */
    public int cancel(String jobId) {
        return jdbc.update(
                "UPDATE print_job SET status = ? WHERE id = ? AND status IN (?,?)",
                PrintJob.STATUS_CANCELLED, jobId,
                PrintJob.STATUS_PENDING, PrintJob.STATUS_FAILED);
    }

    /**
     * 提交给 CUPS 成功后回填作业号。
     * 只在还没拿到号时写 —— 重推会再跑一次 lp，别把新作业号盖在旧的上（旧的那条可能还在队列里）。
     */
    public int setCupsJobId(String jobId, String cupsJobId) {
        return jdbc.update(
                "UPDATE print_job SET cups_job_id = ? WHERE id = ? AND (cups_job_id IS NULL OR cups_job_id = '')",
                cupsJobId, jobId);
    }

    /**
     * 核对任务的唯一写入点：把这台工位有作业号的任务收敛一次。
     *
     * 两步：先把现在标着 QUEUED 的行降回 CLEARED，再把确实还在队列里的抬回 QUEUED。
     * 状态是**推出来的**，所以不接收「要置成什么状态」的参数。
     */
    public int markQueueState(String stationId, Set<String> queuedJobIds, int withinHours) {
        // 第一步**不能加时间窗**。加了就有一个洞：一行在窗口内被标成 QUEUED，24 小时之后
        // 再没有任何一条路径会碰它，于是永远停在「还卡在队列里」—— 那是这次要消灭的那个谎
        // 的镜像版（队列早清了、纸早打出来了，界面却一直挂着「仍卡在打印机队列」和一颗
        // 点下去什么都不会发生的撤回按钮）。
        //
        // 代价可控：这里只碰 queue_state='QUEUED' 的行，条数就是「此刻真卡着的数量」，
        // 天生很小，不存在随时间增长的问题。
        int cleared = jdbc.update(
                "UPDATE print_job SET queue_state = ?"
              + " WHERE station_id = ? AND cups_job_id IS NOT NULL AND queue_state = ?",
                PrintJob.QUEUE_CLEARED, stationId, PrintJob.QUEUE_QUEUED);

        if (queuedJobIds == null || queuedJobIds.isEmpty()) {
            return cleared;
        }

        // 第二步**要**时间窗，但作用完全不同：它只限制「哪些行有资格被判为还在队列里」。
        // 超过窗口的任务不可能还排着，扫它是白做功。这里判错方向的代价也不对称 ——
        // 漏判只会让该行停在 CLEARED（「已不在队列」），不会撒谎说它还卡着。
        StringBuilder in = new StringBuilder("?,".repeat(queuedJobIds.size()));
        in.setLength(in.length() - 1);
        List<Object> args = new ArrayList<>();
        args.add(PrintJob.QUEUE_QUEUED);
        args.add(stationId);
        args.add(withinHours);
        args.addAll(queuedJobIds);
        return cleared + jdbc.update(
                "UPDATE print_job SET queue_state = ?"
              + " WHERE station_id = ? AND cups_job_id IS NOT NULL"
              + "   AND created_at > DATE_SUB(NOW(), INTERVAL ? HOUR)"
              + "   AND cups_job_id IN (" + in + ")",
                args.toArray());
    }

    /**
     * 清空某台打印机队列时，把库里对应记录一起收起。
     * 只收 queue_state='QUEUED' 的 —— 已经打完的不该被误伤。
     */
    public int cancelQueued(String stationId) {
        return jdbc.update(
                "UPDATE print_job SET status = ? WHERE station_id = ? AND queue_state = ?",
                PrintJob.STATUS_CANCELLED, stationId, PrintJob.QUEUE_QUEUED);
    }

    /**
     * 撤销一条已经被 CUPS 接收的任务。
     *
     * 为什么不复用 cancel()：cancel 只认 PENDING/FAILED，而直发卡住的任务是 PRINTED
     * （lp 退出码 0，我们当时以为成功了）。库里那层判据不能放宽 —— 放宽会让「已打印」
     * 这个历史事实被一次操作抹掉。所以 CUPS 那侧撤成功后，用这个方法单独落库。
     */
    public int cancelAny(String jobId) {
        return jdbc.update(
                "UPDATE print_job SET status = ? WHERE id = ? AND status <> ?",
                PrintJob.STATUS_CANCELLED, jobId, PrintJob.STATUS_CANCELLED);
    }

    /** 回执：只有 SENT 态的任务能落终态。返回 0 表示任务不在可回执状态。 */
    public int acknowledge(String jobId, String stationId, String status, String error) {
        return jdbc.update(
                "UPDATE print_job SET status = ?, printed_at = NOW(), last_error = ?"
              + " WHERE id = ? AND station_id = ? AND status = ?",
                status, error, jobId, stationId, PrintJob.STATUS_SENT);
    }

    /**
     * 超时未回执的候选 id。先查后改，是为了能逐个报「哪个任务失败了」——
     * failTimedOut 只回条数，通知要的是人话。
     * 与 failTimedOut 同一判据、同一索引（idx_print_job_status_sent）。
     */
    public List<String> findTimedOutIds(int minutes) {
        return jdbc.queryForList(
                "SELECT id FROM print_job WHERE status = ? AND sent_at IS NOT NULL"
              + "   AND sent_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)",
                String.class, PrintJob.STATUS_SENT, minutes);
    }

    /** 超时未回执 → FAILED。走 idx_print_job_status_sent，不全表扫。 */
    public int failTimedOut(int minutes) {
        return jdbc.update(
                "UPDATE print_job SET status = ?, last_error = ?"
              + " WHERE status = ? AND sent_at IS NOT NULL"
              + "   AND sent_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)",
                PrintJob.STATUS_FAILED, "工位超时未回执", PrintJob.STATUS_SENT, minutes);
    }

    /** 重推：只有 FAILED 能回到 PENDING，并清零计时与错误。 */
    public int retry(String jobId) {
        return jdbc.update(
                "UPDATE print_job SET status = ?, sent_at = NULL, printed_at = NULL, last_error = NULL"
              + " WHERE id = ? AND status = ?",
                PrintJob.STATUS_PENDING, jobId, PrintJob.STATUS_FAILED);
    }

    public List<PrintJob> listByStation(String stationId, int limit) {
        return jdbc.query(
                "SELECT " + COLS + " FROM print_job WHERE station_id = ?"
              + " ORDER BY created_at DESC" + limitClause(limit, 200),
                ROW, stationId);
    }

    /** 某账号发起的任务。 */
    public List<PrintJob> listByCreator(String userId, int limit) {
        return jdbc.query(
                "SELECT " + COLS + " FROM print_job WHERE created_by = ?"
              + " ORDER BY created_at DESC" + limitClause(limit, 200),
                ROW, userId);
    }

    /**
     * 队列：还没结束的任务（排队中 / 已派给工位 / 失败待处理）。
     * 加急排前面，同级按派发时间倒序 —— 现场的人关心的是「接下来打什么」。
     */
    public List<PrintJob> listQueue(String stationId, String viewerId, int limit) {
        StringBuilder sql = new StringBuilder(
                "SELECT " + COLS + " FROM print_job WHERE status IN (?,?,?)");
        List<Object> args = new ArrayList<>();
        args.add(PrintJob.STATUS_PENDING);
        args.add(PrintJob.STATUS_SENT);
        args.add(PrintJob.STATUS_FAILED);
        if (stationId != null && !stationId.isBlank()) {
            sql.append(" AND station_id = ?");
            args.add(stationId.trim());
        }
        sql.append(" AND (ephemeral = 0 OR created_by = ?)");
        args.add(viewerId);
        sql.append(" ORDER BY priority DESC, created_at DESC").append(limitClause(limit, 200));
        return jdbc.query(sql.toString(), ROW, args.toArray());
    }

    /** 历史：全部状态，可按工位、按状态（逗号分隔多个）筛。 */
    public List<PrintJob> listHistory(String stationId, String statusCsv, String viewerId, int limit) {
        StringBuilder sql = new StringBuilder("SELECT " + COLS + " FROM print_job WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (stationId != null && !stationId.isBlank()) {
            sql.append(" AND station_id = ?");
            args.add(stationId.trim());
        }
        if (statusCsv != null && !statusCsv.isBlank()) {
            List<String> wanted = new ArrayList<>();
            for (String s : statusCsv.split(",")) {
                String v = s.trim().toUpperCase();
                if (!v.isEmpty()) wanted.add(v);
            }
            if (!wanted.isEmpty()) {
                sql.append(" AND status IN (").append("?,".repeat(wanted.size()));
                sql.setLength(sql.length() - 1);
                sql.append(")");
                args.addAll(wanted);
            }
        }
        sql.append(" AND (ephemeral = 0 OR created_by = ?)");
        args.add(viewerId);
        sql.append(" ORDER BY created_at DESC").append(limitClause(limit, 500));
        return jdbc.query(sql.toString(), ROW, args.toArray());
    }

    public List<PrintJob> listAll(String viewerId, int limit) {
        return jdbc.query(
                "SELECT " + COLS + " FROM print_job WHERE (ephemeral = 0 OR created_by = ?)"
              + " ORDER BY created_at DESC" + limitClause(limit, 200),
                ROW, viewerId);
    }
}
