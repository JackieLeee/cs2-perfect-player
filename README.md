# CS2 Perfect Player

纯浏览器 CS2 电竞生涯模拟：从现役/传奇职业选手身上抽取属性，组建完美选手，经历线上联赛 → 联赛季后赛 → Major 的单赛季征程。

## 本地运行

```bash
python3 -m http.server 8036
```

访问 <http://localhost:8036/>

## 玩法

1. 创建角色（姓名 + 头像）
2. 选择角色：IGL / AWP / Entry / Lurk / Support
3. 13 轮属性构建：随机年份 → 战队 → 选手 → 锁定 1 项属性
4. 选择战队，开始 2026 单赛季
5. 18 场线上联赛 BO1 → Top 8 联赛季后赛 BO3 → Major Swiss + 淘汰赛
6. 赛季奖项与成就结算

## 数据刷新（全自动爬取）

从 [BO3.gg](https://bo3.gg) API 拉取 **Valve World Ranking Top 50**（最多 60 支战队）的现役名单、近 6 个月统计，并映射为 13 项游戏属性。战队 Logo 会下载到 `assets/images/teams/`。

```bash
python3 -m pip install -r tools/requirements.txt
python3 tools/build_cs2_player_pool.py
```

**增量模式（默认）**：保留已有 16 队数据，只爬取新增战队。

```bash
# 只补爬新队（推荐，已有16队时）
python3 tools/build_cs2_player_pool.py

# 全量重爬 + 并行参数
python3 tools/build_cs2_player_pool.py --full --team-workers 8 --player-workers 20

# 自定义 Top N
python3 tools/build_cs2_player_pool.py --top 50 --max-teams 60
```

离线合成数据（无网络时使用）：

```bash
python3 tools/build_cs2_player_pool.py --offline
```

## 测试

```bash
node tests/cs2-perfect-player-smoke.js
```

## 技术栈

- 纯 HTML / CSS / JavaScript（无构建工具）
- localStorage 存档（`cs2PerfectPlayerSaveV1`）
- GitHub Pages 静态部署

## 说明

本项目为 fan project，选手数据与头像仅供娱乐模拟，与 HLTV / 战队官方无关联。
