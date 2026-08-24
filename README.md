# CS2 Perfect Player

纯浏览器 CS2 电竞生涯模拟：从现役职业选手身上抽取属性，组建完美选手，经历线上联赛 → 联赛季后赛 → Major 的单赛季征程。

## 本地运行

```bash
python3 -m http.server 8036
```

访问 <http://localhost:8036/>

## 玩法

1. 创建角色（姓名 + 头像）
2. 选择角色：IGL / AWP / Entry / Lurk / Support
3. 13 轮属性构建：随机战队 → 现役选手 → 锁定 1 项属性
4. 选择战队，开始 2026 单赛季
5. 18 场线上联赛 BO1 → Top 8 联赛季后赛 BO3 → Major Swiss + 淘汰赛
6. 赛季奖项与成就结算

## 数据刷新（HLTV）

默认从 [HLTV.org](https://www.hltv.org) 拉取 **Valve World Ranking Top 50**（最多 60 支战队）的现役名单与统计，经 [api.csapi.de](https://api.csapi.de) 代理访问。筛选条件与 HLTV 选手页一致：

- **matchType**: Big Events
- **时间窗口**: 近 12 个月
- **指标**: Rating 2.0、ADR、KAST 等

战队 Logo 会下载到 `assets/images/teams/`。

```bash
python3 -m pip install -r tools/requirements.txt
python3 tools/build_cs2_player_pool.py
```

**增量模式（默认）**：保留已有战队数据，只爬取新增战队。

```bash
# 只补爬新队（推荐）
python3 tools/build_cs2_player_pool.py

# 全量重爬（Big Events 统计变更后建议执行）
PYTHONUNBUFFERED=1 python3 tools/build_cs2_player_pool.py --full --max-teams 60 --team-workers 1

# 自定义 Top N
python3 tools/build_cs2_player_pool.py --top 50 --max-teams 60
```

**离线重算 OVR/属性**（不联网，基于已拉取的 `hltvRating` 与 `mapsPlayed`）：

```bash
python3 tools/recalibrate_pool.py
# 或
python3 tools/build_cs2_player_pool.py --recalibrate-only
```

离线合成数据（无网络时使用）：

```bash
python3 tools/build_cs2_player_pool.py --offline
```

### 校准说明

选手 OVR 由 `tools/hltv_calibration.py` 统一计算：

| 规则 | 说明 |
|------|------|
| OVR 公式 | `clamp(52 + effectiveRating × 26)`，顶尖选手约 88–90 |
| 样本收缩 | maps < 20 时，Rating 向队内可信中位数回归，避免 1–3 场小样本爆表 |
| 队内中位数 | 仅使用 maps ≥ 20 的队员计算，降低整体虚高 |

原始 HLTV Rating 保存在 `source.hltvRating`，校准后用于游戏的 Rating 在 `source.effectiveRating` 与 `rating` 字段。

## 测试

```bash
node tests/cs2-perfect-player-smoke.js
```

## 项目结构

```
assets/
  data/          # cs2-player-pool.json、cs2-teams.json
  js/            # 游戏逻辑
  images/        # 战队 Logo、选手头像
tools/
  fetch_hltv_data.py    # HLTV 数据拉取
  hltv_calibration.py   # Rating → OVR/属性校准
  recalibrate_pool.py   # 离线重算 pool
  build_cs2_player_pool.py  # CLI 入口
tests/
  cs2-perfect-player-smoke.js
```

## 技术栈

- 纯 HTML / CSS / JavaScript（无构建工具）
- localStorage 存档（`cs2PerfectPlayerSaveV1`）
- GitHub Pages 静态部署

## 说明

本项目为 fan project，选手数据与头像仅供娱乐模拟，与 HLTV / 战队官方无关联。
