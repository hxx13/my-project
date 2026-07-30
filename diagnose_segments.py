"""诊断：列出所有移动段及被丢弃原因，与实际轨迹对比"""
import pymysql, sys, json, math
sys.stdout.reconfigure(encoding='utf-8')

db = pymysql.connect(host='localhost', user='root', password='SuperAdmin@2026',
                     database='twin_system', charset='utf8mb4', port=3306)
cur = db.cursor()

MOVE_THRESHOLD = 0.05
STOP_CUT = 8
MIN_POINTS = 8
MIN_LENGTH = 2.5

for ip in ["172.22.159.16","172.22.159.18","172.22.159.20","172.22.159.22"]:
    cur.execute("""
        SELECT x, y, recorded_at FROM agv_trajectory
        WHERE robot_ip=%s AND recorded_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)
          AND x IS NOT NULL AND y IS NOT NULL
        ORDER BY recorded_at
    """, (ip,))
    rows = cur.fetchall()
    if len(rows) < 50: continue

    # 统计原始数据的移动/静止分布
    gaps = []
    stationary_runs = []
    current_stop = 0
    for i in range(1, len(rows)):
        dx = rows[i][0] - rows[i-1][0]
        dy = rows[i][1] - rows[i-1][1]
        d = math.sqrt(dx*dx + dy*dy)
        gaps.append(d)
        if d <= MOVE_THRESHOLD:
            current_stop += 1
        else:
            if current_stop > 0:
                stationary_runs.append(current_stop)
            current_stop = 0

    sorted_gaps = sorted(gaps)
    print(f"\n{'='*70}")
    print(f"{ip}: {len(rows)} 行, 步长分布: min={sorted_gaps[0]:.4f}m p50={sorted_gaps[len(sorted_gaps)//2]:.3f}m p95={sorted_gaps[int(len(sorted_gaps)*0.95)]:.3f}m max={sorted_gaps[-1]:.2f}m")
    print(f"  静止段分布: {' '.join(str(s) for s in sorted(stationary_runs, reverse=True)[:20])}")

    # 模拟提取：输出所有段及其结局
    segments = []
    current = []
    stop_count = 0
    px, py = 0, 0
    rejected = {'too_few_points': 0, 'too_short': 0, 'accepted': 0}

    for i, (x, y, ts) in enumerate(rows):
        moving = len(current) == 0 or math.sqrt((x-px)*(x-px)+(y-py)*(y-py)) > MOVE_THRESHOLD
        if moving:
            current.append((x, y))
            stop_count = 0
        elif current:
            stop_count += 1
            if stop_count > STOP_CUT:
                seg_len = sum(math.dist(current[j-1], current[j]) for j in range(1, len(current)))
                if len(current) < MIN_POINTS:
                    rejected['too_few_points'] += 1
                elif seg_len < MIN_LENGTH:
                    rejected['too_short'] += 1
                else:
                    rejected['accepted'] += 1
                    segments.append((current, seg_len))
                current = []
                stop_count = 0
        px, py = x, y

    # 收尾
    if current:
        seg_len = sum(math.dist(current[j-1], current[j]) for j in range(1, len(current)))
        if len(current) >= MIN_POINTS and seg_len >= MIN_LENGTH:
            segments.append((current, seg_len))
            rejected['accepted'] += 1

    print(f"  结果: 采纳={rejected['accepted']}  点数不足(<{MIN_POINTS})={rejected['too_few_points']}  太短(<{MIN_LENGTH}m)={rejected['too_short']}")

    # 输出所有被采纳的段
    if segments:
        print(f"  采纳的段:")
        for idx, (seg, slen) in enumerate(segments):
            straight = math.dist(seg[0], seg[-1])
            print(f"    #{idx}: {len(seg)}点 {slen:.1f}m 直线{straight:.1f}m 起({seg[0][0]:.1f},{seg[0][1]:.1f}) 止({seg[-1][0]:.1f},{seg[-1][1]:.1f})")

    # 对比：当前数据库中已有路线数
    cur.execute("SELECT COUNT(*) FROM agv_route WHERE robot_ip=%s AND enabled=1", (ip,))
    route_count = cur.fetchone()[0]
    print(f"  已有路线: {route_count} 条")

db.close()
