package com.example.demo.modules.print.mapper;

import com.example.demo.modules.print.entity.PrintJob;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

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
          + " status, attempts, last_error, created_by, created_at, sent_at, printed_at";

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
        return j;
    };

    /** limit 由调用方传 int 并夹取，拼接进来的只会是数字，无注入面。 */
    private static String limitClause(int limit, int max) {
        return " LIMIT " + Math.max(1, Math.min(limit, max));
    }

    public void insert(PrintJob j) {
        jdbc.update("INSERT INTO print_job(" + COLS + ") VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NULL,NULL)",
                j.getId(), j.getStationId(), j.getSourceType(), j.getSourceId(),
                j.getFileName(), j.getCopies(), j.getNote(), j.getPriority(),
                j.getStatus(), j.getAttempts(), j.getLastError(), j.getCreatedBy());
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
     * 撤回：只有还没被工位领走的才能撤。
     * 领走之后（SENT）就撤不回来了 —— 那已经交给工位页和它那台机器了。
     */
    public int cancel(String jobId) {
        return jdbc.update(
                "UPDATE print_job SET status = ?, last_error = ? WHERE id = ? AND status = ?",
                PrintJob.STATUS_CANCELLED, "已撤回", jobId, PrintJob.STATUS_PENDING);
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
    public List<PrintJob> listQueue(String stationId, int limit) {
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
        sql.append(" ORDER BY priority DESC, created_at DESC").append(limitClause(limit, 200));
        return jdbc.query(sql.toString(), ROW, args.toArray());
    }

    /** 历史：全部状态，可按工位、按状态（逗号分隔多个）筛。 */
    public List<PrintJob> listHistory(String stationId, String statusCsv, int limit) {
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
        sql.append(" ORDER BY created_at DESC").append(limitClause(limit, 500));
        return jdbc.query(sql.toString(), ROW, args.toArray());
    }

    public List<PrintJob> listAll(int limit) {
        return jdbc.query(
                "SELECT " + COLS + " FROM print_job ORDER BY created_at DESC" + limitClause(limit, 200),
                ROW);
    }
}
