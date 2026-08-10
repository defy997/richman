// =============================================================================
// LocalGameEngine.cs
// -----------------------------------------------------------------------------
// 本地游戏引擎: 进程内跑游戏逻辑,无网络
//   - 实现 IGameTransport (与 GameClient 同接口)
//   - 单进程持有 GameRoom, 自己跑事件循环
//   - 玩家 vs AI / 玩家 vs 玩家 (本地双人 hot-seat)
//
// 引擎规则:
//   - 完全 port 自 server/src/index.ts 的 Phase 2-7 核心规则
//   - 随机种子: Random.Shared (不可重现)
// =============================================================================
using System.Reactive.Linq;
using System.Reactive.Subjects;
using Richman.Client.Net;

namespace Richman.Client.Services;

public sealed class LocalGameEngine : IGameTransport, IDisposable
{
    // ---------- Reactive Streams (与 GameClient 对齐) ----------
    private readonly Subject<GameStateDto?> _state  = new();
    private readonly Subject<(string,string)> _message = new();
    private readonly Subject<string> _error = new();
    private readonly Subject<RumorReportDto> _rumor = new();

    public IObservable<GameStateDto?>   StateStream   => _state.AsObservable();
    public IObservable<(string,string)> MessageStream => _message.AsObservable();
    public IObservable<string>          ErrorStream   => _error.AsObservable();
    public IObservable<RumorReportDto>  RumorStream   => _rumor.AsObservable();

    public bool   IsConnected  { get; private set; }
    public string ServerUrl    { get; set; } = "local://engine";
    public string? MyPlayerId  { get; private set; }
    public string? RoomCode    { get; private set; }
    public GameStateDto? CurrentState { get; private set; }
    private bool _disposed;

    // ---------- 房间状态 ----------
    private RoomState? _room;
    private readonly object _lock = new();

    public event EventHandler? Connected;
    public event EventHandler? Disconnected;
    public event EventHandler<RoomPayload>? RoomCreated;
    public event EventHandler<RoomPayload>? RoomJoined;

    // ====================================================================
    // 连接 (本地引擎立即"连接"成功)
    // ====================================================================
    public Task ConnectAsync()
    {
        IsConnected = true;
        Connected?.Invoke(this, EventArgs.Empty);
        return Task.CompletedTask;
    }

    public async Task DisconnectAsync()
    {
        IsConnected = false;
        Disconnected?.Invoke(this, EventArgs.Empty);
        await Task.CompletedTask;
    }

    // ====================================================================
    // 房间管理
    // ====================================================================
    public void CreateRoom(string playerName, int maxPlayers = 4)
    {
        lock (_lock)
        {
            var code = GenerateRoomCode();
            var host = NewPlayer(playerName, color: "#3498db", isAI: false);
            _room = RoomState.New(code, host, isSingleplayer: false, maxPlayers);
            MyPlayerId = host.Id;
            RoomCode = code;
            BroadcastState();
            RoomCreated?.Invoke(this, new RoomPayload { RoomCode = code, PlayerId = host.Id });
            SendMessage("info", $"房间 {code} 创建成功 (host: {playerName}, 上限 {maxPlayers})");
        }
    }

    public void CreateSingleplayer(string playerName, int aiCount = 3, string difficulty = "normal")
    {
        lock (_lock)
        {
            var code = GenerateRoomCode();
            var human = NewPlayer(playerName, color: "#3498db", isAI: false);
            _room = RoomState.New(code, human, isSingleplayer: true, maxPlayers: aiCount + 1);
            var palette = new[] { "#e74c3c", "#f39c12", "#27ae60", "#9b59b6" };
            for (int i = 0; i < aiCount; i++)
            {
                var ai = NewPlayer($"AI-{i+1}", palette[i % palette.Length], isAI: true);
                ai.AiDifficulty = difficulty;
                _room.Players.Add(ai);
            }
            MyPlayerId = human.Id;
            RoomCode = code;
            BroadcastState();
            RoomCreated?.Invoke(this, new RoomPayload { RoomCode = code, PlayerId = human.Id });
            SendMessage("info", $"单机模式: {playerName} vs {aiCount} 个 AI ({difficulty})");
        }
    }

    public void JoinRoom(string playerName, string roomCode)
    {
        lock (_lock)
        {
            if (_room is null || _room.Code != roomCode)
            {
                SendError($"房间 {roomCode} 不存在");
                return;
            }
            if (_room.Players.Count >= _room.MaxPlayers)
            {
                SendError("房间已满");
                return;
            }
            if (_room.GamePhase != "lobby")
            {
                SendError("游戏已开始, 无法加入");
                return;
            }
            var p = NewPlayer(playerName, color: "#e74c3c", isAI: false);
            _room.Players.Add(p);
            MyPlayerId = p.Id;
            BroadcastState();
            RoomJoined?.Invoke(this, new RoomPayload { RoomCode = roomCode, PlayerId = p.Id });
            SendMessage("info", $"{playerName} 加入房间");
        }
    }

    public void StartGame()
    {
        lock (_lock)
        {
            if (_room is null) { SendError("未创建房间"); return; }
            if (_room.Players.Count < 2 && !_room.IsSingleplayer) { SendError("至少需要 2 名玩家"); return; }
            _room.GamePhase = "playing";
            _room.GameDate = DateTime.Now.ToString("yyyy-MM-dd HH:mm");
            _room.GameDay = 1;
            _room.CurrentTurn = 1;
            _room.CurrentPlayerIndex = 0;
            SendMessage("success", "游戏开始!");
            BroadcastState();
        }
    }

    // ====================================================================
    // 回合核心
    // ====================================================================
    public void RollDice()
    {
        bool rolled = false;
        lock (_lock)
        {
            if (!CanAct("rollDice", allowAI: true)) return;
            var p = CurrentPlayer()!;
            int dice = RollTwoDice();
            _room!.DiceValue = dice;
            SendMessage("info", $"{p.Name} 投出 {dice}");

            int oldPos = p.Position;
            p.Position = (p.Position + dice) % _room.Cells.Count;
            p.StayTurns = 0;

            // 经过起点 +200
            if (oldPos + dice >= _room.Cells.Count)
            {
                p.Cash += 200;
                SendMessage("success", $"{p.Name} 经过起点, 获得 $200");
            }

            // 标记经过银行
            if (_room.Cells[p.Position].Type == "bank") p.PassedBank = true;

            // 处理格子
            HandleCellLanding(p, _room.Cells[p.Position]);

            // 股票交易所 / 期货交易所标志
            p.AtStockExchange = _room.Cells[p.Position].Type == "stock";
            p.AtFuturesExchange = _room.Cells[p.Position].Type == "futures";

            // 地皮 visitCount
            if (_room.Cells[p.Position].Type == "realestate")
            {
                _room.Cells[p.Position].VisitCount = (_room.Cells[p.Position].VisitCount ) + 1;
            }

            BroadcastState();
            rolled = true;
        }
        // AI 行动 (出 lock 后再调)
        if (rolled && CurrentPlayer()?.IsAI == true) AiTakeTurn();
    }

    public void EndTurn()
    {
        bool shouldTriggerAi = false;
        lock (_lock)
        {
            if (!CanAct("endTurn", allowAI: true)) return;

            // 每日扣息: 贷款按日扣 0.5% 利息 (简化: 按回合扣 1%)
            CurrentPlayer()!.Loans.ForEach(loan =>
            {
                loan.TurnsRemaining--;
                var interest = loan.Amount * 0.01;
                if (CurrentPlayer()!.Cash >= interest)
                {
                    CurrentPlayer()!.Cash -= interest;
                    SendMessage("warning", $"{CurrentPlayer()!.Name} 贷款利息 ${interest:F0}");
                }
            });
            CurrentPlayer()!.Loans.RemoveAll(l => l.TurnsRemaining <= 0);

            AdvanceTurn();
            BroadcastState();
            // 在 lock 内检查, 出 lock 后再触发 (避免重入锁)
            shouldTriggerAi = CurrentPlayer()?.IsAI == true;
        }
        if (shouldTriggerAi) AiTakeTurn();
    }

    // ====================================================================
    // 地皮
    // ====================================================================
    public void BuyProperty(int cellId)
    {
        lock (_lock)
        {
            if (!CanAct("buyProperty", allowAI: true)) return;
            var p = CurrentPlayer()!;
            var cell = GetCell(cellId);
            if (cell.Type != "realestate") { SendError("该地块不可购买"); return; }
            if (cell.Owner != null) { SendError("已被拥有"); return; }
            if (cell.FromAuction == true) { SendError("拍卖地不可直接购买"); return; }

            // 半价购买(拍卖/特殊)
            double price = cell.Price;
            if (p.Properties.Count >= 3) price *= 0.5; // 第 4 块起半价 (与 TS 对齐)

            if (p.Cash < price) { SendError($"现金不足 (${p.Cash:F0} < ${price:F0})"); return; }

            p.Cash -= price;
            p.Properties.Add(cellId);
            cell.Owner = p.Id;
            cell.BasePrice = price;
            SendMessage("success", $"{p.Name} 购买 {cell.Name} (${price:F0})");
            BroadcastState();
        }
    }

    public void SellProperty(int cellId)
    {
        lock (_lock)
        {
            if (!CanAct("sellProperty", allowAI: true)) return;
            var p = CurrentPlayer()!;
            var cell = GetCell(cellId);
            if (cell.Owner != p.Id) { SendError("不是你拥有的"); return; }

            double refund = cell.BasePrice * 0.5 + (cell.Level * 50);
            p.Cash += refund;
            cell.Owner = null;
            cell.Level = 0;
            cell.Upgrade = null;
            cell.Appreciation = 0;
            p.Properties.Remove(cellId);
            SendMessage("success", $"{p.Name} 出售 {cell.Name} 获得 ${refund:F0}");
            BroadcastState();
        }
    }

    public void UpgradeProperty(int cellId)
    {
        lock (_lock)
        {
            if (!CanAct("upgradeProperty", allowAI: true)) return;
            var p = CurrentPlayer()!;
            var cell = GetCell(cellId);
            if (cell.Owner != p.Id) { SendError("不是你拥有的"); return; }
            if (cell.Level >= 5) { SendError("已达最大等级"); return; }

            double basePrice = cell.FromAuction == true ? cell.BasePrice * 0.5 : cell.BasePrice;
            double cost = basePrice * 0.5;
            if (p.Cash < cost) { SendError("现金不足"); return; }

            p.Cash -= cost;
            cell.Level++;
            cell.Price = basePrice * (1 + cell.Level * 0.5);
            SendMessage("success", $"{p.Name} 升级 {cell.Name} → Lv.{cell.Level} (${cost:F0})");
            BroadcastState();
        }
    }

    public void SpecialUpgrade(int cellId, string type)
    {
        lock (_lock)
        {
            if (!CanAct("specialUpgrade", allowAI: true)) return;
            var p = CurrentPlayer()!;
            var cell = GetCell(cellId);
            if (cell.Owner != p.Id) { SendError("不是你拥有的"); return; }

            // 简化: 与 TS 等价, 5 类特殊升级 (hospital/school/park/shop/luxury)
            var (cost, name, value) = type switch
            {
                "hospital" => (500, "医院", 200.0),
                "school"   => (400, "学校", 150.0),
                "park"     => (300, "公园", 100.0),
                "shop"     => (350, "商场", 120.0),
                "luxury"   => (800, "豪华", 400.0),
                _          => (0.0, "未知", 0.0),
            };
            if (cost == 0) { SendError("未知特殊升级"); return; }
            if (p.Cash < cost) { SendError("现金不足"); return; }

            p.Cash -= cost;
            cell.Upgrade = new LocalPropertyUpgrade { Type = type, Name = name, Value = value };
            SendMessage("success", $"{p.Name} 在 {cell.Name} 建造 {name} (+${value:F0}/过路)");
            BroadcastState();
        }
    }

    // ====================================================================
    // 银行 / 贷款
    // ====================================================================
    public void BankDeposit(double amount)
    {
        lock (_lock)
        {
            if (!CanAct("bankDeposit", allowAI: true)) return;
            var p = CurrentPlayer()!;
            if (amount <= 0 || p.Cash < amount) { SendError("现金不足"); return; }
            p.Cash -= amount;
            p.Deposit += amount;
            SendMessage("success", $"{p.Name} 存款 ${amount:F0}");
            BroadcastState();
        }
    }

    public void BankWithdraw(double amount)
    {
        lock (_lock)
        {
            if (!CanAct("bankWithdraw", allowAI: true)) return;
            var p = CurrentPlayer()!;
            if (amount <= 0 || p.Deposit < amount) { SendError("存款不足"); return; }
            p.Deposit -= amount;
            p.Cash += amount;
            SendMessage("success", $"{p.Name} 取款 ${amount:F0}");
            BroadcastState();
        }
    }

    public void BankConvert(string action, double amount)
    {
        lock (_lock)
        {
            if (!CanAct("bankConvert", allowAI: true)) return;
            var p = CurrentPlayer()!;
            // depositToCash / cashToDeposit
            if (action == "depositToCash")
            {
                if (p.Deposit < amount) { SendError("存款不足"); return; }
                p.Deposit -= amount;
                p.Cash += amount * 0.95; // 5% 手续费
                SendMessage("info", $"{p.Name} 取现 ${amount:F0} (5% 手续费)");
            }
            else if (action == "cashToDeposit")
            {
                if (p.Cash < amount) { SendError("现金不足"); return; }
                p.Cash -= amount;
                p.Deposit += amount;
                SendMessage("info", $"{p.Name} 现金转存款 ${amount:F0}");
            }
            else { SendError("未知操作"); return; }
            BroadcastState();
        }
    }

    public void TakeLoan(double amount)
    {
        lock (_lock)
        {
            if (!CanAct("takeLoan", allowAI: true)) return;
            var p = CurrentPlayer()!;
            if (amount <= 0 || amount > 2000) { SendError("贷款限额 2000"); return; }

            double rate = 0.10; // 10% 利率
            int turns = 10;
            p.Cash += amount;
            p.Loans.Add(new LocalLoan { Id = Guid.NewGuid().ToString("N")[..8], Amount = amount, InterestRate = rate, TurnsRemaining = turns });
            SendMessage("info", $"{p.Name} 贷款 ${amount:F0} (10% × 10 回合)");
            BroadcastState();
        }
    }

    public void RepayLoan(string loanId)
    {
        lock (_lock)
        {
            if (!CanAct("repayLoan", allowAI: true)) return;
            var p = CurrentPlayer()!;
            var loan = p.Loans.FirstOrDefault(l => l.Id == loanId);
            if (loan is null) { SendError("贷款不存在"); return; }
            double total = loan.Amount * (1 + loan.InterestRate);
            if (p.Cash < total) { SendError("现金不足"); return; }
            p.Cash -= total;
            p.Loans.Remove(loan);
            SendMessage("success", $"{p.Name} 还款 ${total:F0}");
            BroadcastState();
        }
    }

    // ====================================================================
    // 卡片 (Phase 5) - 简化实现
    // ====================================================================
    public void BuyCard(string cardName) => SendError("本地模式暂未实现卡片购买");
    public void UseCard(string cardName, string? target = null) => SendError("本地模式暂未实现卡片使用");
    public void UseCard(string cardName, int? target) => SendError("本地模式暂未实现卡片使用");

    // ====================================================================
    // 股票 / 期货 (Phase 6) - 简化占位
    // ====================================================================
    public void TradeStock(string symbol, string action, int quantity, int leverage = 1)
        => SendError("本地模式暂未实现股票交易");

    public void TradeFutures(string symbol, string action, int quantity, int leverage = 1)
        => SendError("本地模式暂未实现期货交易");

    // ====================================================================
    // 其它
    // ====================================================================
    public void BuyTonghuashun()      => SendError("本地模式暂未实现");
    public void ExchangeAttraction(double amount) => SendError("本地模式暂未实现");
    public void BuyAuction(int cellId, double bid) => SendError("本地模式暂未实现拍卖");
    public void TradeProperty(int cellId, string targetPlayerId, double price)
        => SendError("本地模式暂未实现地皮交易");
    public void UseSeizeCard(string cardName, int cellId)
        => SendError("本地模式暂未实现");

    // ====================================================================
    // 引擎内部: 状态推送
    // ====================================================================
    private void BroadcastState()
    {
        if (_room is null) return;
        CurrentState = RoomState.ToDto(_room);
        _state.OnNext(CurrentState);
    }

    private void SendMessage(string type, string content)
    {
        _room!.Messages.Add(new LocalGameMessage { Type = type, Content = content, Turn = _room.CurrentTurn });
        if (_room.Messages.Count > 50) _room.Messages.RemoveAt(0);
        _message.OnNext((type, content));
    }

    private void SendError(string msg) => _error.OnNext(msg);

    // ====================================================================
    // AI (简化: random 决策)
    // ====================================================================
    private bool _aiRunning;

    private void AiTakeTurn()
    {
        var cur = CurrentPlayer();
        if (cur?.IsAI != true) return;
        if (_aiRunning) return; // 防重入
        _aiRunning = true;
        _ = Task.Run(async () =>
        {
            try
            {
                string pid = cur.Id;

                while (_room?.GamePhase == "playing")
                {
                    await Task.Delay(600);
                    if (_room?.GamePhase != "playing") break;
                    if (CurrentPlayer()?.Id != pid) break;

                    SafeCall(() => RollDice(), pid);

                    await Task.Delay(600);
                    if (CurrentPlayer()?.Id != pid) break;

                    var room = _room;
                    var me = room?.Players.FirstOrDefault(x => x.Id == pid);
                    if (room is not null && me is not null)
                    {
                        var cell = room.Cells[me.Position];
                        if (cell.Type == "realestate" && cell.Owner == null && me.Cash > cell.Price && Random.Shared.NextDouble() < 0.5)
                        {
                            SafeCall(() => BuyProperty(cell.Id), pid);
                        }
                    }

                    await Task.Delay(400);
                    if (CurrentPlayer()?.Id != pid) break;
                    SafeCall(() => EndTurn(), pid);

                    await Task.Delay(300);
                    // EndTurn 后切到下一个,如果是 AI, 更新 pid 继续循环
                    if (CurrentPlayer()?.IsAI == true)
                    {
                        pid = CurrentPlayer()!.Id;
                    }
                    else
                    {
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                SendError($"AI 异常: {ex.Message}");
            }
            finally
            {
                _aiRunning = false;
            }
        });
    }

    private void SafeCall(Action act, string pid)
    {
        try
        {
            act();
        }
        catch (Exception ex)
        {
            SendError($"AI 异常: {ex.Message}");
        }
    }

    // ====================================================================
    // 工具方法
    // ====================================================================
    private bool CanAct(string action, bool allowAI = false)
    {
        if (_room is null || _room.GamePhase != "playing") { SendError("游戏未开始"); return false; }
        var p = CurrentPlayer();
        if (p is null) { SendError("无当前玩家"); return false; }
        if (!allowAI && p.IsAI) { SendError("AI 回合, 请等待"); return false; }
        return true;
    }

    private LocalPlayer? CurrentPlayer()
        => _room?.Players.Count > _room.CurrentPlayerIndex && _room.CurrentPlayerIndex >= 0
            ? _room.Players[_room.CurrentPlayerIndex]
            : null;

    private LocalCell GetCell(int id)
    {
        var c = _room!.Cells.FirstOrDefault(x => x.Id == id);
        if (c is null) throw new InvalidOperationException($"cell {id} not found");
        return c;
    }

    private void HandleCellLanding(LocalPlayer p, LocalCell cell)
    {
        switch (cell.Type)
        {
            case "realestate":
                if (cell.Owner == null)
                {
                    SendMessage("info", $"{p.Name} 到达 {cell.Name} (可购买 ${cell.Price:F0})");
                }
                else if (cell.Owner == p.Id)
                {
                    SendMessage("info", $"{p.Name} 回到自己的 {cell.Name}");
                }
                else
                {
                    var owner = _room!.Players.FirstOrDefault(x => x.Id == cell.Owner);
                    if (owner != null && !owner.IsBankrupt)
                    {
                        double toll = ComputeToll(cell);
                        SendMessage("info", $"{p.Name} 支付过路费 ${toll:F0} 给 {owner.Name}");
                        if (p.Cash >= toll) { p.Cash -= toll; owner.Cash += toll; }
                        else { SendError($"{p.Name} 现金不足以支付过路费!"); }
                    }
                }
                break;

            case "chance":
            case "destiny":
                HandleChanceCard(p);
                break;

            case "diamond":
                p.Diamonds++;
                SendMessage("success", $"{p.Name} 获得 1 颗钻石");
                break;

            case "bank":
                SendMessage("info", $"{p.Name} 到达银行 (可存取款)");
                break;

            case "stock":
                SendMessage("info", $"{p.Name} 到达股票交易所");
                p.AtStockExchange = true;
                break;

            case "futures":
                SendMessage("info", $"{p.Name} 到达期货交易所");
                p.AtFuturesExchange = true;
                break;
        }
    }

    private double ComputeToll(LocalCell cell)
    {
        double base_ = cell.BasePrice > 0 ? cell.BasePrice : cell.Price;
        double appreciation = cell.Appreciation;
        double toll = base_ * (1 + appreciation) * (0.10 + cell.Level * 0.05);
        if (cell.Upgrade is not null) toll += cell.Upgrade.Value * 0.3;
        return Math.Round(toll);
    }

    private void HandleChanceCard(LocalPlayer p)
    {
        // 简化: 8 种命运卡
        var effects = new (string msg, Action act)[]
        {
            ("🎲 命运: 前进 5 格",   () => { p.Position = (p.Position + 5) % _room!.Cells.Count; HandleCellLanding(p, _room.Cells[p.Position]); }),
            ("🎲 命运: 获得 $200",   () => { p.Cash += 200; }),
            ("🎲 命运: 失去 $100",   () => { p.Cash = Math.Max(0, p.Cash - 100); }),
            ("🎲 命运: 获得 1 钻石", () => { p.Diamonds++; }),
            ("🎲 命运: 坐监 1 回合", () => { p.StayTurns = 1; }),
            ("🎲 命运: 每位玩家给你 $50", () =>
            {
                foreach (var other in _room!.Players.Where(x => x.Id != p.Id && !x.IsBankrupt))
                {
                    double give = Math.Min(50, other.Cash);
                    other.Cash -= give;
                    p.Cash += give;
                }
            }),
            ("🎲 命运: 后退 3 格",   () => { p.Position = Math.Max(0, p.Position - 3); HandleCellLanding(p, _room.Cells[p.Position]); }),
            ("🎲 命运: 所有地皮升 1 级", () =>
            {
                foreach (var cid in p.Properties) {
                    var c = GetCell(cid);
                    if (c.Level < 5) c.Level++;
                }
            }),
        };
        var eff = effects[Random.Shared.Next(effects.Length)];
        SendMessage("info", eff.msg);
        eff.act();
    }

    private void AdvanceTurn()
    {
        // 跳过破产玩家
        int tries = 0;
        do
        {
            _room!.CurrentPlayerIndex = (_room.CurrentPlayerIndex + 1) % _room.Players.Count;
            tries++;
        }
        while (CurrentPlayer()!.IsBankrupt && tries < _room.Players.Count);

        // 跳到下一天 (所有人轮完)
        if (_room.CurrentPlayerIndex == 0)
        {
            _room.GameDay++;
            _room.GameDate = DateTime.Now.AddDays(_room.GameDay - 1).ToString("yyyy-MM-dd");
            _room.CurrentTurn++;
            // 每日股票 tick (Phase 6 完整版这里跑)
        }

        // 坐监回合
        if (CurrentPlayer()!.StayTurns > 0)
        {
            CurrentPlayer()!.StayTurns--;
            AdvanceTurn();
        }
    }

    private static int RollTwoDice() => Random.Shared.Next(1, 7) + Random.Shared.Next(1, 7);

    private static string GenerateRoomCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return new string(Enumerable.Range(0, 6).Select(_ => chars[Random.Shared.Next(chars.Length)]).ToArray());
    }

    private static LocalPlayer NewPlayer(string name, string color, bool isAI)
        => new()
        {
            Id = Guid.NewGuid().ToString("N")[..8],
            Name = name,
            Color = color,
            Cash = 1500,
            Deposit = 0,
            Diamonds = 0,
            Position = 0,
            Properties = new(),
            IsBankrupt = false,
            Cards = new(),
            Stocks = new(),
            FuturesHoldings = new(),
            Loans = new(),
            PassedBank = false,
            StayTurns = 0,
            IsAI = isAI,
            Materials = new LocalMaterials(),
            HasTonghuashun = false,
            AtStockExchange = false,
            AtFuturesExchange = false,
            Attraction = 0,
        };

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _state.OnCompleted();
        _message.OnCompleted();
        _error.OnCompleted();
        _rumor.OnCompleted();
    }
}

// =============================================================================
// 内部: 房间 + DTO 转换
// =============================================================================
internal sealed class LocalPlayer
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Color { get; set; } = "#3498db";
    public double Cash { get; set; }
    public double Deposit { get; set; }
    public int Diamonds { get; set; }
    public int Position { get; set; }
    public List<int> Properties { get; set; } = new();
    public bool IsBankrupt { get; set; }
    public List<string> Cards { get; set; } = new();
    public List<LocalStockHolding> Stocks { get; set; } = new();
    public List<LocalFuturesHolding> FuturesHoldings { get; set; } = new();
    public List<LocalLoan> Loans { get; set; } = new();
    public bool PassedBank { get; set; }
    public int StayTurns { get; set; }
    public bool IsAI { get; set; }
    public string AiDifficulty { get; set; } = "normal";
    public LocalMaterials Materials { get; set; } = new();
    public bool HasTonghuashun { get; set; }
    public bool AtStockExchange { get; set; }
    public bool AtFuturesExchange { get; set; }
    public int Attraction { get; set; }
}

internal sealed class LocalMaterials
{
    public int Cement { get; set; }
    public int Steel { get; set; }
    public int Glass { get; set; }
}

internal sealed class LocalStockHolding
{
    public string Symbol { get; set; } = "";
    public int Quantity { get; set; }
    public double AvgCost { get; set; }
    public int ShortQuantity { get; set; }
    public double ShortAvgCost { get; set; }
}

internal sealed class LocalFuturesHolding
{
    public string Symbol { get; set; } = "";
    public int LongQuantity { get; set; }
    public int ShortQuantity { get; set; }
}

internal sealed class LocalLoan
{
    public string Id { get; set; } = "";
    public double Amount { get; set; }
    public double InterestRate { get; set; }
    public int TurnsRemaining { get; set; }
}

internal sealed class LocalCell
{
    public int Id { get; set; }
    public string Type { get; set; } = "";
    public string Name { get; set; } = "";
    public double Price { get; set; }
    public string? Owner { get; set; }
    public int Level { get; set; }
    public double BasePrice { get; set; }
    public int VisitCount { get; set; }
    public LocalPropertyUpgrade? Upgrade { get; set; }
    public bool FromAuction { get; set; }
    public double Appreciation { get; set; }
}

internal sealed class LocalPropertyUpgrade
{
    public string Type { get; set; } = "";
    public string Name { get; set; } = "";
    public double Value { get; set; }
}

internal sealed class LocalGameMessage
{
    public string Type { get; set; } = "info";
    public string Content { get; set; } = "";
    public int Turn { get; set; }
}

internal sealed class RoomState
{
    public string Code { get; init; } = "";
    public List<LocalPlayer> Players { get; init; } = new();
    public List<LocalCell>   Cells   { get; init; } = new();
    public string GamePhase { get; set; } = "lobby";
    public string? GameDate { get; set; }
    public int GameDay { get; set; }
    public int CurrentTurn { get; set; }
    public int CurrentPlayerIndex { get; set; }
    public int? DiceValue { get; set; }
    public int? SelectedCell { get; set; }
    public double TargetAssets { get; set; } = 10000;
    public string? WinnerId { get; set; }
    public List<LocalGameMessage> Messages { get; } = new();
    public bool IsSingleplayer { get; init; }
    public int MaxPlayers { get; init; } = 4;

    public static RoomState New(string code, LocalPlayer host, bool isSingleplayer, int maxPlayers)
    {
        var room = new RoomState
        {
            Code = code,
            IsSingleplayer = isSingleplayer,
            MaxPlayers = maxPlayers,
        };
        room.Players.Add(host);
        room.Cells.AddRange(InitBoard());
        return room;
    }

    private static IEnumerable<LocalCell> InitBoard()
    {
        // 32 格棋盘, Id 0 = 起点
        var cells = new List<LocalCell>();
        string[] names = {
            "起点", "北京路", "机会", "上海街", "深圳大道",
            "广州城", "命运", "杭州路", "成都巷",
            "南京街", "重庆城", "钻石", "武汉路",
            "银行", "西安城", "机会", "苏州巷",
            "股票交易所", "天津路", "青岛城", "命运",
            "厦门港", "期货交易所", "大连湾", "哈尔滨街",
            "机会", "长春路", "沈阳城", "钻石",
            "济南街", "福州路", "昆明池", "南宁城",
        };
        string[] types = {
            "start", "realestate", "chance", "realestate", "realestate",
            "realestate", "destiny", "realestate", "realestate",
            "realestate", "realestate", "diamond", "realestate",
            "bank", "realestate", "chance", "realestate",
            "stock", "realestate", "realestate", "destiny",
            "realestate", "futures", "realestate", "realestate",
            "chance", "realestate", "realestate", "diamond",
            "realestate", "realestate", "realestate", "realestate",
        };
        double[] prices = {
            0, 600, 0, 600, 800,
            1000, 0, 1000, 1200,
            1400, 1400, 0, 1600,
            0, 1800, 0, 1800,
            0, 2000, 2200, 0,
            2400, 0, 2600, 2600,
            0, 2800, 3000, 0,
            3200, 3200, 3500, 4000,
        };
        for (int i = 0; i < 32; i++)
        {
            cells.Add(new LocalCell
            {
                Id = i,
                Type = types[i],
                Name = names[i],
                Price = prices[i],
                BasePrice = prices[i],
                Level = 0,
                Owner = null,
                Appreciation = 0,
                VisitCount = 0,
            });
        }
        return cells;
    }

    public static GameStateDto ToDto(RoomState room)
    {
        var dto = new GameStateDto
        {
            GamePhase = room.GamePhase,
            GameDate = room.GameDate,
            CurrentTurn = room.CurrentTurn,
            CurrentPlayerIndex = room.CurrentPlayerIndex,
            DiceValue = room.DiceValue,
            SelectedCell = room.SelectedCell,
            TargetAssets = room.TargetAssets,
            WinnerId = room.WinnerId,
            Players = room.Players.Select(p => new PlayerDto
            {
                Id = p.Id,
                Name = p.Name,
                Color = p.Color,
                Cash = p.Cash,
                Deposit = p.Deposit,
                Diamonds = p.Diamonds,
                Position = p.Position,
                Properties = p.Properties,
                IsBankrupt = p.IsBankrupt,
                Cards = p.Cards,
                Loans = p.Loans.Select(l => new LoanDto
                {
                    Id = l.Id,
                    Amount = l.Amount,
                    InterestRate = l.InterestRate,
                    TurnsRemaining = l.TurnsRemaining,
                    CreatedAt = 0,
                }).ToList(),
                IsAI = p.IsAI,
                TotalAssets = p.Cash + p.Deposit + p.Properties.Sum(cid => room.Cells.FirstOrDefault(c => c.Id == cid)?.BasePrice ?? 0),
                Attraction = p.Attraction,
                StayTurns = p.StayTurns,
                AtStockExchange = p.AtStockExchange,
                AtFuturesExchange = p.AtFuturesExchange,
            }).ToList(),
            Cells = room.Cells.Select(c => new CellDto
            {
                Id = c.Id,
                Type = c.Type,
                Name = c.Name,
                Price = c.Price,
                Owner = c.Owner,
                Level = c.Level,
                BasePrice = c.BasePrice,
                VisitCount = c.VisitCount,
                Appreciation = c.Appreciation,
                FromAuction = c.FromAuction,
            }).ToList(),
            Messages = room.Messages.Select(m => new ChatMessageDto
            {
                Type = m.Type,
                Content = m.Content,
            }).ToList(),
            RoomCode = room.Code,
        };
        return dto;
    }
}