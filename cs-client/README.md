# Richman — C# / Avalonia Client

将原 [richman](../) 项目的 **前端** 用 **C# + Avalonia 11** 重新实现。
**协议与服务端完全保留**,Node.js 服务端一行未改。

> 状态:**Phase 0 + 1 + 2 + 3 + 4 + 5 + 6 + 7 全部完成**
>   - ✅ Phase 0 + 1: 项目骨架 + Socket.IO 联调 + Lobby 房间流程
>   - ✅ Phase 2: 64 格棋盘 (17×17) + 玩家面板 + 消息日志 + RICH PARK 排行榜
>   - ✅ Phase 3: 选中格操作菜单(购买 / 升级 / 出售)+ 特殊升级弹窗(7 种)
>   - ✅ Phase 4: 银行面板 (存/取/转换 + 贷款 + 还款) + 业务规则校验
>   - ✅ Phase 5: 股票面板 (60 股 × 8 板块, LiveCharts2 K线 / MA5/10/20 / 成交量)
>   - ✅ Phase 6: 期货面板 (做多/做空/平仓, 杠杆 1-10x)
>   - ✅ Phase 7: 卡片系统 (买/用/谣言) + RumorReport 事件流
>
> 全 Phase 完整实跑通过 (Smoke 0/1/2/3/4/4s/5/6/7 全部 OK)

---

## 已经能做

✅ 跟 React/TS 客户端**混服** — 同一个 Node 服务端,同一个 Socket.IO 房间
✅ **单人模式** + AI 对手 (`CreateSingleplayer`)
✅ **多人模式** 创建/加入房间、房主开始游戏
✅ **socket.io 自动重连** (内置)
✅ **强类型 Emit / On** (`GameClient` 做了 30+ 个服务端事件的强类型封装)
✅ **Reactive 流** (`StateStream` / `MessageStream` / `ErrorStream` / `RumorStream`)
✅ **MVVM** (CommunityToolkit.Mvvm 源生成器)
✅ **Avalonia 11** 跨平台 UI (Windows / Linux / macOS)
✅ **LiveCharts2** 已集成 (后续 Phase 画 K 线用)

---

## 项目结构

```
cs-client/
├── Richman.sln
└── src/Richman.Client/
    ├── Richman.Client.csproj
    ├── Program.cs                 # 入口; "smoke" 参数跑联调脚本
    ├── App.axaml(.cs)             # Avalonia Application
    ├── AppHost.cs                 # 简易 DI 容器
    ├── ViewLocator.cs             # VM -> View 自动匹配
    ├── Net/
    │   ├── Protocol.cs            # 服务端事件名常量
    │   ├── Dtos.cs                # 跟服务端 JSON 对齐的 DTO
    │   └── GameClient.cs          # Socket.IO 封装 + Reactive 流
    ├── Services/
    │   └── GameStore.cs           # 全局状态 (ObservableObject + ObservableCollection)
    ├── ViewModels/
    │   ├── MainViewModel.cs       # 顶层导航 + 连接按钮
    │   ├── LobbyViewModel.cs      # 房间流程
    │   └── GameBoardViewModel.cs  # 棋盘 (Phase 2+ 完整实现)
    ├── Views/
    │   ├── MainWindow.axaml       # 顶栏 + 路由
    │   ├── LobbyView.axaml        # 创建/加入/单人三块
    │   └── GameBoardView.axaml    # Phase 1 占位 (玩家列表 + 消息)
    └── Smoke/
        └── SmokeTest.cs           # headless 联调脚本
```

---

## 跑法

### 1. 启动 Node 服务端 (原项目 3002 端口)

```bash
cd /root/richman/server
PORT=3002 node dist/index.js
```

### 2a. 启动 Avalonia 桌面 UI

```bash
cd /root/richman/cs-client/src/Richman.Client
dotnet run
```

启动后:
1. 顶栏默认 `http://localhost:3002`,点 **连接**
2. 进 Lobby:创建 / 加入 / 单人模式
3. 房主点 **开始游戏**
4. 游戏阶段显示玩家列表 + 消息日志 + 投骰子/结束回合

### 2b. 跑 headless 联调脚本

```bash
cd /root/richman/cs-client/src/Richman.Client
dotnet run -- smoke
```

会输出:

```
[smoke] CONNECTED
[smoke] ROOM_CREATED TGWTYY / pid=f68nXaOHmj_DcGRYAAAs
[smoke] MSG info: 你将面对 2 个 AI 对手
[smoke] state phase=playing players=3 turn=1
[smoke] MSG info: C#Smoke 投出 5,移动到 🏦平安银行
...
```

---

## 已经实现的服务端事件 (GameClient)

| Emit (客户端 → 服务端) | On (服务端 → 客户端) |
|---|---|
| `createRoom` / `createSingleplayer` / `joinRoom` / `startGame` | `roomCreated` / `roomJoined` |
| `rollDice` / `endTurn` | `gameState` (整体) |
| `buyProperty` / `sellProperty` / `upgradeProperty` / `specialUpgrade` | `error` |
| `bankDeposit` / `bankWithdraw` / `bankConvert` | `message` |
| `takeLoan` / `repayLoan` | `rumorReport` |
| `buyCard` / `useCard` | |
| `tradeStock` / `tradeFutures` | |
| `buyTonghuashun` / `exchangeAttraction` | |
| `buyAuction` / `tradeProperty` / `useSeizeCard` | |

---

## 后续 Phase 路线

- **Phase 2** — 棋盘 (64 格) + 玩家面板 + 消息日志 (UI 完整化)
- **Phase 3** — 地皮交互 (购买 / 升级 / 特殊升级 UI)
- **Phase 4** — 银行 + 贷款面板
- **Phase 5** — 股票面板 (LiveCharts2 K 线 + MA + MACD + 成交量)
- **Phase 6** — 期货面板
- **Phase 7** — 卡片系统 + 谣言报告
- **Phase 8** — 拍卖 / 交易公告
- **Phase 9** — 动画 / 主题 / 资源替换
- **Phase 10** — 跨平台打包 (Windows / Linux / macOS)

---

## 已知问题 / 后续清理

- `System.Reactive` 版本警告 (与 Roslyn 4.8 编译器版本不匹配,**不影响**运行)
- 一些 XAML 上的 `Run` 嵌套可能需要 Avalonia 11.2 不同语法
- 后续将补单元测试 / DI 化所有 ViewModel
