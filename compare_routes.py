"""自动比对：拟合路线 vs 原始轨迹 — 计算逐点偏差"""
import pymysql, sys, json, math
sys.stdout.reconfigure(encoding='utf-8')

db = pymysql.connect(host='localhost', user='root', password='SuperAdmin@2026',
                     database='twin_system', charset='utf8mb4', port=3306)
cur = db.cursor()

cur.execute("SELECT id, robot_ip, name, path_json, frequency, from_station, to_station FROM agv_route WHERE enabled=1 ORDER BY robot_ip, id")
routes = cur.fetchall()

print(f"{'='*80}")
print(f"拟合路线 vs 原始轨迹 偏差分析 (共{len(routes)}条)")
print(f"{'='*80}")

for rid, ip, name, path_json, freq, fs, ts in routes:
    fitted = json.loads(path_json)
    if len(fitted) < 3: continue

    straight = math.dist(fitted[0], fitted[-1])
    total = sum(math.dist(fitted[i-1], fitted[i]) for i in range(1, len(fitted)))
    if total < 3.0: continue  # 跳过太短的

    # 取路线的起点和终点
    sx, sy = fitted[0][0], fitted[0][1]
    ex, ey = fitted[-1][0], fitted[-1][1]

    # 查询原始轨迹：在起点附近出现过，并在10分钟内到达终点附近的完整移动段
    cur.execute("""
        SELECT x, y, recorded_at FROM agv_trajectory
        WHERE robot_ip=%s AND recorded_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)
          AND x IS NOT NULL AND y IS NOT NULL
        ORDER BY recorded_at
    """, (ip,))
    all_raw = cur.fetchall()
    if len(all_raw) < 10: continue

    # 找经过起终点附近的完整段
    segments = []
    seg = []
    near_start = False
    for i, (rx, ry, rts) in enumerate(all_raw):
        d_start = math.dist((rx, ry), (sx, sy))
        d_end = math.dist((rx, ry), (ex, ey))

        if not near_start and d_start < 3.0:
            near_start = True
            seg = [(rx, ry)]

        if near_start:
            seg.append((rx, ry))
            if d_end < 3.0 and len(seg) > 5:
                # 到达终点附近
                total_raw = sum(math.dist(seg[j-1], seg[j]) for j in range(1, len(seg)))
                if total_raw > 2.0:
                    segments.append((seg, total_raw))
                near_start = False
                seg = []

    if not segments:
        print(f"\n[#{rid}] {name} (频次{freq}, 拟合{total:.1f}m)")
        print(f"  ⚠ 找不到匹配的原始轨迹段")
        continue

    # 取最接近拟合长度的原始段
    best_seg, best_len = min(segments, key=lambda s: abs(s[1] - total))

    # 逐点偏差：原始段 → 拟合曲线的最小距离
    deviations = []
    for rx, ry in best_seg:
        min_d = min(math.dist((rx, ry), (fx, fy)) for fx, fy in fitted)
        deviations.append(min_d)

    devs_sorted = sorted(deviations)
    avg_dev = sum(deviations) / len(deviations)
    max_dev = max(deviations)
    p50 = devs_sorted[len(devs_sorted)//2]
    p95 = devs_sorted[int(len(devs_sorted)*0.95)]

    print(f"\n[#{rid}] {name}")
    print(f"  拟合: {len(fitted)}点 {total:.1f}m 曲率{total/straight:.2f}x")
    print(f"  原始: {len(best_seg)}点 {best_len:.1f}m (频次{freq})")
    print(f"  偏差: 平均{avg_dev:.2f}m  中位{p50:.2f}m  P95={p95:.2f}m  最大{max_dev:.2f}m")
    grade = "✅ 优秀" if avg_dev < 0.3 else ("🟡 可接受" if avg_dev < 0.8 else "🔴 偏差大")
    print(f"  评级: {grade}")

db.close()
