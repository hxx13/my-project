# AGV 小车接口文档

> 更新时间：2026-07-21
> 网关主机：192.168.1.100:1234（Django scheduling_platform）

---

## 一、接口说明

### 获取 AGV 机器人全部状态

**请求 URL**

```
GET http://192.168.1.100:1234/agv/statusall?ip={agv_ip}
```

**请求方法**

`GET`

**请求参数（Query String）**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ip | string | 是 | AGV 机器人在内网的 IP 地址 |

---

## 二、响应字段说明

### 2.1 返回顶层结构

| 字段 | 类型 | 说明 |
|------|------|------|
| ret_code | int | 0 = 成功；-1 = 失败（离线或不可达） |

### 2.2 成功时返回的全部字段

#### 基本信息

| 字段 | 类型 | 说明 |
|------|------|------|
| vehicle_id | string | 车辆编号 |
| current_ip | string | 当前 IP 地址 |
| current_map | string | 当前载入的地图名称 |
| current_station | string | 当前所在站点编号 |
| task_status | int | 任务状态码 |
| total_time | int | 运行总时长（毫秒） |
| create_on | string | 数据生成时间（ISO 8601） |
| robot_note | string | 机器人备注 |
| odo | float | 里程计读数（米） |

#### 位置信息

| 字段 | 类型 | 说明 |
|------|------|------|
| x | float | X 坐标 |
| y | float | Y 坐标 |
| angle | float | 朝向角度（弧度） |
| confidence | float | 定位置信度（0~1） |

#### 电量

| 字段 | 类型 | 说明 |
|------|------|------|
| battery_level | float | 电量百分比（0~1） |
| charging | bool | 是否正在充电 |

#### 运行状态（bool）

| 字段 | 类型 | 说明 |
|------|------|------|
| blocked | bool | 是否被阻挡 |
| emergency | bool | 是否触发急停 |
| driver_emc | bool | 驱动是否 EMC 异常 |

#### 顶升机构（Jack）

| 字段 | 类型 | 说明 |
|------|------|------|
| jack_enable | bool | 顶升使能 |
| jack_mode | bool | 顶升模式 |
| jack_isFull | bool | 是否满载 |
| jack_state | int | 顶升状态码 |
| jack_error_code | int | 顶升错误码（0 = 正常） |

#### 数字输入（DI）

| 字段 | 类型 | 说明 |
|------|------|------|
| DI | array | 9 路数字输入，每路 `{ id, source, status, valid }` |

#### 系统状态

| 字段 | 类型 | 说明 |
|------|------|------|
| loadmap_status | int | 地图载入状态（1 = 正常） |
| reloc_status | int | 重定位状态（1 = 正常） |
| errors | array | 错误列表 |
| warnings | array | 警告列表 |
| fatals | array | 致命错误列表 |
| notices | array | 通知列表 |

#### 无线网络

| 字段 | 类型 | 说明 |
|------|------|------|
| ssid | string | 连接的 WiFi SSID |
| rssi | int | 信号强度 |

---

## 三、AGV 车队当前状态

| 内网 IP | 车辆编号 | 状态 | 电量 | 位置 | 充电 |
|----------|----------|------|------|------|------|
| 172.22.159.16 | — | ❌ 离线 | — | — | — |
| 172.22.159.18 | AMB-01 | ✅ 在线 | 87% | CP1101 | 🔋 充电中 |
| 172.22.159.20 | — | ❌ 离线 | — | — | — |
| 172.22.159.22 | — | ❌ 离线 | — | — | — |

---

## 四、AMB-01 详细状态

> 数据时间：2026-07-21 17:10（UTC-11）

### 4.1 基本信息

| 字段 | 值 |
|------|-----|
| 车辆编号 | **AMB-01** |
| 当前 IP | 172.22.159.18 |
| 当前地图 | jiaoda-1 |
| 当前站点 | CP1101 |
| 任务状态 | 4 |
| 运行总时长 | 2,658,988,275 ms（约 30.8 天） |
| 里程计 | 70,627.422 m |

### 4.2 位置

| 字段 | 值 |
|------|-----|
| X | -13.4357 |
| Y | -1.8362 |
| 朝向 | -1.582 rad（约 -90.6°） |
| 定位置信度 | 97.34% |

### 4.3 电量与充电

| 字段 | 值 |
|------|-----|
| 电量 | **87%** |
| 充电 | ✅ 进行中 |

### 4.4 运行状态

| 状态 | 值 |
|------|-----|
| 急停 | 🟢 正常 |
| 阻塞 | 🟢 正常 |
| 驱动 EMC | 🟢 正常 |
| 错误 | 无 |
| 告警 | 无 |
| 致命错误 | 无 |
| 地图载入 | ✅ 正常 |
| 重定位 | ✅ 正常 |

### 4.5 顶升机构

| 字段 | 值 |
|------|-----|
| 顶升使能 | 否 |
| 顶升模式 | 否 |
| 满载 | 否 |
| 状态码 | 0 |
| 错误码 | 0（正常） |

### 4.6 数字输入（DI）

```
 DI-0   DI-1   DI-2   DI-3   DI-4   DI-5   DI-6   DI-7   DI-8
  ○      ○      ○      ○      ○      ○      ○      ●      ○
```

> `●` = 闭合（DI-7 唯一闭合） `○` = 断开

### 4.7 无线网络

| 字段 | 值 |
|------|-----|
| SSID | （空） |
| RSSI | 0 |

### 4.8 原始 JSON

```json
{
  "ret_code": 0,
  "vehicle_id": "AMB-01",
  "current_ip": "172.22.159.18",
  "current_map": "jiaoda-1",
  "current_station": "CP1101",
  "task_status": 4,
  "total_time": 2658988275,
  "odo": 70627.422,
  "x": -13.4357,
  "y": -1.8362,
  "angle": -1.582,
  "confidence": 0.9734,
  "battery_level": 0.87,
  "charging": true,
  "blocked": false,
  "emergency": false,
  "driver_emc": false,
  "jack_enable": false,
  "jack_mode": false,
  "jack_isFull": false,
  "jack_state": 0,
  "jack_error_code": 0,
  "loadmap_status": 1,
  "reloc_status": 1,
  "errors": [],
  "warnings": [],
  "fatals": [],
  "notices": [],
  "ssid": "",
  "rssi": 0,
  "DI": [
    {"id": 0, "source": "normal", "status": false, "valid": true},
    {"id": 1, "source": "normal", "status": false, "valid": true},
    {"id": 2, "source": "normal", "status": false, "valid": true},
    {"id": 3, "source": "normal", "status": false, "valid": true},
    {"id": 4, "source": "normal", "status": false, "valid": true},
    {"id": 5, "source": "normal", "status": false, "valid": true},
    {"id": 6, "source": "normal", "status": false, "valid": true},
    {"id": 7, "source": "normal", "status": true,  "valid": true},
    {"id": 8, "source": "normal", "status": false, "valid": true}
  ],
  "create_on": "2026-07-21T17:10:35.816-1100",
  "robot_note": ""
}
```

---

## 五、Django 路由参考

网关主机 `192.168.1.100:1234` 已注册的 URL 前缀：

| 路径 | 用途 |
|------|------|
| `admin/` | Django 管理后台 |
| `agv/` | AGV 相关接口 |
| `camera/` | 摄像头相关 |
| `device/` | 设备相关 |

> ⚠️ 注意：文档中 `appagv/` 路径实际不存在，正确前缀为 `agv/`。

---

## 六、调用示例

### curl

```bash
curl "http://192.168.1.100:1234/agv/statusall?ip=172.22.159.18"
```

### PowerShell

```powershell
Invoke-RestMethod -Uri "http://192.168.1.100:1234/agv/statusall?ip=172.22.159.18"
```

### Python

```python
import requests
r = requests.get("http://192.168.1.100:1234/agv/statusall", params={"ip": "172.22.159.18"})
data = r.json()
```
