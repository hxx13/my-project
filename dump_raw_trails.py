"""输出原始轨迹：按时间戳连线，0.05m内去重"""
import pymysql, sys, json, math, os
sys.stdout.reconfigure(encoding='utf-8')

db = pymysql.connect(host='localhost', user='root', password='SuperAdmin@2026',
                     database='twin_system', charset='utf8mb4', port=3306)
cur = db.cursor()

OUT = "d:/codex/verson.1.2/20260416/raw_trails.json"

data = {}
for ip in ["172.22.159.16","172.22.159.18","172.22.159.20","172.22.159.22"]:
    cur.execute("""
        SELECT x, y, recorded_at, station FROM agv_trajectory
        WHERE robot_ip=%s AND recorded_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)
          AND x IS NOT NULL AND y IS NOT NULL
        ORDER BY recorded_at
    """, (ip,))
    rows = cur.fetchall()
    print(f"{ip}: {len(rows)} 行")

    # 按时间戳连线 + 去重 (0.05m内保留首次)
    trail = []
    last_x, last_y = None, None
    for x, y, ts, st in rows:
        if last_x is not None:
            d = math.sqrt((x-last_x)**2 + (y-last_y)**2)
            if d < 0.05:
                continue  # 太近去重
        trail.append({"x": round(x,3), "y": round(y,3), "ts": str(ts), "st": st or ""})
        last_x, last_y = x, y

    data[ip] = trail
    # 统计
    stops = sum(1 for p in trail if p["st"])
    moving = len(trail) - stops
    print(f"  去重后: {len(trail)} 点 (移动{moving}, 站点{stops})")

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False)
print(f"\n已输出到: {OUT}")
print(f"文件大小: {os.path.getsize(OUT)/1024:.0f} KB")
db.close()
