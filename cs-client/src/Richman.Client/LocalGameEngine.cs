using Richman.Shared;

namespace Richman.Client;

public class LocalGameEngine
{
    public GameRoom? Room { get; private set; }
    public Player? HumanPlayer { get; private set; }
    public event Action<GameRoom>? OnStateChanged;
    public event Action<GameMessage>? OnMessage;

    private readonly Random _random = new();

    // AI state machine
    private enum AIActivity { None, Rolling, Moving, Deciding, EndingTurn }
    private AIActivity _aiActivity = AIActivity.None;
    private Player? _aiPlayer;

    public void OnAIDispatcherTick()
    {
        if (Room == null || Room.Phase != GamePhase.Playing) return;
        var current = Room.Players[Room.CurrentPlayerIndex];
        if (!current.IsAI) return;

        switch (_aiActivity)
        {
            case AIActivity.Rolling:
                _aiActivity = AIActivity.Moving;
                var dice = _random.Next(1, 7);
                Room.DiceValue = dice;
                AddMessage(MessageType.Info, $"【AI】{current.Name} 掷出了 {dice} 点");
                BroadcastState();
                break;

            case AIActivity.Moving:
                MovePlayer(current, Room.DiceValue ?? 3);
                _aiActivity = AIActivity.Deciding;
                ProcessAIDecisions(current);
                BroadcastState();
                break;

            case AIActivity.Deciding:
                _aiActivity = AIActivity.EndingTurn;
                EndTurn();
                break;
        }
    }

    public void TriggerAI() => OnAIDispatcherTick();

    public void StartSingleplayer(string playerName = "玩家", int aiCount = 3)
    {
        Room = new GameRoom
        {
            Code = GenerateRoomCode(),
            Mode = GameMode.Singleplayer,
            MaxPlayers = aiCount + 1,
            Phase = GamePhase.Lobby,
            CurrentTurn = 0,
            CurrentPlayerIndex = 0,
            TargetAssets = 100_000_000,
            Cells = GenerateCells(),
            Stocks = GenerateStocks(),
            Futures = GenerateFutures(),
            GameDate = "2026-01-01"
        };

        var colors = new[] { "#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22" };
        var aiNames = new[] { "陈总", "Lisa", "Mark" };

        HumanPlayer = new Player
        {
            Id = Guid.NewGuid().ToString(),
            Name = playerName,
            Color = colors[0],
            Cash = 50000,
            Deposit = 50000,
            Diamonds = 100,
            Position = 0,
            Materials = new Materials()
        };
        Room.Players.Add(HumanPlayer);

        for (int i = 0; i < aiCount; i++)
        {
            Room.Players.Add(new Player
            {
                Id = $"AI_{Guid.NewGuid():N}",
                Name = aiNames[i % aiNames.Length],
                IsAI = true,
                Color = colors[i + 1],
                Cash = 50000,
                Deposit = 50000,
                Diamonds = 100,
                Position = 0,
                Materials = new Materials(),
                AiDifficulty = "normal"
            });
        }

        BroadcastState();
        AddMessage(MessageType.Info, $"{playerName} 开始了单人游戏！");
        AddMessage(MessageType.Info, $"目标：积累 ${Room.TargetAssets:N0} 成为亿万富翁！");
    }

    public void StartGame()
    {
        if (Room == null) return;
        Room.Phase = GamePhase.Playing;
        Room.CurrentTurn = 1;
        AddMessage(MessageType.Info, $"===== 游戏开始！第 {Room.CurrentTurn} 天 =====");
        BroadcastState();
    }

    public void RollDice()
    {
        if (Room == null || HumanPlayer == null) return;

        var currentPlayer = Room.Players[Room.CurrentPlayerIndex];
        if (!currentPlayer.Id.Equals(HumanPlayer.Id, StringComparison.OrdinalIgnoreCase)) return;
        if (Room.DiceValue.HasValue) return;

        var dice = _random.Next(1, 7);
        if (Room.ForcedDice.HasValue)
        {
            dice = Room.ForcedDice.Value;
            Room.ForcedDice = null;
            AddMessage(MessageType.Info, $"骰子卡效果：强制投出 {dice} 点");
        }

        Room.DiceValue = dice;
        AddMessage(MessageType.Info, $"{currentPlayer.Name} 掷出了 {dice} 点！");
        BroadcastState();

        Task.Delay(500).ContinueWith(_ =>
        {
            try { MovePlayer(currentPlayer, dice); BroadcastState(); }
            catch (Exception ex) { AddMessage(MessageType.Error, $"移动异常: {ex.Message}"); }
        }, TaskScheduler.FromCurrentSynchronizationContext());
    }

    public void ProcessAITurn()
    {
        if (Room == null || Room.Phase != GamePhase.Playing) return;
        var currentPlayer = Room.Players[Room.CurrentPlayerIndex];
        if (!currentPlayer.IsAI) return;

        _aiActivity = AIActivity.Rolling;
        _aiPlayer = currentPlayer;

        var dice = _random.Next(1, 7);
        Room.DiceValue = dice;
        AddMessage(MessageType.Info, $"【AI】{currentPlayer.Name} 掷出了 {dice} 点");
        BroadcastState();
    }

    private void MovePlayer(Player player, int dice)
    {
        if (Room == null) return;

        var oldPos = player.Position;
        player.Position = (player.Position + dice) % 64;

        if (player.Position < oldPos)
        {
            player.Cash += 1000;
            player.PassedBank = true;
            AddMessage(MessageType.Info, $"{player.Name} 经过起点，获得 $1,000！");
        }

        if (player.Position == 3) player.PassedBank = true;

        var cell = Room.Cells[player.Position];
        AddMessage(MessageType.Info, $"{player.Name} 移动到 {cell.Name}");

        HandleCellEffect(player, cell);
        // 注意：BroadcastState 由调用方在 Task  continuation 中统一处理（避免 AI 场景 UI 线程死锁）
    }

    /// <summary>
    /// AI 决策阶段：处理股票买卖、期货交易等
    /// </summary>
    private void ProcessAIDecisions(Player ai)
    {
        if (Room == null || ai.IsBankrupt) return;

        // 股票决策
        if (ai.AtStockExchange && Room.Stocks.Count > 0)
        {
            // 优先检查持仓：亏损多的考虑平仓，盈利多的考虑止盈
            foreach (var holding in ai.Stocks.Where(h => h.Quantity > 0))
            {
                var stock = Room.Stocks.FirstOrDefault(s => s.Symbol == holding.Symbol);
                if (stock == null) continue;
                var pnl = stock.Price - holding.AvgCost;
                var pnlPct = holding.AvgCost > 0 ? pnl / holding.AvgCost * 100 : 0;

                // 盈利超过 10% 或亏损超过 15% → 平仓
                if (pnlPct > 10m || pnlPct < -15m)
                {
                    var action = pnl > 0 ? "止盈" : "止损";
                    ai.Cash += stock.Price * holding.Quantity;
                    AddMessage(MessageType.Info, $"【AI】{ai.Name} {action}平仓 {stock.Name} x{holding.Quantity}（{(pnl >= 0 ? "+" : "")}${pnl * holding.Quantity:N0}）");
                    holding.Quantity = 0;
                }
            }

            foreach (var shortHolding in ai.Stocks.Where(h => h.ShortQuantity > 0))
            {
                var stock = Room.Stocks.FirstOrDefault(s => s.Symbol == shortHolding.Symbol);
                if (stock == null) continue;
                var pnl = shortHolding.AvgCost - stock.Price;
                var pnlPct = shortHolding.AvgCost > 0 ? pnl / shortHolding.AvgCost * 100 : 0;

                if (pnlPct > 10m || pnlPct < -15m)
                {
                    var cost = stock.Price * shortHolding.ShortQuantity;
                    if (ai.Cash >= cost)
                    {
                        ai.Cash -= cost;
                        var action = pnl > 0 ? "止盈" : "止损";
                        AddMessage(MessageType.Info, $"【AI】{ai.Name} {action}平空 {stock.Name} x{shortHolding.ShortQuantity}（{(pnl >= 0 ? "+" : "")}${pnl * shortHolding.ShortQuantity:N0}）");
                        shortHolding.ShortQuantity = 0;
                    }
                }
            }

            // 有闲钱（> 5000）时，考虑开新仓
            var investableCash = ai.Cash - 5000m;
            if (investableCash > 2000m && _random.NextDouble() < 0.4)
            {
                // 找一只 AI 倾向看多的股票（change > 0 或有正面 card bias）
                var bullish = Room.Stocks
                    .Where(s => !ai.Stocks.Any(h => h.Symbol == s.Symbol && h.Quantity > 0)) // 还没持有
                    .Where(s => s.Change > 0 || (s.CardBias > 0 && s.CardBiasDays > 0))
                    .OrderByDescending(s => s.Change + s.CardBias * 5)
                    .FirstOrDefault();

                if (bullish != null)
                {
                    var maxQty = Math.Min((int)(investableCash / bullish.Price), 100);
                    if (maxQty > 0)
                    {
                        var qty = Math.Max(10, maxQty);
                        ai.Cash -= bullish.Price * qty;
                        var h = ai.Stocks.FirstOrDefault(s => s.Symbol == bullish.Symbol);
                        if (h == null)
                        {
                            h = new StockHolding { Symbol = bullish.Symbol };
                            ai.Stocks.Add(h);
                        }
                        h.Quantity += qty;
                        h.AvgCost = bullish.Price;
                        AddMessage(MessageType.Info, $"【AI】{ai.Name} 买入 {bullish.Name} x{qty} @ ${bullish.Price:N0}");
                    }
                }
            }
        }

        // 期货决策（仅在期货交易所）
        if (ai.AtFuturesExchange && Room.Futures.Count > 0)
        {
            var investableDeposit = ai.Deposit - 1000m;
            if (investableDeposit > 500m && _random.NextDouble() < 0.3)
            {
                var contract = Room.Futures
                    .OrderByDescending(f => f.Change)
                    .FirstOrDefault();

                if (contract != null)
                {
                    var margin = contract.Price / 3m; // 3x杠杆
                    if (investableDeposit >= margin)
                    {
                        var qty = Math.Min(5, (int)(investableDeposit / margin));
                        if (qty > 0)
                        {
                            var isLong = contract.Change >= 0 || _random.NextDouble() > 0.5;
                            ai.Deposit -= margin * qty;

                            var holding = ai.FuturesHoldings?.FirstOrDefault(h => h.Symbol == contract.Symbol);
                            if (holding == null)
                            {
                                holding = new FuturesHolding { Symbol = contract.Symbol };
                                ai.FuturesHoldings ??= new List<FuturesHolding>();
                                ai.FuturesHoldings.Add(holding);
                            }

                            if (isLong)
                            {
                                holding.LongQuantity += qty;
                                holding.LongAvgCost = contract.Price;
                                holding.LongLeverage = 3;
                                holding.LongFrozenCost += margin * qty;
                                AddMessage(MessageType.Info, $"【AI】{ai.Name} 做多 {contract.Name} x{qty} @ ${contract.Price:N0}（保证金 ${margin * qty:N0}）");
                            }
                            else
                            {
                                holding.ShortQuantity += qty;
                                holding.ShortAvgCost = contract.Price;
                                holding.ShortLeverage = 3;
                                holding.ShortInitialMargin += margin * qty;
                                AddMessage(MessageType.Info, $"【AI】{ai.Name} 做空 {contract.Name} x{qty} @ ${contract.Price:N0}（保证金 ${margin * qty:N0}）");
                            }
                        }
                    }
                }
            }
        }
    }

    private void HandleCellEffect(Player player, Cell cell)
    {
        if (Room == null) return;

        switch (cell.Type)
        {
            case CellType.Bank:
                player.PassedBank = true;
                AddMessage(MessageType.Info, $"{player.Name} 到达银行，可以存/取款、贷款");
                break;

            case CellType.Stock:
                player.AtStockExchange = true;
                AddMessage(MessageType.Info, $"{player.Name} 到达股票交易所！可以购买同花顺软件");
                break;

            case CellType.Futures:
                player.AtFuturesExchange = true;
                AddMessage(MessageType.Info, $"{player.Name} 到达期货市场！");
                break;

            case CellType.Market:
                player.AtMarket = true;
                AddMessage(MessageType.Info, $"{player.Name} 到达商品市场！可以购买建材和钻石");
                break;

            case CellType.RealEstate:
            case CellType.Empty:
                // 任何玩家停留在此地皮都重置"本次停留机会"——HasStopped=false 表示本次到达但还没买/升
                if (Room.CurrentPlayerIndex == Room.Players.IndexOf(player))
                {
                    cell.HasStopped = false;
                }
                if (cell.Owner == null)
                {
                    AddMessage(MessageType.Info, $"{cell.Name} 无主地皮，可以购买。");
                }
                else if (cell.Owner != player.Id)
                {
                    var owner = Room.Players.FirstOrDefault(p => p.Id == cell.Owner);
                    var baseToll = cell.BasePrice * (decimal)Math.Pow(2, cell.Level) * Room.InflationMultiplier;
                    // 顶级升级加成 + 房产中介加成
                    var upgradeMult = GetCellUpgradeTollMultiplier(cell);
                    var (brokerageMult, _) = GetBrokerageBonus(owner);
                    // 房主吸引力加成（每10点Attraction +10%过路费）
                    var attractionMult = 1m + (owner?.Attraction ?? 0) / 10m * 0.10m;
                    var toll = baseToll * upgradeMult * brokerageMult * attractionMult;
                    string tollMsg = $"{cell.Name} 属于 {owner?.Name}，需支付过路费 ${toll:N0}";
                    if (upgradeMult > 1m || brokerageMult > 1m || attractionMult > 1m)
                    {
                        tollMsg += $" (×{upgradeMult * brokerageMult * attractionMult:F2})";
                    }
                    AddMessage(MessageType.Info, tollMsg);
                    if (player.Cash >= toll)
                    {
                        player.Cash -= toll;
                        owner!.Cash += toll;
                        AddMessage(MessageType.Info, $"{player.Name} 支付了过路费给 {owner?.Name}");
                    }
                    else
                    {
                        AddMessage(MessageType.Warning, $"{player.Name} 现金不足以支付过路费！");
                    }
                }
                else
                {
                    AddMessage(MessageType.Info, $"这是你的地盘！");
                }
                break;

            case CellType.Chance:
                var chanceCards = new[] { "停留卡", "骰子卡", "护盾卡", "地皮升级卡", "占地卡" };
                var chance = chanceCards[_random.Next(chanceCards.Length)];
                player.Cards.Add(chance);
                AddMessage(MessageType.Info, $"🎁 机会卡：获得 {chance}！");
                // 随机事件
                var chanceEvents = new[] {
                    ("💰 路上捡到 $500!", 500m),
                    ("🎲 骰子运气好，获得 $1000!", 1000m),
                    ("📈 投资收益，获得 $800!", 800m),
                    ("🏠 房产增值，获得 $1200!", 1200m),
                    ("💎 钻石升值，获得 $500!", 500m)
                };
                var (msg, bonus) = chanceEvents[_random.Next(chanceEvents.Length)];
                player.Cash += bonus;
                AddMessage(MessageType.Info, msg);
                break;

            case CellType.Destiny:
                var destinyCards = new[] { "均贫卡", "红心卡", "黑心卡", "谣言卡" };
                var destiny = destinyCards[_random.Next(destinyCards.Length)];
                player.Cards.Add(destiny);
                AddMessage(MessageType.Info, $"🎯 命运卡：获得 {destiny}！");
                // 随机命运事件
                var destinyEvents = new[] {
                    ("🛒 购物消费，支出 $500!", -500m),
                    ("🏥 医疗费用，支出 $800!", -800m),
                    ("👨‍👩‍👧 家庭开支，支出 $600!", -600m),
                    ("💼 投资分红，获得 $1000!", 1000m),
                    ("🏆 比赛奖励，获得 $1500!", 1500m)
                };
                var (destMsg, destChange) = destinyEvents[_random.Next(destinyEvents.Length)];
                player.Cash += destChange;
                if (destChange < 0)
                    AddMessage(MessageType.Warning, destMsg);
                else
                    AddMessage(MessageType.Info, destMsg);
                break;

            case CellType.Diamond:
                var diamondReward = _random.Next(30, 101);
                player.Diamonds += diamondReward;
                AddMessage(MessageType.Info, $"💎 到达钻石矿！获得 {diamondReward} 颗钻石！");
                break;

            case CellType.Tax:
                var taxAmount = Math.Min(player.Cash, 1000);
                player.Cash -= taxAmount;
                AddMessage(MessageType.Warning, $"🏛️ 税务局：缴纳 {taxAmount} 税款！");
                break;

            case CellType.Jail:
            case CellType.GoToJail:
                player.StayTurns = 2;
                player.Position = 22; // 警察局位置
                AddMessage(MessageType.Warning, $"🚨 {cell.Name}！被关押2回合！");
                break;

            case CellType.Hospital:
                var hospitalCost = _random.Next(500, 2000);
                player.Cash -= hospitalCost;
                AddMessage(MessageType.Warning, $"🏥 医院治疗：花费 ${hospitalCost:N0}！");
                break;

            case CellType.Material:
                var cement = _random.Next(1, 5);
                var steel = _random.Next(1, 3);
                player.Materials.Cement += cement;
                player.Materials.Steel += steel;
                AddMessage(MessageType.Info, $"📦 建材市场：获得 水泥×{cement} 钢材×{steel}！");
                break;

            case CellType.Insurance:
                AddMessage(MessageType.Info, $"🛡️ 保险公司：可购买保险保护资产！");
                break;

            case CellType.Museum:
                AddMessage(MessageType.Info, $"🏛️ 博物馆：参观展览，增加魅力！");
                var attraction = _random.Next(1, 4);
                player.Attraction += attraction;
                AddMessage(MessageType.Info, $"✨ 获得 {attraction} 点吸引力！");
                break;

            case CellType.Park:
                AddMessage(MessageType.Info, $"🌳 公园：休息一下，恢复精神！");
                var restBonus = _random.Next(100, 500);
                player.Cash += restBonus;
                AddMessage(MessageType.Info, $"💰 公园维护奖励：+${restBonus:N0}！");
                break;

            case CellType.Start:
                AddMessage(MessageType.Info, $"{player.Name} 站在起点！");
                break;
        }
    }

    public bool BuyProperty(int cellId)
    {
        if (Room == null || HumanPlayer == null) { AddMessage(MessageType.Warning, "购买失败：游戏未就绪"); return false; }
        if (cellId < 0 || cellId >= Room.Cells.Count) { AddMessage(MessageType.Warning, $"购买失败：格子索引 {cellId} 无效"); return false; }

        var cell = Room.Cells[cellId];
        if (cell.Owner != null) { AddMessage(MessageType.Warning, $"购买失败：{cell.Name} 已有所有者"); return false; }
        if (cell.Type != CellType.RealEstate && cell.Type != CellType.Empty) { AddMessage(MessageType.Warning, $"购买失败：{cell.Name} 不是地皮"); return false; }
        // 必须站在该格子（终点）才能购买
        if (HumanPlayer.Position != cellId) { AddMessage(MessageType.Warning, $"购买失败：你站在 {Room.Cells[HumanPlayer.Position].Name}，需要走到 {cell.Name}"); return false; }
        // 必须本回合还没用过操作机会（HasStopped=false 表示可用）
        if (cell.HasStopped) { AddMessage(MessageType.Warning, $"购买失败：本次停留机会已用过（请用停留卡或下次掷骰子到达）"); return false; }

        var price = cell.Price * Room.InflationMultiplier;
        if (HumanPlayer.Cash < price)
        {
            AddMessage(MessageType.Warning, $"现金不足！需要 ${price:N0}，只有 ${HumanPlayer.Cash:N0}");
            return false;
        }

        HumanPlayer.Cash -= price;
        cell.Owner = HumanPlayer.Id;
        cell.BasePrice = price;
        HumanPlayer.Properties.Add(cellId);
        // 已用本次停留机会——本次停留不能再升
        cell.HasStopped = true;

        // 拥有第一个 Landmark 类地块时奖励吸引力
        if (cell.IntermediateTier == IntermediateTier.Landmark)
        {
            bool hasAnotherLandmark = Room.Cells.Any(c => c != cell && c.Owner == HumanPlayer.Id && c.IntermediateTier == IntermediateTier.Landmark);
            if (!hasAnotherLandmark)
            {
                HumanPlayer.Attraction += 5;
                AddMessage(MessageType.Success, $"✨ 拥有首块地标，吸引力 +5！");
            }
        }

        AddMessage(MessageType.Success, $"购买 {cell.Name} 成功！花费 ${price:N0}");
        BroadcastState();
        return true;
    }

    // 计算该地块基于顶级升级的过路费倍数
    private decimal GetCellUpgradeTollMultiplier(Cell cell)
    {
        return cell.Upgrade switch
        {
            PropertyUpgrade.Hotel => 2.5m,
            PropertyUpgrade.Smelter => 1.5m,
            PropertyUpgrade.DiamondMine => 2m,
            PropertyUpgrade.Agency => 2m,
            PropertyUpgrade.Resort => 2.2m,
            PropertyUpgrade.Mall => 2.2m,
            PropertyUpgrade.Monument => 3m,
            _ => 1m
        };
    }

    // 玩家拥有房产中介时：
    // - 所有地块过路费 +5% / 块
    // - 所有地块估价 +5% / 块（包括：卖给中心、银行、其他玩家时的估值）
    // 返回 (倍数, 房产中介数量)
    public (decimal Multiplier, int Count) GetBrokerageBonus(Player? player)
    {
        if (player == null || Room == null) return (1m, 0);
        var count = 0;
        foreach (var pid in player.Properties)
        {
            var c = Room.Cells[pid];
            if (c != null && c.Upgrade == PropertyUpgrade.Brokerage) count++;
        }
        return (1m + count * 0.05m, count);
    }

    public bool UpgradeProperty(int cellId)
    {
        if (Room == null || HumanPlayer == null) return false;
        if (cellId < 0 || cellId >= Room.Cells.Count) return false;

        var cell = Room.Cells[cellId];
        if (cell.Owner != HumanPlayer.Id) return false;
        if (cell.Level >= 5)
        {
            AddMessage(MessageType.Warning, "已达到最高等级！可使用建材进行顶级升级！");
            return false;
        }
        // 本回合停留过就可以升级（每次终点只能升1次）
        if (cell.HasStopped)
        {
            AddMessage(MessageType.Warning, "本次停留机会已用过，请用停留卡或下次掷骰子到达");
            return false;
        }
        if (HumanPlayer.Position != cellId) return false;

        // 升级费用 = 基价 * 2 * 通胀倍数（每次升级2倍成本）
        var cost = cell.BasePrice * 2 * (decimal)Math.Pow(2, cell.Level) * Room.InflationMultiplier;
        if (HumanPlayer.Cash < cost)
        {
            AddMessage(MessageType.Warning, $"现金不足！升级需要 ${cost:N0}");
            return false;
        }

        HumanPlayer.Cash -= cost;
        cell.Level++;

        var tierName = GetTierDisplayName(cell);
        AddMessage(MessageType.Success, $"{cell.Name} 升级到 Lv.{cell.Level} {tierName}！花费 ${cost:N0}");
        // 已用本次停留机会——本次停留不能再升
        cell.HasStopped = true;
        BroadcastState();
        return true;
    }

    /// <summary>使用升级卡强制升级（无视停留限制）</summary>
    public bool ForceUpgradeProperty(int cellId)
    {
        if (Room == null || HumanPlayer == null) return false;
        if (cellId < 0 || cellId >= Room.Cells.Count) return false;
        var cell = Room.Cells[cellId];
        if (cell.Owner != HumanPlayer.Id) return false;
        if (cell.Level >= 5) return false;

        var cost = cell.BasePrice * 2 * (decimal)Math.Pow(2, cell.Level) * Room.InflationMultiplier;
        if (HumanPlayer.Cash < cost)
        {
            AddMessage(MessageType.Warning, $"现金不足！升级需要 ${cost:N0}");
            return false;
        }
        HumanPlayer.Cash -= cost;
        cell.Level++;
        // 升级卡不消耗停留机会——本回合还能再买/升
        AddMessage(MessageType.Success, $"使用升级卡！{cell.Name} 升级到 Lv.{cell.Level}");
        BroadcastState();
        return true;
    }

    private static string GetTierDisplayName(Cell cell)
    {
        if (cell.Level == 0) return "";
        return cell.IntermediateTier switch
        {
            IntermediateTier.Residential => cell.Level switch
            {
                1 => "小区",
                2 => "社区",
                3 => "高级公寓",
                4 => "豪华公寓",
                5 => "🏨 五星酒店",
                _ => ""
            },
            IntermediateTier.Commercial => cell.Level switch
            {
                1 => "小卖部",
                2 => "便利店",
                3 => "商场",
                4 => "百货",
                5 => "🏙️ 科技园",
                _ => ""
            },
            IntermediateTier.Industrial => cell.Level switch
            {
                1 => "小作坊",
                2 => "工厂",
                3 => "工业园",
                4 => "产业园",
                5 => "🏭 冶炼厂",
                _ => ""
            },
            IntermediateTier.Office => cell.Level switch
            {
                1 => "办公室",
                2 => "写字楼",
                3 => "商务楼",
                4 => "企业总部",
                5 => "🏢 甲级写字楼",
                _ => ""
            },
            IntermediateTier.Landmark => cell.Level switch
            {
                1 => "地标",
                2 => "广场",
                3 => "观光塔",
                4 => "中央广场",
                5 => "🗽 历史纪念碑",
                _ => ""
            },
            _ => ""
        };
    }

    // ========== 顶级升级 ==========
    public bool CanTopLevelUpgrade(int cellId, PropertyUpgrade upgradeType)
    {
        if (Room == null || HumanPlayer == null) return false;
        if (cellId < 0 || cellId >= Room.Cells.Count) return false;

        var cell = Room.Cells[cellId];
        if (cell.Owner != HumanPlayer.Id) return false;
        if (cell.Level < 5) return false;
        if (cell.Upgrade != PropertyUpgrade.None) return false;
        if (PropertyUpgradeInfo.IsTopLevel(upgradeType) == false) return false;

        var materials = PropertyUpgradeInfo.GetMaterialCost(upgradeType);
        var m = HumanPlayer.Materials;

        if (m.Cement < materials[0] || m.Steel < materials[1] || m.Rubber < materials[2] ||
            m.PreciousMetals < materials[3] || m.Diamonds < materials[4])
        {
            return false;
        }

        return true;
    }

    public bool TopLevelUpgrade(int cellId, PropertyUpgrade upgradeType)
    {
        if (Room == null || HumanPlayer == null) return false;
        if (cellId < 0 || cellId >= Room.Cells.Count) return false;

        var cell = Room.Cells[cellId];
        if (cell.Owner != HumanPlayer.Id) return false;
        if (cell.Level < 5)
        {
            AddMessage(MessageType.Warning, "需要先升到Lv.5才能进行顶级升级！");
            return false;
        }
        if (cell.Upgrade != PropertyUpgrade.None)
        {
            AddMessage(MessageType.Warning, "该地块已是顶级升级状态！");
            return false;
        }
        if (PropertyUpgradeInfo.IsTopLevel(upgradeType) == false)
        {
            AddMessage(MessageType.Warning, "无效的顶级升级类型！");
            return false;
        }

        var materials = PropertyUpgradeInfo.GetMaterialCost(upgradeType);
        var m = HumanPlayer.Materials;

        if (m.Cement < materials[0] || m.Steel < materials[1] || m.Rubber < materials[2] ||
            m.PreciousMetals < materials[3] || m.Diamonds < materials[4])
        {
            AddMessage(MessageType.Warning, $"建材不足！需要：水泥{materials[0]} 钢材{materials[1]} 橡胶{materials[2]} 贵金属{materials[3]} 钻石{materials[4]}");
            return false;
        }

        // 消耗建材
        m.Cement -= materials[0];
        m.Steel -= materials[1];
        m.Rubber -= materials[2];
        m.PreciousMetals -= materials[3];
        m.Diamonds -= materials[4];

        // 记录建材消耗
        cell.CementUsed += materials[0];
        cell.SteelUsed += materials[1];
        cell.RubberUsed += materials[2];
        cell.PreciousMetalsUsed += materials[3];
        cell.DiamondsUsed += materials[4];

        cell.Upgrade = upgradeType;

        var upgradeName = PropertyUpgradeInfo.GetName(upgradeType);
        var (cashProd, diamondProd) = PropertyUpgradeInfo.GetProduction(upgradeType);

        AddMessage(MessageType.Success, $"🎉 {cell.Name} 升级为 {upgradeName}！");
        if (cashProd > 0 || diamondProd > 0)
        {
            AddMessage(MessageType.Info, $"每回合产出：${cashProd:N0}" + (diamondProd > 0 ? $" + {diamondProd}💎" : ""));
        }

        BroadcastState();
        return true;
    }

    public List<PropertyUpgrade> GetAvailableTopLevelUpgrades(int cellId)
    {
        if (Room == null || HumanPlayer == null) return new();
        if (cellId < 0 || cellId >= Room.Cells.Count) return new();

        var cell = Room.Cells[cellId];
        if (cell.Owner != HumanPlayer.Id) return new();
        if (cell.Level < 5 || cell.Upgrade != PropertyUpgrade.None) return new();

        var result = new List<PropertyUpgrade>();
        var m = HumanPlayer.Materials;

        foreach (PropertyUpgrade upgrade in Enum.GetValues<PropertyUpgrade>())
        {
            if (!PropertyUpgradeInfo.IsTopLevel(upgrade)) continue;

            var materials = PropertyUpgradeInfo.GetMaterialCost(upgrade);
            if (m.Cement >= materials[0] && m.Steel >= materials[1] && m.Rubber >= materials[2] &&
                m.PreciousMetals >= materials[3] && m.Diamonds >= materials[4])
            {
                result.Add(upgrade);
            }
        }

        return result;
    }

    // ========== 银行系统 ==========
    public bool BankDeposit(decimal amount)
    {
        if (Room == null || HumanPlayer == null || !HumanPlayer.PassedBank) return false;
        if (amount <= 0 || amount > HumanPlayer.Cash) return false;

        var fee = amount * 0.01m;
        HumanPlayer.Cash -= amount;
        HumanPlayer.Deposit += amount - fee;

        AddMessage(MessageType.Info, $"存款 ${amount:N0}（手续费 ${fee:N0}）成功！");
        BroadcastState();
        return true;
    }

    public bool BankWithdraw(decimal amount)
    {
        if (Room == null || HumanPlayer == null || !HumanPlayer.PassedBank) return false;
        if (amount <= 0 || amount > HumanPlayer.Deposit) return false;

        var fee = amount * 0.01m;
        HumanPlayer.Deposit -= amount;
        HumanPlayer.Cash += amount - fee;

        AddMessage(MessageType.Info, $"取款 ${amount:N0}（手续费 ${fee:N0}）成功！");
        BroadcastState();
        return true;
    }

    public bool TakeLoan(decimal amount)
    {
        if (Room == null || HumanPlayer == null || !HumanPlayer.PassedBank) return false;
        if (HumanPlayer.Properties.Count == 0)
        {
            AddMessage(MessageType.Warning, "需要拥有至少1块地皮才能贷款！");
            return false;
        }

        var propertyValue = HumanPlayer.Properties.Sum(p =>
        {
            var cell = Room.Cells[p];
            return cell?.BasePrice * (1 + (cell?.Level ?? 0) * 0.5m) ?? 0;
        });
        var maxLoan = propertyValue * 10;
        if (amount > maxLoan)
        {
            AddMessage(MessageType.Warning, $"贷款额度不足！最高可贷 ${maxLoan:N0}");
            return false;
        }

        var fee = amount * 0.02m;
        HumanPlayer.Cash += amount - fee;
        HumanPlayer.Loans.Add(new Loan
        {
            Id = Guid.NewGuid().ToString(),
            Amount = amount,
            InterestRate = 0.05m,
            TurnsRemaining = 30,
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });

        AddMessage(MessageType.Info, $"贷款 ${amount:N0}（手续费 ${fee:N0}）成功！30天后到期");
        BroadcastState();
        return true;
    }

    public bool RepayLoan(string loanId)
    {
        if (Room == null || HumanPlayer == null) return false;

        var loan = HumanPlayer.Loans.FirstOrDefault(l => l.Id == loanId);
        if (loan == null) return false;

        var totalDue = loan.Amount * (1 + loan.InterestRate);
        if (HumanPlayer.Cash < totalDue)
        {
            AddMessage(MessageType.Warning, $"资金不足！需还 ${totalDue:N0}");
            return false;
        }

        HumanPlayer.Cash -= totalDue;
        HumanPlayer.Loans.Remove(loan);

        AddMessage(MessageType.Info, $"还款 ${totalDue:N0} 成功！");
        BroadcastState();
        return true;
    }

    // ========== 市场系统 ==========
    public bool BuyFromMarket(MaterialKind kind, int quantity)
    {
        if (Room == null || HumanPlayer == null) return false;
        if (!HumanPlayer.AtMarket)
        {
            AddMessage(MessageType.Warning, "需要站在商品市场才能购买！");
            return false;
        }
        if (quantity <= 0) return false;

        var (price, name) = kind switch
        {
            MaterialKind.Cement => (Room.CementPrice, "水泥"),
            MaterialKind.Steel => (Room.SteelPrice, "钢材"),
            MaterialKind.Rubber => (Room.RubberPrice, "橡胶"),
            MaterialKind.PreciousMetals => (Room.PreciousMetalsPrice, "贵金属"),
            MaterialKind.Diamond => (Room.DiamondsPrice, "钻石"),
            _ => (0m, "未知")
        };

        if (price <= 0) return false;

        var totalCost = price * quantity;
        if (HumanPlayer.Cash < totalCost)
        {
            AddMessage(MessageType.Warning, $"现金不足！需要 ${totalCost:N0}");
            return false;
        }

        HumanPlayer.Cash -= totalCost;

        switch (kind)
        {
            case MaterialKind.Cement:
                HumanPlayer.Materials.Cement += quantity;
                break;
            case MaterialKind.Steel:
                HumanPlayer.Materials.Steel += quantity;
                break;
            case MaterialKind.Rubber:
                HumanPlayer.Materials.Rubber += quantity;
                break;
            case MaterialKind.PreciousMetals:
                HumanPlayer.Materials.PreciousMetals += quantity;
                break;
            case MaterialKind.Diamond:
                HumanPlayer.Diamonds += quantity;
                break;
        }

        AddMessage(MessageType.Success, $"购买{name} x{quantity}，花费 ${totalCost:N0}");
        BroadcastState();
        return true;
    }

    // ========== 期货系统 ==========
    public bool BuyFutures(string symbol, int quantity, int leverage = 1)
    {
        if (Room == null || HumanPlayer == null) return false;

        var contract = Room.Futures.FirstOrDefault(f => f.Symbol == symbol);
        if (contract == null) return false;
        if (quantity <= 0) return false;

        var totalCost = contract.Price * quantity;
        var margin = totalCost / leverage;

        // 站在期货交易所时，保证金要求减半（特权）
        if (HumanPlayer.AtFuturesExchange)
            margin = Math.Ceiling(margin / 2);

        // 保证金优先从存款扣（现金保留用于购买地皮）
        if (HumanPlayer.Deposit < margin)
        {
            AddMessage(MessageType.Warning, $"存款不足！需要 ${margin:N0}（{leverage}x杠杆），请先到银行存款");
            return false;
        }

        HumanPlayer.Deposit -= margin;

        var holding = HumanPlayer.FuturesHoldings?.FirstOrDefault(h => h.Symbol == symbol);
        if (holding == null)
        {
            holding = new FuturesHolding
            {
                Symbol = symbol,
                LongQuantity = quantity,
                LongAvgCost = contract.Price,
                LongLeverage = leverage,
                LongFrozenCost = margin
            };
            HumanPlayer.FuturesHoldings ??= new List<FuturesHolding>();
            HumanPlayer.FuturesHoldings.Add(holding);
        }
        else
        {
            var totalQty = holding.LongQuantity + quantity;
            holding.LongAvgCost = (holding.LongAvgCost * holding.LongQuantity + contract.Price * quantity) / totalQty;
            holding.LongQuantity = totalQty;
            holding.LongFrozenCost += margin;
        }

        var exchangeTag = HumanPlayer.AtFuturesExchange ? "（交易所内保证金减半）" : "";
        AddMessage(MessageType.Info, $"做多 {contract.Name} x{quantity} @ ${contract.Price:N0}（{leverage}x杠杆，保证金 ${margin:N0}）{exchangeTag}");
        BroadcastState();
        return true;
    }

    public bool ShortFutures(string symbol, int quantity, int leverage = 1)
    {
        if (Room == null || HumanPlayer == null) return false;

        var contract = Room.Futures.FirstOrDefault(f => f.Symbol == symbol);
        if (contract == null) return false;
        if (quantity <= 0) return false;

        var totalValue = contract.Price * quantity;
        var margin = totalValue / leverage;

        // 站在期货交易所时，保证金要求减半（特权）
        if (HumanPlayer.AtFuturesExchange)
            margin = Math.Ceiling(margin / 2);

        if (HumanPlayer.Deposit < margin)
        {
            AddMessage(MessageType.Warning, $"存款不足！需要 ${margin:N0}（{leverage}x杠杆），请先到银行存款");
            return false;
        }

        HumanPlayer.Deposit -= margin;

        var holding = HumanPlayer.FuturesHoldings?.FirstOrDefault(h => h.Symbol == symbol);
        if (holding == null)
        {
            holding = new FuturesHolding
            {
                Symbol = symbol,
                ShortQuantity = quantity,
                ShortAvgCost = contract.Price,
                ShortLeverage = leverage,
                ShortInitialMargin = margin
            };
            HumanPlayer.FuturesHoldings ??= new List<FuturesHolding>();
            HumanPlayer.FuturesHoldings.Add(holding);
        }
        else
        {
            var totalQty = holding.ShortQuantity + quantity;
            holding.ShortAvgCost = (holding.ShortAvgCost * holding.ShortQuantity + contract.Price * quantity) / totalQty;
            holding.ShortQuantity = totalQty;
            holding.ShortInitialMargin += margin;
        }

        var exchangeTag = HumanPlayer.AtFuturesExchange ? "（交易所内保证金减半）" : "";
        AddMessage(MessageType.Info, $"做空 {contract.Name} x{quantity} @ ${contract.Price:N0}（{leverage}x杠杆，保证金 ${margin:N0}）{exchangeTag}");
        BroadcastState();
        return true;
    }

    public bool CloseFutures(string symbol, int quantity, int isLong = 1)
    {
        if (Room == null || HumanPlayer == null) return false;

        var holding = HumanPlayer.FuturesHoldings?.FirstOrDefault(h => h.Symbol == symbol);
        if (holding == null) return false;

        var contract = Room.Futures.FirstOrDefault(f => f.Symbol == symbol);
        if (contract == null) return false;

        if (isLong > 0)
        {
            if (quantity > holding.LongQuantity) quantity = holding.LongQuantity;
            if (quantity <= 0) return false;

            // ✅ 杠杆化盈亏：2x杠杆下，盈利翻倍
            var pnl = (contract.Price - holding.LongAvgCost) * quantity * holding.LongLeverage;
            var marginReleased = holding.LongFrozenCost * quantity / holding.LongQuantity;

            // 释放保证金回 Deposit；盈亏入 Cash
            HumanPlayer.Deposit += marginReleased;
            HumanPlayer.Cash += pnl;
            holding.LongQuantity -= quantity;
            holding.LongFrozenCost -= marginReleased;

            AddMessage(MessageType.Info, $"平多 {contract.Name} x{quantity} @ ${contract.Price:N0}（{holding.LongLeverage}x杠杆，盈亏 {(pnl >= 0 ? "+" : "")}${pnl:N0}）");
        }
        else
        {
            if (quantity > holding.ShortQuantity) quantity = holding.ShortQuantity;
            if (quantity <= 0) return false;

            // ✅ 杠杆化盈亏
            var pnl = (holding.ShortAvgCost - contract.Price) * quantity * holding.ShortLeverage;
            var marginReleased = holding.ShortInitialMargin * quantity / holding.ShortQuantity;

            HumanPlayer.Deposit += marginReleased;
            HumanPlayer.Cash += pnl;
            holding.ShortQuantity -= quantity;
            holding.ShortInitialMargin -= marginReleased;

            AddMessage(MessageType.Info, $"平空 {contract.Name} x{quantity} @ ${contract.Price:N0}（{holding.ShortLeverage}x杠杆，盈亏 {(pnl >= 0 ? "+" : "")}${pnl:N0}）");
        }

        if (holding.LongQuantity == 0 && holding.ShortQuantity == 0)
        {
            HumanPlayer.FuturesHoldings?.Remove(holding);
        }

        BroadcastState();
        return true;
    }

    public bool DeliverFutures(string symbol, int quantity, bool isLong)
    {
        if (Room == null || HumanPlayer == null) return false;

        var contract = Room.Futures.FirstOrDefault(f => f.Symbol == symbol);
        if (contract == null || !contract.IsMaterial) return false;

        if (!Enum.TryParse<FuturesType>(contract.Type.ToString(), out var futuresType))
            return false;

        var holding = HumanPlayer.FuturesHoldings?.FirstOrDefault(h => h.Symbol == symbol);
        if (holding == null) return false;

        if (isLong)
        {
            if (quantity > holding.LongQuantity) quantity = holding.LongQuantity;
            if (quantity <= 0) return false;

            var totalCost = holding.LongAvgCost * quantity;
            if (HumanPlayer.Cash < totalCost)
            {
                AddMessage(MessageType.Warning, $"资金不足！需要支付 ${totalCost:N0}");
                return false;
            }

            HumanPlayer.Cash -= totalCost;
            var marginReleased = holding.LongFrozenCost * quantity / holding.LongQuantity;
            HumanPlayer.Cash += marginReleased;

            AddMaterials(futuresType, quantity);
            AddMessage(MessageType.Success, $"实物交割！获得 {GetMaterialName(futuresType)} x{quantity}（支付 ${totalCost:N0}）");

            holding.LongQuantity -= quantity;
            holding.LongFrozenCost -= marginReleased;

            if (holding.LongQuantity == 0 && holding.ShortQuantity == 0)
            {
                HumanPlayer.FuturesHoldings?.Remove(holding);
            }
        }
        else
        {
            if (quantity > holding.ShortQuantity) quantity = holding.ShortQuantity;
            if (quantity <= 0) return false;

            var marginReleased = holding.ShortInitialMargin * quantity / holding.ShortQuantity;

            if (HasMaterials(futuresType, quantity))
            {
                // 方案A：实物交割 - 交付实物，获得合约价值
                var totalValue = holding.ShortAvgCost * quantity;
                HumanPlayer.Cash += totalValue + marginReleased;
                RemoveMaterials(futuresType, quantity);
                AddMessage(MessageType.Success, $"实物交割！交付 {GetMaterialName(futuresType)} x{quantity}（获得 ${totalValue:N0} + ${marginReleased:N0}保证金）");
            }
            else
            {
                // 方案B：现金结算 - 退还释放的保证金 + 按当前市价结算做空盈亏
                HumanPlayer.Cash += marginReleased;

                if (contract.Price > holding.ShortAvgCost)
                {
                    // 价格上涨 → 做空亏损，需要从现金中扣除损失
                    var loss = (contract.Price - holding.ShortAvgCost) * quantity;
                    if (HumanPlayer.Cash < loss)
                    {
                        AddMessage(MessageType.Warning, $"现金不足！做空亏损需补 ${loss:N0}，当前现金 ${HumanPlayer.Cash:N0}");
                        return false;
                    }
                    HumanPlayer.Cash -= loss;
                    AddMessage(MessageType.Warning, $"现金结算！做空亏损 ${loss:N0}，释放保证金 ${marginReleased:N0}");
                }
                else if (contract.Price < holding.ShortAvgCost)
                {
                    // 价格下跌 → 做空盈利，加上利润
                    var profit = (holding.ShortAvgCost - contract.Price) * quantity;
                    HumanPlayer.Cash += profit;
                    AddMessage(MessageType.Success, $"现金结算！做空盈利 ${profit:N0}，释放保证金 ${marginReleased:N0}");
                }
                else
                {
                    // 价平
                    AddMessage(MessageType.Info, $"现金结算！价平，释放保证金 ${marginReleased:N0}");
                }
            }

            holding.ShortQuantity -= quantity;
            holding.ShortInitialMargin -= marginReleased;

            if (holding.LongQuantity == 0 && holding.ShortQuantity == 0)
            {
                HumanPlayer.FuturesHoldings?.Remove(holding);
            }
        }

        BroadcastState();
        return true;
    }

    // === 期货系统辅助 ===

    // 维持保证金率：账户净值必须 ≥ 名义面值 × 此比例
    private const decimal MaintenanceMarginRate = 0.25m;
    // 追缴宽限期（天）：触发追缴后多少天未补齐则强平
    private const int MarginCallGraceDays = 3;

    /// <summary>
    /// 每日合约期限递减 + 过期自动按市价平仓（建材多/空头除外，按交割逻辑）
    /// </summary>
    public void ProcessFuturesExpiry()
    {
        if (Room == null || HumanPlayer == null) return;
        if (HumanPlayer.FuturesHoldings == null || HumanPlayer.FuturesHoldings.Count == 0) return;

        var expiredSymbols = new List<string>();

        // 1) 递减每个合约的到期日
        foreach (var fut in Room.Futures)
        {
            if (fut.ExpiresInDays > 0) fut.ExpiresInDays--;
            if (fut.ExpiresInDays <= 0 && HumanPlayer.FuturesHoldings.Any(h => h.Symbol == fut.Symbol && (h.LongQuantity + h.ShortQuantity) > 0))
            {
                expiredSymbols.Add(fut.Symbol);
            }
        }

        if (expiredSymbols.Count == 0) return;

        // 2) 对每个过期合约，按市价自动平仓
        foreach (var symbol in expiredSymbols)
        {
            var holding = HumanPlayer.FuturesHoldings?.FirstOrDefault(h => h.Symbol == symbol);
            if (holding == null) continue;

            var contract = Room.Futures.FirstOrDefault(f => f.Symbol == symbol);
            if (contract == null) continue;

            // 多头到期：自动按市价平仓（建材→ 提示可交割但默认平仓）
            if (holding.LongQuantity > 0)
            {
                var qty = holding.LongQuantity;
                var pnl = (contract.Price - holding.LongAvgCost) * qty * holding.LongLeverage;
                var marginReleased = holding.LongFrozenCost;

                HumanPlayer.Deposit += marginReleased;
                HumanPlayer.Cash += pnl;
                AddMessage(MessageType.Warning,
                    $"⏰ {contract.Name} 多头合约到期，自动平仓 {qty} 手 @ ${contract.Price:N0}（{(pnl >= 0 ? "+" : "")}${pnl:N0}）");
                holding.LongQuantity = 0;
                holding.LongFrozenCost = 0;
            }

            // 空头到期：建材提示交付实物，否则按市价结算
            if (holding.ShortQuantity > 0)
            {
                var qty = holding.ShortQuantity;
                var pnl = (holding.ShortAvgCost - contract.Price) * qty * holding.ShortLeverage;
                var marginReleased = holding.ShortInitialMargin;

                HumanPlayer.Deposit += marginReleased;
                HumanPlayer.Cash += pnl;
                AddMessage(MessageType.Warning,
                    $"⏰ {contract.Name} 空头合约到期，自动结算 {qty} 手 @ ${contract.Price:N0}（{(pnl >= 0 ? "+" : "")}${pnl:N0}）");
                holding.ShortQuantity = 0;
                holding.ShortInitialMargin = 0;
            }

            if (holding.LongQuantity == 0 && holding.ShortQuantity == 0)
            {
                HumanPlayer.FuturesHoldings?.Remove(holding);
            }

            // 重置该合约期限（生成新一轮）
            contract.ExpiresInDays = new Random().Next(10, 61);
        }
    }

    /// <summary>
    /// 计算玩家当前期货账户的风险度与维持保证金要求
    /// </summary>
    private (decimal totalNotional, decimal totalEquity, decimal required) CalculateFuturesRisk(Player p)
    {
        if (Room == null || p.FuturesHoldings == null || p.FuturesHoldings.Count == 0)
            return (0, p.Cash + p.Deposit, 0);

        decimal totalNotional = 0;
        decimal totalEquity = p.Cash + p.Deposit;

        foreach (var holding in p.FuturesHoldings)
        {
            var contract = Room.Futures.FirstOrDefault(f => f.Symbol == holding.Symbol);
            if (contract == null) continue;

            // 多头：名义 = 当前价 × 数量 × 杠杆；未实现盈亏加到净值
            if (holding.LongQuantity > 0)
            {
                var notional = contract.Price * holding.LongQuantity * holding.LongLeverage;
                totalNotional += notional;
                totalEquity += (contract.Price - holding.LongAvgCost) * holding.LongQuantity * holding.LongLeverage;
            }

            // 空头：名义 = 当前价 × 数量 × 杠杆；未实现盈亏加到净值
            if (holding.ShortQuantity > 0)
            {
                var notional = contract.Price * holding.ShortQuantity * holding.ShortLeverage;
                totalNotional += notional;
                totalEquity += (holding.ShortAvgCost - contract.Price) * holding.ShortQuantity * holding.ShortLeverage;
            }
        }

        var required = totalNotional * MaintenanceMarginRate;
        return (totalNotional, totalEquity, required);
    }

    /// <summary>
    /// 每日检测追缴与强平：净值 < 维持保证金 → 追缴；追缴到期未补 → 强平
    /// </summary>
    public void CheckFuturesMarginCall()
    {
        if (Room == null) return;

        foreach (var p in Room.Players)
        {
            if (p.IsBankrupt) continue;
            if (p.FuturesHoldings == null || p.FuturesHoldings.Count == 0)
            {
                // 没有持仓 → 清空追缴状态
                if (p.MarginCallDeadline > 0)
                {
                    p.MarginCallDeadline = -1;
                    p.MarginCallRequired = 0;
                    p.MarginCallContracts?.Clear();
                }
                continue;
            }

            var (notional, equity, required) = CalculateFuturesRisk(p);

            // === 当前处于追缴状态 ===
            if (p.MarginCallDeadline > 0)
            {
                // 检查是否已补齐（净值 ≥ 名义 × 0.30，临时阈值）
                if (equity >= notional * 0.30m)
                {
                    p.MarginCallDeadline = -1;
                    p.MarginCallRequired = 0;
                    p.MarginCallContracts?.Clear();
                    AddMessage(MessageType.Success, $"{p.Name} 已补足保证金，追缴解除！");
                }
                else
                {
                    p.MarginCallDeadline--;
                    if (p.MarginCallDeadline <= 0)
                    {
                        // 强平所有持仓
                        ForceCloseAllFutures(p, "追缴逾期未补");
                    }
                    else
                    {
                        var gap = required - equity;
                        AddMessage(MessageType.Warning,
                            $"⚠️ {p.Name} 追缴中！还需补 ${gap:N0}（剩 {p.MarginCallDeadline} 天）");
                    }
                }
                continue;
            }

            // === 正常检测：净值 < 维持保证金 → 触发追缴 ===
            if (equity < required && notional > 0)
            {
                var gap = required - equity;
                p.MarginCallDeadline = MarginCallGraceDays;
                p.MarginCallRequired = gap;
                p.MarginCallContracts = p.FuturesHoldings
                    .Where(h => h.LongQuantity + h.ShortQuantity > 0)
                    .Select(h => h.Symbol)
                    .ToList();
                AddMessage(MessageType.Error,
                    $"🚨 {p.Name} 期货账户触发追缴！需补 ${gap:N0}，{MarginCallGraceDays} 天内未补齐将强平！");
            }
        }
    }

    /// <summary>
    /// 强平玩家所有期货持仓，按市价结算（扣未实现盈亏 + 释放保证金）
    /// </summary>
    private void ForceCloseAllFutures(Player p, string reason)
    {
        if (Room == null) return;
        if (p.FuturesHoldings == null) return;

        foreach (var holding in p.FuturesHoldings.ToList())
        {
            var contract = Room.Futures.FirstOrDefault(f => f.Symbol == holding.Symbol);
            if (contract == null) continue;

            if (holding.LongQuantity > 0)
            {
                var pnl = (contract.Price - holding.LongAvgCost) * holding.LongQuantity * holding.LongLeverage;
                p.Deposit += holding.LongFrozenCost;
                p.Cash += pnl;
                AddMessage(MessageType.Error,
                    $"💥 强平 {contract.Name} 多头 {holding.LongQuantity} 手 @ ${contract.Price:N0}（{reason}，盈亏 {(pnl >= 0 ? "+" : "")}${pnl:N0}）");
                holding.LongQuantity = 0;
                holding.LongFrozenCost = 0;
            }

            if (holding.ShortQuantity > 0)
            {
                var pnl = (holding.ShortAvgCost - contract.Price) * holding.ShortQuantity * holding.ShortLeverage;
                p.Deposit += holding.ShortInitialMargin;
                p.Cash += pnl;
                AddMessage(MessageType.Error,
                    $"💥 强平 {contract.Name} 空头 {holding.ShortQuantity} 手 @ ${contract.Price:N0}（{reason}，盈亏 {(pnl >= 0 ? "+" : "")}${pnl:N0}）");
                holding.ShortQuantity = 0;
                holding.ShortInitialMargin = 0;
            }

            if (holding.LongQuantity == 0 && holding.ShortQuantity == 0)
            {
                p.FuturesHoldings.Remove(holding);
            }
        }

        p.MarginCallDeadline = -1;
        p.MarginCallRequired = 0;
        p.MarginCallContracts?.Clear();
    }

    /// <summary>
    /// 玩家主动补缴保证金：把现金转入 Deposit 以提升净值
    /// </summary>
    public bool DepositToMargin(string playerName, decimal amount)
    {
        var p = Room?.Players.FirstOrDefault(x => x.Name == playerName);
        if (p == null) return false;
        if (p.MarginCallDeadline <= 0)
        {
            AddMessage(MessageType.Warning, $"{p.Name} 当前未处于追缴状态");
            return false;
        }
        if (amount <= 0 || amount > p.Cash)
        {
            AddMessage(MessageType.Warning, $"补缴金额无效（需要 > 0 且 ≤ 现金 ${p.Cash:N0}）");
            return false;
        }

        p.Cash -= amount;
        p.Deposit += amount;
        AddMessage(MessageType.Success, $"{p.Name} 补缴保证金 ${amount:N0}");
        return true;
    }

    private void AddMaterials(FuturesType type, int quantity)
    {
        var m = HumanPlayer!.Materials;
        switch (type)
        {
            case FuturesType.Cement: m.Cement += quantity; break;
            case FuturesType.Steel: m.Steel += quantity; break;
            case FuturesType.Rubber: m.Rubber += quantity; break;
            case FuturesType.Diamond: HumanPlayer.Diamonds += quantity; break;
            case FuturesType.Gold: m.PreciousMetals += quantity; break;
            case FuturesType.Silver: m.PreciousMetals += quantity; break;
        }
    }

    private bool HasMaterials(FuturesType type, int quantity)
    {
        var m = HumanPlayer!.Materials;
        return type switch
        {
            FuturesType.Cement => m.Cement >= quantity,
            FuturesType.Steel => m.Steel >= quantity,
            FuturesType.Rubber => m.Rubber >= quantity,
            FuturesType.Diamond => HumanPlayer.Diamonds >= quantity,
            FuturesType.Gold or FuturesType.Silver => m.PreciousMetals >= quantity,
            _ => false
        };
    }

    private void RemoveMaterials(FuturesType type, int quantity)
    {
        var m = HumanPlayer!.Materials;
        switch (type)
        {
            case FuturesType.Cement: m.Cement -= quantity; break;
            case FuturesType.Steel: m.Steel -= quantity; break;
            case FuturesType.Rubber: m.Rubber -= quantity; break;
            case FuturesType.Diamond: HumanPlayer.Diamonds -= quantity; break;
            case FuturesType.Gold or FuturesType.Silver: m.PreciousMetals -= quantity; break;
        }
    }

    private string GetMaterialName(FuturesType type) => type switch
    {
        FuturesType.Cement => "水泥",
        FuturesType.Steel => "钢材",
        FuturesType.Rubber => "橡胶",
        FuturesType.Diamond => "钻石",
        FuturesType.Gold => "贵金属",
        FuturesType.Silver => "贵金属",
        _ => "建材"
    };

    // ========== 股票系统 ==========
    public bool BuyStock(string symbol, int quantity, int leverage = 1)
    {
        if (Room == null || HumanPlayer == null) return false;
        // 股票交易本身无前置限制；查看利好/利空消息需到交易所或购买同花顺

        var stock = Room.Stocks.FirstOrDefault(s => s.Symbol == symbol);
        if (stock == null) return false;
        if (stock.LimitUp)
        {
            AddMessage(MessageType.Warning, $"{stock.Name} 涨停，无法买入！");
            return false;
        }

        var cost = stock.Price * quantity;
        var margin = cost / leverage;
        if (HumanPlayer.Deposit < margin)
        {
            AddMessage(MessageType.Warning, $"存款不足！需保证金 ${margin:N0}（{leverage}x杠杆），实际只需存款的 1/{leverage}");
            return false;
        }

        HumanPlayer.Deposit -= margin;

        var holding = HumanPlayer.Stocks.FirstOrDefault(s => s.Symbol == symbol);
        if (holding == null)
        {
            holding = new StockHolding { Symbol = symbol, AvgCost = stock.Price, Quantity = quantity, LongLeverage = leverage };
            HumanPlayer.Stocks.Add(holding);
        }
        else
        {
            var totalCost = holding.AvgCost * holding.Quantity + stock.Price * quantity;
            holding.Quantity += quantity;
            holding.AvgCost = totalCost / holding.Quantity;
        }

        AddMessage(MessageType.Info, $"买入 {stock.Name} x{quantity} @${stock.Price} ({leverage}x杠杆) 成功！冻结保证金 ${margin:N0}");
        BroadcastState();
        return true;
    }

    public bool SellStock(string symbol, int quantity)
    {
        if (Room == null || HumanPlayer == null) return false;

        var stock = Room.Stocks.FirstOrDefault(s => s.Symbol == symbol);
        if (stock == null) return false;
        if (stock.LimitDown) return false;

        var holding = HumanPlayer.Stocks.FirstOrDefault(s => s.Symbol == symbol);
        if (holding == null || holding.Quantity < quantity)
        {
            AddMessage(MessageType.Warning, "持仓不足！");
            return false;
        }

        var proceeds = stock.Price * quantity;
        var marginReturned = holding.AvgCost * quantity / holding.LongLeverage;
        // 保证金解冻：只还保证金（proceeds 已在买时通过减少存款冻结了"保证金"，不是额外现金）
        HumanPlayer.Deposit += marginReturned;
        holding.Quantity -= quantity;

        var pnl = (stock.Price - holding.AvgCost) * quantity * holding.LongLeverage;
        AddMessage(MessageType.Info, $"卖出 {stock.Name} x{quantity} @${stock.Price} ({holding.LongLeverage}x杠杆)！解冻保证金 ${marginReturned:N0}，盈亏 {(pnl >= 0 ? "+" : "")}${pnl:N0}");
        BroadcastState();
        return true;
    }

    public bool ShortStock(string symbol, int quantity, int leverage = 1)
    {
        if (Room == null || HumanPlayer == null) return false;
        // 股票交易本身无前置限制

        var stock = Room.Stocks.FirstOrDefault(s => s.Symbol == symbol);
        if (stock == null) return false;
        if (stock.LimitDown) return false;

        var margin = stock.Price * quantity / leverage;
        if (HumanPlayer.Deposit < margin)
        {
            AddMessage(MessageType.Warning, $"保证金不足！需 ${margin:N0}（{leverage}x杠杆），实际只需存款的 1/{leverage}");
            return false;
        }

        HumanPlayer.Deposit -= margin;
        var proceeds = stock.Price * quantity;
        HumanPlayer.Cash += proceeds;

        var holding = HumanPlayer.Stocks.FirstOrDefault(s => s.Symbol == symbol);
        if (holding == null)
        {
            holding = new StockHolding { Symbol = symbol, ShortAvgCost = stock.Price, ShortQuantity = quantity, ShortLeverage = leverage, ShortMarginFrozen = margin, ShortCashReceived = proceeds };
            HumanPlayer.Stocks.Add(holding);
        }
        else
        {
            // 按比例合并做空仓位
            var totalProceeds = holding.ShortCashReceived + proceeds;
            var totalQty = holding.ShortQuantity + quantity;
            holding.ShortAvgCost = (holding.ShortAvgCost * holding.ShortQuantity + stock.Price * quantity) / totalQty;
            holding.ShortQuantity = totalQty;
            holding.ShortMarginFrozen += margin;
            holding.ShortCashReceived = totalProceeds;
        }

        AddMessage(MessageType.Info, $"做空 {stock.Name} x{quantity} @${stock.Price} ({leverage}x杠杆)！获得现金 ${proceeds:N0}，冻结保证金 ${margin:N0}");
        BroadcastState();
        return true;
    }

    public bool CoverShort(string symbol, int quantity)
    {
        if (Room == null || HumanPlayer == null) return false;

        var stock = Room.Stocks.FirstOrDefault(s => s.Symbol == symbol);
        if (stock == null) return false;

        var holding = HumanPlayer.Stocks.FirstOrDefault(s => s.Symbol == symbol);
        if (holding == null || holding.ShortQuantity < quantity)
        {
            AddMessage(MessageType.Warning, "做空持仓不足！");
            return false;
        }

        var cost = stock.Price * quantity;
        if (HumanPlayer.Cash < cost)
        {
            AddMessage(MessageType.Warning, $"资金不足！需 ${cost:N0} 买回股票");
            return false;
        }

        HumanPlayer.Cash -= cost;
        // 返还保证金 = 该批做空冻结的保证金（全量返还，因为保证金 = 面值 / leverage）
        var marginReturned = stock.Price * quantity / holding.ShortLeverage;
        HumanPlayer.Deposit += marginReturned;
        holding.ShortQuantity -= quantity;
        holding.ShortMarginFrozen -= marginReturned;
        if (holding.ShortQuantity == 0)
            holding.ShortMarginFrozen = 0;
        holding.ShortCashReceived -= cost;

        var pnl = (holding.ShortAvgCost - stock.Price) * quantity * holding.ShortLeverage;
        AddMessage(MessageType.Info, $"平空 {stock.Name} x{quantity} @${stock.Price} ({holding.ShortLeverage}x杠杆)！解冻保证金 ${marginReturned:N0}，盈亏 {(pnl >= 0 ? "+" : "")}${pnl:N0}");
        BroadcastState();
        return true;
    }

    public bool BuyTonghuashun()
    {
        if (Room == null || HumanPlayer == null) return false;
        if (!HumanPlayer.AtStockExchange)
        {
            AddMessage(MessageType.Warning, "需要站在股票交易所才能购买同花顺！");
            return false;
        }
        if (HumanPlayer.HasTonghuashun)
        {
            AddMessage(MessageType.Info, "已拥有同花顺软件！");
            return false;
        }

        const decimal price = 20_000_000;
        if (HumanPlayer.Cash < price)
        {
            AddMessage(MessageType.Warning, $"资金不足！需要 ${price:N0}");
            return false;
        }

        HumanPlayer.Cash -= price;
        HumanPlayer.HasTonghuashun = true;

        AddMessage(MessageType.Success, "恭喜获得【同花顺软件】！可永久查看所有股票/期货消息！");
        BroadcastState();
        return true;
    }

    // ========== 卡片系统 ==========
    public bool BuyCard(string cardName)
    {
        if (Room == null || HumanPlayer == null) return false;

        var cardPrices = new Dictionary<string, decimal>
        {
            { "停留卡", 40 }, { "骰子卡", 30 }, { "均贫卡", 100 },
            { "红心卡", 60 }, { "黑心卡", 80 }, { "占地卡", 120 },
            { "地皮升级卡", 60 }, { "护盾卡", 100 }, { "谣言卡", 50 }
        };

        if (!cardPrices.TryGetValue(cardName, out var price))
        {
            AddMessage(MessageType.Warning, $"未知卡片：{cardName}");
            return false;
        }

        if (HumanPlayer.Diamonds < price)
        {
            AddMessage(MessageType.Warning, $"钻石不足！需要 💎{price}，只有 💎{HumanPlayer.Diamonds}");
            return false;
        }

        HumanPlayer.Diamonds -= (int)price;
        HumanPlayer.Cards.Add(cardName);

        AddMessage(MessageType.Info, $"购买 {cardName} 成功！花费 💎{price}");
        BroadcastState();
        return true;
    }

    public bool UseCard(string cardName, string? target = null)
    {
        if (Room == null || HumanPlayer == null) return false;
        if (!HumanPlayer.Cards.Contains(cardName))
        {
            AddMessage(MessageType.Warning, $"你没有 {cardName}！");
            return false;
        }

        // 骰子卡：必须在投递数字 1-6 后才使用
        if (cardName == "骰子卡" && (target == null || !int.TryParse(target, out var _dicePre) || _dicePre < 1 || _dicePre > 6))
        {
            AddMessage(MessageType.Warning, "骰子卡需要先选择 1-6 的点数！");
            return false;
        }

        HumanPlayer.Cards.Remove(cardName);

        switch (cardName)
        {
            case "停留卡":
                // 让自己在原地再获得一次买/升级机会（不投骰子）
                var cell = Room.Cells[HumanPlayer.Position];
                cell.HasStopped = false;
                AddMessage(MessageType.Info, $"使用了停留卡！在 {cell.Name} 再获得一次买/升级机会");
                BroadcastState();
                break;

            case "骰子卡":
                if (int.TryParse(target, out var dice) && dice >= 1 && dice <= 6)
                {
                    Room.ForcedDice = dice;
                    AddMessage(MessageType.Info, $"使用了骰子卡！下次强制投出 {dice} 点");
                }
                break;

            case "均贫卡":
                var avgCash = Room.Players.Where(p => !p.IsBankrupt).Average(p => p.Cash);
                foreach (var p in Room.Players.Where(p => !p.IsBankrupt))
                {
                    p.Cash = (decimal)avgCash;
                }
                AddMessage(MessageType.Info, $"使用了均贫卡！所有玩家现金取平均值 ${avgCash:N0}");
                break;

            case "红心卡":
                if (!string.IsNullOrEmpty(target))
                {
                    var stock = Room.Stocks.FirstOrDefault(s => s.Symbol.Equals(target, StringComparison.OrdinalIgnoreCase));
                    if (stock != null)
                    {
                        stock.CardBias = 0.25m;
                        stock.CardBiasDays = _random.Next(1, 6);
                        stock.CardBiasLastUsedTurn = Room.CurrentTurn;
                        AddMessage(MessageType.Success, $"使用了红心卡！{stock.Name} 散户看多倾向 +25%（持续{stock.CardBiasDays}天）");
                    }
                    else
                    {
                        AddMessage(MessageType.Warning, $"未找到股票 {target}！");
                    }
                }
                else
                {
                    // Fallback: 给所有人发钱
                    foreach (var p in Room.Players.Where(p => !p.IsBankrupt && p.Id != HumanPlayer.Id))
                    {
                        p.Cash += 2000;
                        AddMessage(MessageType.Info, $"【{p.Name}】收到爱心慰问金 +$2,000！");
                    }
                    AddMessage(MessageType.Success, $"使用了红心卡！除自己外所有人都收到 $2,000 爱心慰问！");
                }
                break;

            case "黑心卡":
                if (!string.IsNullOrEmpty(target))
                {
                    var stock = Room.Stocks.FirstOrDefault(s => s.Symbol.Equals(target, StringComparison.OrdinalIgnoreCase));
                    if (stock != null)
                    {
                        stock.CardBias = -0.30m;
                        stock.CardBiasDays = _random.Next(1, 6);
                        stock.CardBiasLastUsedTurn = Room.CurrentTurn;
                        AddMessage(MessageType.Warning, $"使用了黑心卡！{stock.Name} 散户看空倾向 +30%（持续{stock.CardBiasDays}天）");
                    }
                    else
                    {
                        AddMessage(MessageType.Warning, $"未找到股票 {target}！");
                    }
                }
                else
                {
                    // Fallback: 抢钱
                    foreach (var p in Room.Players.Where(p => !p.IsBankrupt && p.Id != HumanPlayer.Id))
                    {
                        var stolen = Math.Min(1000, p.Cash);
                        p.Cash -= stolen;
                        HumanPlayer.Cash += stolen;
                        AddMessage(MessageType.Warning, $"从【{p.Name}】抢走 ${stolen:N0}！");
                    }
                    AddMessage(MessageType.Warning, $"使用了黑心卡！从所有人（除自己）抢走 $1,000！");
                }
                break;

            case "地皮升级卡":
                var myProp = HumanPlayer.Properties.FirstOrDefault();
                if (myProp >= 0)
                {
                    Room.Cells[myProp].Level++;
                    AddMessage(MessageType.Info, $"使用了地皮升级卡！自动升级了一块地皮");
                }
                break;

            default:
                AddMessage(MessageType.Info, $"使用了 {cardName}！");
                break;
        }

        BroadcastState();
        return true;
    }

    // ========== 交易系统 ==========
    public bool TradeProperty(int cellId, string targetPlayerId, decimal price)
    {
        if (Room == null || HumanPlayer == null) return false;
        if (cellId < 0 || cellId >= Room.Cells.Count) return false;

        var cell = Room.Cells[cellId];
        if (cell.Owner != HumanPlayer.Id)
        {
            AddMessage(MessageType.Warning, "这不是你的地皮！");
            return false;
        }

        var target = Room.Players.FirstOrDefault(p => p.Id == targetPlayerId);
        if (target == null) return false;

        if (target.Cash < price)
        {
            AddMessage(MessageType.Warning, $"{target.Name} 资金不足！");
            return false;
        }

        target.Cash -= price;
        HumanPlayer.Cash += price;
        cell.Owner = targetPlayerId;
        HumanPlayer.Properties.Remove(cellId);
        target.Properties.Add(cellId);

        AddMessage(MessageType.Info, $"将 {cell.Name} 以 ${price:N0} 卖给了 {target.Name}！");
        BroadcastState();
        return true;
    }

    public bool SellPropertyToCenter(int cellId)
    {
        if (Room == null || HumanPlayer == null) return false;
        if (HumanPlayer.Position != 32)
        {
            AddMessage(MessageType.Warning, "需要站在房地产交易中心才能出售！");
            return false;
        }

        var cell = Room.Cells[cellId];
        if (cell.Owner != HumanPlayer.Id)
        {
            AddMessage(MessageType.Warning, "这不是你的地皮！");
            return false;
        }

        // 估值 = 基准价 × (1 + 等级×0.5) × 通胀 × 房产中介加成 × 拍卖来源修正
        var (brokerMult, _) = GetBrokerageBonus(HumanPlayer);
        var rate = cell.FromAuction ? 1.0m : 0.95m;
        var baseValue = cell.BasePrice * (1 + cell.Level * 0.5m) * Room.InflationMultiplier * brokerMult;
        var recovery = baseValue * rate;

        HumanPlayer.Cash += recovery;
        HumanPlayer.Properties.Remove(cellId);
        cell.Owner = null;
        cell.Level = 0;

        var msg = $"将 {cell.Name} 卖给了房地产交易中心，获得 ${recovery:N0}！";
        if (brokerMult > 1m) msg += $" (含房产中介 ×{brokerMult:F2})";
        AddMessage(MessageType.Info, msg);
        BroadcastState();
        return true;
    }

    // ========== 拍卖系统 ==========
    /// <summary>玩家对当前商业用地暗拍出价（在该回合内，每人只能出一次）</summary>
    public bool BidAuction(decimal bid)
    {
        if (Room == null || HumanPlayer == null) return false;
        if (Room.ActiveAuction == null || Room.ActiveAuction.Closed)
        {
            AddMessage(MessageType.Warning, "当前没有正在进行的拍卖！");
            return false;
        }
        if (bid < Room.ActiveAuction.ReservePrice)
        {
            AddMessage(MessageType.Warning, $"出价不能低于底价 ${Room.ActiveAuction.ReservePrice:N0}！");
            return false;
        }
        if (HumanPlayer.Cash < bid)
        {
            AddMessage(MessageType.Warning, $"现金不足！无法出价 ${bid:N0}");
            return false;
        }

        Room.AuctionBids[HumanPlayer.Id] = bid;
        AddMessage(MessageType.Info, $"{HumanPlayer.Name} 已在拍卖中出价 ${bid:N0}（隐藏出价中）");
        BroadcastState();
        return true;
    }

    /// <summary>结束当前拍卖回合，结算最高出价者</summary>
    public bool CloseAuction()
    {
        if (Room == null || Room.ActiveAuction == null || Room.ActiveAuction.Closed) return false;

        var auction = Room.ActiveAuction;
        auction.Closed = true;

        // 报告报价情况：谁参与 / 谁弃权
        var bidders = Room.AuctionBids.ToList();
        var participated = bidders.Count;
        var forfeited = Room.Players.Count(p => !p.IsBankrupt && !bidders.Any(b => b.Key == p.Id));

        if (participated > 0)
        {
            var bidSummary = string.Join("、",
                bidders.Select(b => $"{Room.Players.FirstOrDefault(p => p.Id == b.Key)?.Name ?? "?"} ${b.Value:N0}"));
            AddMessage(MessageType.Info, $"📋 报价汇总：{bidSummary}");
        }
        if (forfeited > 0)
        {
            var forfeitNames = string.Join("、",
                Room.Players.Where(p => !p.IsBankrupt && !bidders.Any(b => b.Key == p.Id))
                            .Select(p => p.Name));
            AddMessage(MessageType.Warning, $"❌ 弃权：{forfeitNames}（{forfeited}人未报价）");
        }

        // 找出最高出价
        var maxBid = Room.AuctionBids.Values.DefaultIfEmpty(0).Max();
        if (maxBid < auction.ReservePrice)
        {
            AddMessage(MessageType.Info, $"⏹️ 拍卖结束！最高出价 ${maxBid:N0} 低于底价 ${auction.ReservePrice:N0}，本轮流拍。");
        }
        else
        {
            var winnerId = Room.AuctionBids.FirstOrDefault(kv => kv.Value == maxBid).Key;
            var winner = Room.Players.FirstOrDefault(p => p.Id == winnerId);
            if (winner == null)
            {
                AddMessage(MessageType.Warning, "拍卖中标者已离开，本轮流拍！");
            }
            else
            {
                if (winner.Cash < maxBid)
                {
                    AddMessage(MessageType.Warning, $"⚠️ {winner.Name} 现金不足支付 ${maxBid:N0}，本轮流拍！");
                }
                else
                {
                    winner.Cash -= maxBid;
                    auction.WinnerId = winner.Id;
                    auction.FinalPrice = maxBid;
                    winner.Properties.Add(1000 + Room.AuctionedProperties.Count); // 商业用地位于虚拟id >=1000

                    AddMessage(MessageType.Success, $"🎉 拍卖结束！{winner.Name} 以 ${maxBid:N0} 拍得 {auction.Name}！");
                    AddMessage(MessageType.Info, $"💡 该商业用地可在任意时刻半价升级（也可在地皮界面或用升级卡）");
                }
            }
        }

        Room.AuctionedProperties.Add(auction);
        Room.ActiveAuction = null;
        Room.AuctionBids.Clear();
        BroadcastState();
        return true;
    }

    /// <summary>升级已拍下的商业用地（半价，可随时升级）</summary>
    public bool UpgradeCommercialProperty(string commercialId)
    {
        if (Room == null || HumanPlayer == null) return false;
        var prop = Room.AuctionedProperties.FirstOrDefault(p => p.Id == commercialId);
        if (prop == null) return false;
        if (prop.WinnerId != HumanPlayer.Id) return false;
        if (prop.Level >= 5) return false;

        var cost = (prop.ReservePrice * (decimal)Math.Pow(2, prop.Level) * 0.5m) * Room.InflationMultiplier;
        if (HumanPlayer.Cash < cost)
        {
            AddMessage(MessageType.Warning, $"现金不足！升级商业用地需要 ${cost:N0}");
            return false;
        }
        HumanPlayer.Cash -= cost;
        prop.Level++;
        AddMessage(MessageType.Success, $"{prop.Name} 升级到 Lv.{prop.Level}，花费 ${cost:N0}");
        BroadcastState();
        return true;
    }

    // ========== 回合结束 ==========
    public void EndTurn()
    {
        if (Room == null) return;

        Room.DiceValue = null;

        // 重置本回合的"是否在交易所/市场"标志位（玩家下次需要重新走到对应地块）
        foreach (var player in Room.Players)
        {
            if (player.IsBankrupt) continue;
            player.AtStockExchange = false;
            player.AtFuturesExchange = false;
            player.AtMarket = false;
            player.PassedBank = false;
        }

        // 处理每回合顶级升级产出
        foreach (var player in Room.Players)
        {
            if (player.IsBankrupt) continue;

            decimal totalIncome = 0;
            int totalDiamonds = 0;

            foreach (var cellId in player.Properties)
            {
                var cell = Room.Cells[cellId];
                if (cell.Upgrade != PropertyUpgrade.None)
                {
                    var (cash, diamonds) = PropertyUpgradeInfo.GetProduction(cell.Upgrade);
                    if (cash > 0)
                    {
                        totalIncome += cash;
                    }
                    if (diamonds > 0)
                    {
                        totalDiamonds += diamonds;
                    }
                }
            }

            if (totalIncome > 0)
            {
                player.Cash += totalIncome;
                AddMessage(MessageType.Info, $"{player.Name} 的顶级产业产出 +${totalIncome:N0}");
            }
            if (totalDiamonds > 0)
            {
                player.Diamonds += totalDiamonds;
                AddMessage(MessageType.Info, $"{player.Name} 的顶级产业产出 +{totalDiamonds}💎");
            }

            // 吸引力被动收入：每回合 Attraction×等级×10 现金（Landmark类翻倍）
            if (player.Attraction > 0)
            {
                decimal attractionIncome = 0;
                int landmarkCount = 0;
                foreach (var pid in player.Properties)
                {
                    var c = Room.Cells[pid];
                    if (c.IntermediateTier == IntermediateTier.Landmark)
                    {
                        landmarkCount++;
                        attractionIncome += player.Attraction * c.Level * 10m;
                    }
                }
                // 普通地块收益 (无Landmark时仍可有少量)
                if (attractionIncome == 0 && player.Properties.Count > 0)
                {
                    attractionIncome = player.Attraction * 5m;  // 基础
                }
                if (attractionIncome > 0)
                {
                    player.Cash += attractionIncome;
                    AddMessage(MessageType.Success, $"✨ {player.Name} 的吸引力 (Attraction={player.Attraction}) 带来 +${attractionIncome:N0} 观光收入！");
                }
            }
        }

        // 处理贷款到期
        foreach (var player in Room.Players)
        {
            foreach (var loan in player.Loans.ToList())
            {
                loan.TurnsRemaining--;
                if (loan.TurnsRemaining <= 0)
                {
                    var totalDue = loan.Amount * (1 + loan.InterestRate);
                    player.Cash -= totalDue;
                    player.Loans.Remove(loan);
                    AddMessage(MessageType.Warning, $"{player.Name} 的贷款 ${loan.Amount:N0} 到期，已自动还款 ${totalDue:N0}！");
                }
            }
        }

        // 检查破产
        foreach (var player in Room.Players)
        {
            if (player.Cash < 0 && player.Deposit <= 0 && player.Properties.Count == 0)
            {
                player.IsBankrupt = true;
                AddMessage(MessageType.Error, $"{player.Name} 破产了！");
            }
        }

        // 计算资产
        CalculateAssets();

        // 检查胜利条件
        if (Room.Mode == GameMode.Singleplayer && HumanPlayer != null)
        {
            if (HumanPlayer.TotalAssets >= Room.TargetAssets)
            {
                Room.Phase = GamePhase.Ended;
                Room.WinnerId = HumanPlayer.Id;
                AddMessage(MessageType.Success, $"🎉 恭喜！{HumanPlayer.Name} 达成亿万富翁！");
                BroadcastState();
                return;
            }
        }

        // 下一个玩家
        var nextIndex = (Room.CurrentPlayerIndex + 1) % Room.Players.Count;
        var attempts = 0;

        while (Room.Players[nextIndex].IsBankrupt && attempts < Room.Players.Count)
        {
            nextIndex = (nextIndex + 1) % Room.Players.Count;
            attempts++;
        }

        Room.CurrentPlayerIndex = nextIndex;

        if (Room.CurrentPlayerIndex == 0)
        {
            Room.CurrentTurn++;
            var prevDate = DateTime.Parse(Room.GameDate);
            Room.GameDate = prevDate.AddDays(1).ToString("yyyy-MM-dd");

            // 每月第一天更新通胀（每30天）
            // === 每日通胀推进 + 动态通胀率 ===
            // 通胀率受宏观经济因子 MacroInflation 影响（范围 -1~+1）
            // 基准月通胀率 2%，宏观因子影响 ±6%（即月度通胀约 -4% ~ +8%）
            var monthlyRate = 0.02m + Room.MacroInflation * 0.06m;
            Room.InflationRate = Math.Clamp(monthlyRate, -0.05m, 0.15m);

            // 按日复利推进通胀倍数（等效月度利率）
            // 例：月通胀 6% → 日因子 (1.06)^(1/30) ≈ 1.00193（约 0.193%/日）
            Room.InflationMultiplier *= (decimal)Math.Pow((double)(1m + Room.InflationRate), 1.0 / 30.0);

            // 每月第一天（30 天的整数倍）报告 + 月份递增
            if (Room.CurrentTurn > 1 && (Room.CurrentTurn - 1) % 30 == 0)
            {
                Room.CurrentMonth++;
                var pct = Room.InflationRate * 100m;
                var icon = pct >= 0 ? "📈" : "📉";
                AddMessage(MessageType.Warning,
                    $"{icon} 第{Room.CurrentMonth}月通胀率 {pct:F1}%（物价累计 {Room.InflationMultiplier:F3}x）");
            }

            // 每日股票/期货更新（含 ApplyMacro 每日波动）
            UpdateMarket();

            // === 期货到期检查 + 自动结算 ===
            ProcessFuturesExpiry();

            // === 期货账户追缴/强平检查 ===
            CheckFuturesMarginCall();

            // 记录市场价格历史
            Room.MarketPriceHistory.Add(new MarketPriceTick
            {
                Day = Room.CurrentTurn,
                CementPrice = Room.CementPrice,
                SteelPrice = Room.SteelPrice,
                RubberPrice = Room.RubberPrice,
                PreciousMetalsPrice = Room.PreciousMetalsPrice,
                DiamondsPrice = Room.DiamondsPrice
            });
            if (Room.MarketPriceHistory.Count > 60)
                Room.MarketPriceHistory.RemoveAt(0);

            // 拍卖逻辑：每 7 天开启一次商业用地拍卖
            // 新拍卖启动时，立即结算上一拍卖（按"当天结束结算"语义）
            if (Room.CurrentTurn % 7 == 0)
            {
                if (Room.ActiveAuction != null && !Room.ActiveAuction.Closed)
                {
                    CloseAuction();
                }
                StartAuction();
            }
            // 拍卖如果在当天结束都未结算，下个新玩家回合自动结算
            else if (Room.ActiveAuction != null && !Room.ActiveAuction.Closed &&
                     Room.CurrentTurn > Room.ActiveAuction.ClosesOnDay)
            {
                CloseAuction();
            }

            AddMessage(MessageType.Info, $"===== 第 {Room.CurrentTurn} 天 =====");
        }

        var currentPlayer = Room.Players[Room.CurrentPlayerIndex];
        AddMessage(MessageType.Info, $"{currentPlayer.Name} 的回合");

        BroadcastState();

        if (currentPlayer.IsAI)
        {
            _aiActivity = AIActivity.Rolling;
        }
    }

    private void CalculateAssets()
    {
        if (Room == null) return;

        foreach (var player in Room.Players)
        {
            decimal assets = player.Cash + player.Deposit;

            // 商品价值 = 建材 × 当前市价 + 钻石 × 当前市价
            if (player.Materials != null)
            {
                assets += player.Materials.Cement * Room.CementPrice
                       + player.Materials.Steel * Room.SteelPrice
                       + player.Materials.Rubber * Room.RubberPrice
                       + player.Materials.PreciousMetals * Room.PreciousMetalsPrice;
            }
            assets += player.Diamonds * Room.DiamondsPrice;

            // 股票市值
            foreach (var h in player.Stocks)
            {
                var stock = Room.Stocks.FirstOrDefault(s => s.Symbol == h.Symbol);
                if (stock != null)
                {
                    assets += stock.Price * h.Quantity;
                }
            }

            // 地产估值
            foreach (var propId in player.Properties)
            {
                if (propId < Room.Cells.Count)
                {
                    var cell = Room.Cells[propId];
                    if (cell != null)
                    {
                        assets += cell.BasePrice * (1 + cell.Level * 0.5m);
                    }
                }
                else
                {
                    // 商业用地（拍卖得来）
                    var idx = propId - 1000;
                    if (idx >= 0 && idx < Room.AuctionedProperties.Count)
                    {
                        assets += Room.AuctionedProperties[idx].FinalPrice * (1 + Room.AuctionedProperties[idx].Level * 0.5m);
                    }
                }
            }

            // 减去贷款
            foreach (var loan in player.Loans)
            {
                assets -= loan.Amount * (1 + loan.InterestRate);
            }

            player.TotalAssets = assets;
        }
    }

    private decimal ApplyMacro(decimal currentPrice, decimal ec, decimal inf, decimal risk, decimal baseVolatility)
    {
        // 综合变化率 = 经济周期×ec + 通胀×inf + 风险偏好×risk + 独立噪声
        var macroRate = Room!.MacroEconomicCycle * ec + Room.MacroInflation * inf + Room.MacroRiskAppetite * risk;
        var noise = (decimal)(_random.NextDouble() - 0.5) * 2m * baseVolatility;
        var totalRate = macroRate + noise;
        // 限制单日最大波动 ±5%
        totalRate = Math.Clamp(totalRate, -0.05m, 0.05m);
        return Math.Max(1, currentPrice * (1 + totalRate));
    }

    private static decimal ClampMacro(decimal v) => Math.Clamp(v, -1m, 1m);

    private void UpdateMarket()
    {
        if (Room == null) return;

        // === 宏观因子更新（每日，缓慢漂移） ===
        // 经济周期：在 -1~+1 漂移，标准差 0.15
        Room.MacroEconomicCycle = ClampMacro(Room.MacroEconomicCycle + (decimal)((_random.NextDouble() - 0.5) * 0.3));
        // 通胀：每月通胀期会上升
        Room.MacroInflation = ClampMacro(Room.MacroInflation + (decimal)((_random.NextDouble() - 0.5) * 0.2));
        // 风险偏好：与经济周期正相关，与通胀负相关
        var riskDrift = Room.MacroEconomicCycle * 0.3m - Room.MacroInflation * 0.4m + (decimal)((_random.NextDouble() - 0.5) * 0.3);
        Room.MacroRiskAppetite = ClampMacro(Room.MacroRiskAppetite + riskDrift);

        // === 建材价格（基于宏观因子 × 敏感性矩阵） ===
        // 敏感性矩阵：[经济周期, 通胀, 风险偏好, 独立噪声权重]
        var cement = ApplyMacro(Room.CementPrice, ec: 0.7m, inf: 0.3m, risk: 0.1m, baseVolatility: 0.012m);
        var steel = ApplyMacro(Room.SteelPrice, ec: 0.8m, inf: 0.3m, risk: 0.05m, baseVolatility: 0.012m);
        var rubber = ApplyMacro(Room.RubberPrice, ec: 0.6m, inf: 0.2m, risk: 0.1m, baseVolatility: 0.013m);
        // 贵金属：避险属性强（与风险偏好负相关）
        var precious = ApplyMacro(Room.PreciousMetalsPrice, ec: -0.1m, inf: 0.4m, risk: -0.5m, baseVolatility: 0.015m);
        // 钻石：奢侈品，强避险，弱经济周期
        var diamonds = ApplyMacro(Room.DiamondsPrice, ec: -0.2m, inf: 0.3m, risk: -0.7m, baseVolatility: 0.018m);

        Room.CementPrice = cement;
        Room.SteelPrice = steel;
        Room.RubberPrice = rubber;
        Room.PreciousMetalsPrice = precious;
        Room.DiamondsPrice = diamonds;

        foreach (var stock in Room.Stocks)
        {
            // === 完全照搬 share 1.2.1.cpp simulate_day() 的算法思想 ===
            // 1. 上涨/下跌概率 = 0.5 + 0.05×(基本面偏离)，clamp到 0.35~0.65（向基本面回归）
            // 2. 但概率反转：baseChange 反向（基本面贵 → 当天更可能跌；基本面便宜 → 更可能涨）
            // 3. range: 股票 ±20% 之内的均匀分布 → 单日最大±20%
            // 4. 不再有新闻"每天12%复利"——新闻只通过触发一次性的 baseChange 实现
            decimal newsEffect = 0m;
            bool newsTriggeredNow = false;
            if (!string.IsNullOrEmpty(stock.News))
            {
                if (stock.News.Contains("预增") || stock.News.Contains("看涨") || stock.News.Contains("利好") ||
                    stock.News.Contains("突破") || stock.News.Contains("大订单") || stock.News.Contains("入选"))
                    newsEffect = 0.12m;
                else if (stock.News.Contains("做空") || stock.News.Contains("不及预期") || stock.News.Contains("减持") ||
                         stock.News.Contains("债务") || stock.News.Contains("调查"))
                    newsEffect = -0.12m;
            }

            // ✅ 真实"昨日收盘"= 上一根 K 线的 Close（不是 stock.Price，stock.Price 可能因初始化或外部代码不同步）
            var prevCloseReal = stock.History?.LastOrDefault()?.Close ?? stock.Price;
            var oldPrice = prevCloseReal;  // 今天 Open = 昨天 Close（严格衔接）
            stock.Price = prevCloseReal;   // 同步 stock.Price 作为计算基准
            var prevCloseCheck = prevCloseReal;
            // --- K线：Open = 昨天收盘、Close = 今天收盘，确保 Open(t) = Close(t-1) 完全衔接 ---
            // 先决定今天涨/跌方向（stock_simulator 的概率反转机制）
            decimal ratio = stock.Base > 0 ? stock.Price / stock.Base : 1m;
            decimal deviation = (ratio - 1m) * 0.5m; // 偏离度 * 0.5 —— 比 cpp 弱化（cpp 是 *1）
            decimal upProb = 0.5m + deviation;
            upProb = Math.Clamp(upProb, 0.35m, 0.65m);
            bool upDown = _random.NextDouble() < (double)upProb;
            // 单日 range 最大 ±10%（股票）/ ±5%（其他）—— 降低以避免 K 线飞出去
            decimal range = (decimal)(_random.NextDouble() * 0.10);
            // 新闻：只在新闻触发的"第一天"产生一次性额外影响（合并进 range）
            // 这样 5 天内不会复利累加
            decimal effectiveRange = range;
            if (newsEffect != 0m && stock.NewsTriggered == false)
            {
                stock.NewsTriggered = true;
                newsTriggeredNow = true;
                // 一次性并入 range，不再每天复利
                effectiveRange += Math.Abs(newsEffect);
            }
            // 应用今日涨跌
            decimal totalChange = upDown ? effectiveRange : -effectiveRange;
            stock.Price = Math.Max(1, stock.Price * (1 + totalChange));
            // ✅ Change = 跟昨天收盘比（不是 Base！）—— 这才是"今天的涨跌"
            // 用 History 里的"上一根 Close"作为 PrevClose，跟 K 线图完全一致
            var prevCloseForChange = stock.History?.LastOrDefault()?.Close ?? oldPrice;
            stock.Change = prevCloseForChange > 0 ? ((stock.Price - prevCloseForChange) / prevCloseForChange) * 100 : 0;
            var logPath = System.IO.Path.Combine(AppContext.BaseDirectory, "debug-kline.log");
            System.IO.File.AppendAllText(logPath,
                $"Day {stock.History?.Count ?? -1}: OldPrice={oldPrice:F2} → NewPrice={stock.Price:F2} | PrevClose(Hist)={prevCloseForChange:F2} | Change={stock.Change:F2}%\n");
            // 涨跌幅跟 Base 的关系（用于 UI 显示 "vs 基本面" 之类）
            stock.LimitUp = stock.Change >= 10;
            stock.LimitDown = stock.Change <= -10;

            // 生成利好/利空新闻：每天必触发（保底 1 条/天），单只股票独立滚动
            // - 每只股票每天单独 12% 概率追加新闻（多条可能并存但只显示最新）
            // - 如已无 News，每天 18% 概率重新触发一条新的
            // - 配合"每天至少 1 条"的全市场扫描保证（见下方）
            if (stock.News == null && _random.NextDouble() < 0.18)
            {
                var isBullish = _random.NextDouble() > 0.5;
                var newsTemplates = isBullish
                    ? new[] {
                        $"🔥 {stock.Name} 业绩预增，机构看好！",
                        $"📈 {stock.Name} 获得大订单，后市看涨！",
                        $"💰 {stock.Name} 分红超预期，利好公告！",
                        $"🚀 {stock.Name} 技术突破，股价飙升！",
                        $"🌟 {stock.Name} 入选指数成分股！"
                    }
                    : new[] {
                        $"⚠️ {stock.Name} 遭遇做空，警惕风险！",
                        $"📉 {stock.Name} 业绩不及预期，下调评级！",
                        $"🔻 {stock.Name} 高管减持，股价承压！",
                        $"💸 {stock.Name} 债务压力加剧！",
                        $"⚡ {stock.Name} 面临监管调查！"
                    };
                stock.News = newsTemplates[_random.Next(newsTemplates.Length)];
                stock.EventDays = _random.Next(1, 6);
                stock.NewsTriggered = false; // 新闻开始，立即参与今天的 range
                System.IO.File.AppendAllText("game_log.txt",
                    $"[NEWS] {DateTime.Now:HH:mm:ss} Day={Room.CurrentTurn} tick触发: {stock.Symbol} {stock.Name} | 模板={stock.News} | 持续={stock.EventDays}天\n");
            }
            else if (stock.EventDays > 0)
            {
                stock.EventDays--;
                if (stock.EventDays == 0)
                {
                    stock.News = null;
                    stock.NewsTriggered = false;
                }
            }

            // 更新趋势
            if (stock.Price > oldPrice)
                stock.Trend = "up";
            else if (stock.Price < oldPrice)
                stock.Trend = "down";

            // 每日追加K线：完全照搬服务端公式
            // 高低影线 = (open, close, high, low) 紧凑贴近 K 线实体
            // High = max(Open,Close) + 一段缓冲，避免影线跳到很远的位置
            // Low  = min(Open,Close) - 一段缓冲
            if (stock.History == null) stock.History = new List<KLine>();
            var maxOC = Math.Max(oldPrice, stock.Price);
            var minOC = Math.Min(oldPrice, stock.Price);
            // 影线缓冲 = 实体长度的 30% 但不超过 5% 当前价 —— 避免低股价时显得"夸张"
            decimal ocRange = maxOC - minOC;
            decimal wickBuffer = Math.Min(ocRange * 0.3m, maxOC * 0.02m);
            if (wickBuffer < 0.05m) wickBuffer = 0.05m; // 最小影线
            var intraHigh = maxOC + wickBuffer;
            var intraLow = Math.Max(0.01m, minOC - wickBuffer);
            stock.History.Add(new KLine
            {
                Open = Math.Round(oldPrice, 2),
                Close = Math.Round(stock.Price, 2),
                High = Math.Round(intraHigh, 2),
                Low = Math.Round(intraLow, 2),
                Volume = _random.Next(100000, 1000000)
            });
            System.IO.File.AppendAllText(logPath,
                $"  K线 #{stock.History.Count - 1}: O={Math.Round(oldPrice, 2):F2} C={Math.Round(stock.Price, 2):F2} H={Math.Round(intraHigh, 2):F2} L={Math.Round(intraLow, 2):F2} | PrevClose={prevCloseCheck:F2} | GapOpenVsPrevClose={Math.Round(oldPrice - prevCloseCheck, 2):F2}\n");
            // 保留最近60根K线
            if (stock.History.Count > 60) stock.History.RemoveAt(0);
        }

        // === 每日新闻兜底：保证每天至少 1 条利好或利空出现在全市场 ===
        // 之前 18% 单只概率下，可能某一天所有股票都没触发新闻
        // 这里加一道兜底：找出今天尚未触发新闻的股票，随机选 1~2 只强制触发
        var stocksWithoutNews = Room.Stocks.Where(s => string.IsNullOrEmpty(s.News)).ToList();
        if (stocksWithoutNews.Count > 0)
        {
            // 30% 概率强制出 1 条新闻（保证约 30% 工作日至少 1 条新闻出现）
            if (_random.NextDouble() < 0.30)
            {
                var pickCount = _random.NextDouble() < 0.3 ? 2 : 1; // 30% 出 2 条
                var picked = stocksWithoutNews.OrderBy(_ => _random.Next()).Take(pickCount).ToList();
                foreach (var stock in picked)
                {
                    var isBullish = _random.NextDouble() > 0.5;
                    var newsTemplates = isBullish
                        ? new[] {
                            $"🔥 {stock.Name} 业绩预增，机构看好！",
                            $"📈 {stock.Name} 获得大订单，后市看涨！",
                            $"💰 {stock.Name} 分红超预期，利好公告！",
                            $"🚀 {stock.Name} 技术突破，股价飙升！",
                            $"🌟 {stock.Name} 入选指数成分股！"
                        }
                        : new[] {
                            $"⚠️ {stock.Name} 遭遇做空，警惕风险！",
                            $"📉 {stock.Name} 业绩不及预期，下调评级！",
                            $"🔻 {stock.Name} 高管减持，股价承压！",
                            $"💸 {stock.Name} 债务压力加剧！",
                            $"⚡ {stock.Name} 面临监管调查！"
                        };
                    stock.News = newsTemplates[_random.Next(newsTemplates.Length)];
                    stock.EventDays = _random.Next(1, 6);
                    stock.NewsTriggered = false;
                    System.IO.File.AppendAllText("game_log.txt",
                        $"[NEWS_FALLBACK] {DateTime.Now:HH:mm:ss} Day={Room.CurrentTurn} 全市场兜底触发: {stock.Symbol} {stock.Name} | 模板={stock.News} | 持续={stock.EventDays}天\n");
                }
            }
        }

        foreach (var futures in Room.Futures)
        {
            // 期货价格 = 昨日收盘价 × (1 + 商品市场变化 + 随机波动)
            // 保持与昨日 K 线连续衔接（避免跳空），同时跟随商品价格走势
            var baseRefPrice = futures.Type switch
            {
                FuturesType.Cement => Room.CementPrice,
                FuturesType.Steel => Room.SteelPrice,
                FuturesType.Rubber => Room.RubberPrice,
                FuturesType.Gold => Room.PreciousMetalsPrice,
                FuturesType.Silver => Room.PreciousMetalsPrice * 0.2m,
                FuturesType.Diamond => Room.DiamondsPrice,
                _ => futures.Base
            };

            // 商品市场相对昨日的变化率（用于方向跟随）
            var refChange = futures.Base > 0
                ? (baseRefPrice - futures.Base) / futures.Base
                : 0m;
            // 随机波动 ±2%
            var randomVol = (decimal)(_random.NextDouble() - 0.5) * 0.04m;
            // 总变化 = 商品市场变化 + 随机波动（不放大跳空）
            var totalChange = refChange + randomVol;
            // ✅ 真实"昨日收盘"= 上一根 K 线 Close（避免初始化后 futures.Price 跟 History.Last().Close 脱节）
            var prevFuturesClose = futures.History?.LastOrDefault()?.Close ?? futures.Price;
            var oldFuturesPrice = prevFuturesClose;
            futures.Price = prevFuturesClose;  // 同步 futures.Price
            futures.Base = baseRefPrice; // 同步期货Base为最新商品基准价
            futures.Price = Math.Max(1, futures.Price * (1 + totalChange));
            // ✅ Change = (今天 Close - 昨天 Close) / 昨天 Close × 100（跟 K 线图完全一致）
            futures.Change = prevFuturesClose > 0 ? ((futures.Price - prevFuturesClose) / prevFuturesClose) * 100 : 0;

            // 每日追加一根K线：影线更紧凑，与初始历史生成保持一致
            if (futures.History == null) futures.History = new List<KLine>();
            var maxOC = Math.Max(oldFuturesPrice, futures.Price);
            var minOC = Math.Min(oldFuturesPrice, futures.Price);
            decimal ocRange = maxOC - minOC;
            decimal wickBuffer = Math.Min(ocRange * 0.3m, maxOC * 0.02m);
            if (wickBuffer < 0.05m) wickBuffer = 0.05m;
            var intraHigh = maxOC + wickBuffer;
            var intraLow = Math.Max(0.01m, minOC - wickBuffer);
            futures.History.Add(new KLine
            {
                Open = Math.Round(oldFuturesPrice, 2),
                Close = Math.Round(futures.Price, 2),
                High = Math.Round(intraHigh, 2),
                Low = Math.Round(intraLow, 2),
                Volume = _random.Next(100000, 1000000)
            });
            if (futures.History.Count > 60) futures.History.RemoveAt(0);
        }
    }

    private void StartAuction()
    {
        if (Room == null) return;
        if (Room.ActiveAuction != null) return; // 已有未结束拍卖

        // 商业用地候选名（虚构地块，可描述性）
        var candidates = new (string name, CommercialType type, decimal price)[]
        {
            ("黄浦江畔滨江一号", CommercialType.RealEstate, 30_000),
            ("张江高科技广场", CommercialType.TechPark, 45_000),
            ("虹桥商务综合体", CommercialType.ShoppingMall, 38_000),
            ("徐家汇太平洋百货", CommercialType.ShoppingMall, 35_000),
            ("陆家嘴金融中心", CommercialType.OfficeTower, 50_000),
            ("佘山国际度假村", CommercialType.HotelResort, 60_000),
            ("新天地步行街", CommercialType.RealEstate, 32_000),
            ("迪士尼度假区", CommercialType.HotelResort, 80_000)
        };

        var pick = candidates[_random.Next(candidates.Length)];
        var reserve = pick.price * Room.InflationMultiplier;

        Room.ActiveAuction = new CommercialProperty
        {
            Name = pick.name,
            Type = pick.type,
            ReservePrice = reserve,
            Day = Room.CurrentTurn,
            ClosesOnDay = Room.CurrentTurn, // 当天结束就结算
            Closed = false,
            Level = 0
        };
        Room.AuctionBids.Clear();

        AddMessage(MessageType.Warning, $"📢 拍卖开始！商业用地：{pick.name}（底价 ${reserve:N0}）");
        AddMessage(MessageType.Info, $"⏰ 所有玩家在本回合内出价，结束回合时立即结算。");
        AddMessage(MessageType.Info, $"❗ 未提交出价 = 弃权。中标价 ≥ 底价才成交，否则流拍。");

        BroadcastState();
    }

    private void BroadcastState()
    {
        OnStateChanged?.Invoke(Room!);
    }

    private void AddMessage(MessageType type, string content) =>
        OnMessage?.Invoke(new GameMessage { Type = type, Content = content });

    private static string GenerateRoomCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var code = new char[4];
        var r = new Random();
        for (int i = 0; i < 4; i++) code[i] = chars[r.Next(chars.Length)];
        return new string(code);
    }

    private static List<Cell> GenerateCells()
    {
        // 64格地图 - 上海地名，每条升级链5次到顶级建筑
        var cells = new List<Cell>
        {
            // === 顶排 (0-15) ===
            new() { Id = 0, Name = "🚩 起点", Type = CellType.Start, Price = 0, BasePrice = 0 },
            new() { Id = 1, Name = "闵行", Type = CellType.RealEstate, Price = 800, BasePrice = 800, IntermediateTier = IntermediateTier.Residential },
            new() { Id = 2, Name = "🏦 银行", Type = CellType.Bank, Price = 0, BasePrice = 0 },
            new() { Id = 3, Name = "徐汇", Type = CellType.RealEstate, Price = 1200, BasePrice = 1200, IntermediateTier = IntermediateTier.Commercial },
            new() { Id = 4, Name = "📈 股票交易所", Type = CellType.Stock, Price = 0, BasePrice = 0 },
            new() { Id = 5, Name = "宝山", Type = CellType.RealEstate, Price = 900, BasePrice = 900, IntermediateTier = IntermediateTier.Industrial },
            new() { Id = 6, Name = "❓ 机会", Type = CellType.Chance, Price = 0, BasePrice = 0 },
            new() { Id = 7, Name = "陆家嘴", Type = CellType.RealEstate, Price = 1500, BasePrice = 1500, IntermediateTier = IntermediateTier.Office },
            new() { Id = 8, Name = "外滩", Type = CellType.RealEstate, Price = 1800, BasePrice = 1800, IntermediateTier = IntermediateTier.Landmark },
            new() { Id = 9, Name = "🎁 彩票站", Type = CellType.Chance, Price = 0, BasePrice = 0 },
            new() { Id = 10, Name = "🏛️ 博物馆", Type = CellType.Museum, Price = 0, BasePrice = 0 },
            new() { Id = 11, Name = "🌳 公园", Type = CellType.Park, Price = 0, BasePrice = 0 },
            new() { Id = 12, Name = "💎 钻石矿", Type = CellType.Diamond, Price = 0, BasePrice = 0 },
            new() { Id = 13, Name = "🎲 娱乐场", Type = CellType.Chance, Price = 0, BasePrice = 0 },
            new() { Id = 14, Name = "静安", Type = CellType.RealEstate, Price = 1400, BasePrice = 1400, IntermediateTier = IntermediateTier.Commercial },
            new() { Id = 15, Name = "🛢️ 期货交易所", Type = CellType.Futures, Price = 0, BasePrice = 0 },

            // === 右排 (16-31) ===
            new() { Id = 16, Name = "黄浦", Type = CellType.RealEstate, Price = 1100, BasePrice = 1100, IntermediateTier = IntermediateTier.Landmark },
            new() { Id = 17, Name = "🏥 医院", Type = CellType.Hospital, Price = 0, BasePrice = 0 },
            new() { Id = 18, Name = "🎯 命运", Type = CellType.Destiny, Price = 0, BasePrice = 0 },
            new() { Id = 19, Name = "虹口", Type = CellType.RealEstate, Price = 700, BasePrice = 700, IntermediateTier = IntermediateTier.Residential },
            new() { Id = 20, Name = "🛒 商品市场", Type = CellType.Market, Price = 0, BasePrice = 0 },
            new() { Id = 21, Name = "普陀", Type = CellType.RealEstate, Price = 1500, BasePrice = 1500, IntermediateTier = IntermediateTier.Office },
            new() { Id = 22, Name = "🚔 警察局", Type = CellType.Jail, Price = 0, BasePrice = 0 },
            new() { Id = 23, Name = "长宁", Type = CellType.RealEstate, Price = 1300, BasePrice = 1300, IntermediateTier = IntermediateTier.Commercial },
            new() { Id = 24, Name = "💎 宝石矿", Type = CellType.Diamond, Price = 0, BasePrice = 0 },
            new() { Id = 25, Name = "嘉定", Type = CellType.RealEstate, Price = 1100, BasePrice = 1100, IntermediateTier = IntermediateTier.Industrial },
            new() { Id = 26, Name = "❓ 随机事件", Type = CellType.Chance, Price = 0, BasePrice = 0 },
            new() { Id = 27, Name = "🛡️ 保险公司", Type = CellType.Insurance, Price = 0, BasePrice = 0 },
            new() { Id = 28, Name = "松江", Type = CellType.RealEstate, Price = 1600, BasePrice = 1600, IntermediateTier = IntermediateTier.Landmark },
            new() { Id = 29, Name = "🌲 森林公园", Type = CellType.Park, Price = 0, BasePrice = 0 },
            new() { Id = 30, Name = "青浦", Type = CellType.RealEstate, Price = 1800, BasePrice = 1800, IntermediateTier = IntermediateTier.Office },
            new() { Id = 31, Name = "🎰 赌场", Type = CellType.Chance, Price = 0, BasePrice = 0 },

            // === 底排 (32-47) ===
            new() { Id = 32, Name = "浦东", Type = CellType.RealEstate, Price = 2000, BasePrice = 2000, IntermediateTier = IntermediateTier.Office },
            new() { Id = 33, Name = "🏛️ 市政厅", Type = CellType.Park, Price = 0, BasePrice = 0 },
            new() { Id = 34, Name = "🎲 游戏厅", Type = CellType.Chance, Price = 0, BasePrice = 0 },
            new() { Id = 35, Name = "杨浦", Type = CellType.RealEstate, Price = 1900, BasePrice = 1900, IntermediateTier = IntermediateTier.Residential },
            new() { Id = 36, Name = "💎 钻石工坊", Type = CellType.Diamond, Price = 0, BasePrice = 0 },
            new() { Id = 37, Name = "虹梅路", Type = CellType.RealEstate, Price = 1500, BasePrice = 1500, IntermediateTier = IntermediateTier.Commercial },
            new() { Id = 38, Name = "📊 税务局", Type = CellType.Tax, Price = 0, BasePrice = 0 },
            new() { Id = 39, Name = "南京西路", Type = CellType.RealEstate, Price = 2200, BasePrice = 2200, IntermediateTier = IntermediateTier.Landmark },
            new() { Id = 40, Name = "🎁 礼品店", Type = CellType.Chance, Price = 0, BasePrice = 0 },
            new() { Id = 41, Name = "南汇", Type = CellType.RealEstate, Price = 1700, BasePrice = 1700, IntermediateTier = IntermediateTier.Industrial },
            new() { Id = 42, Name = "🎯 命运转盘", Type = CellType.Destiny, Price = 0, BasePrice = 0 },
            new() { Id = 43, Name = "奉贤", Type = CellType.RealEstate, Price = 600, BasePrice = 600, IntermediateTier = IntermediateTier.Residential },
            new() { Id = 44, Name = "💎 稀有矿脉", Type = CellType.Diamond, Price = 0, BasePrice = 0 },
            new() { Id = 45, Name = "金山", Type = CellType.RealEstate, Price = 1000, BasePrice = 1000, IntermediateTier = IntermediateTier.Industrial },
            new() { Id = 46, Name = "❓ 惊喜", Type = CellType.Chance, Price = 0, BasePrice = 0 },
            new() { Id = 47, Name = "🏛️ 法院", Type = CellType.Jail, Price = 0, BasePrice = 0 },

            // === 左排 (48-63) ===
            new() { Id = 48, Name = "崇明", Type = CellType.RealEstate, Price = 1400, BasePrice = 1400, IntermediateTier = IntermediateTier.Landmark },
            new() { Id = 49, Name = "📚 学校", Type = CellType.Park, Price = 0, BasePrice = 0 },
            new() { Id = 50, Name = "🎲 抽奖点", Type = CellType.Chance, Price = 0, BasePrice = 0 },
            new() { Id = 51, Name = "闸北", Type = CellType.RealEstate, Price = 600, BasePrice = 600, IntermediateTier = IntermediateTier.Residential },
            new() { Id = 52, Name = "💎 珠宝店", Type = CellType.Diamond, Price = 0, BasePrice = 0 },
            new() { Id = 53, Name = "徐家汇", Type = CellType.RealEstate, Price = 1200, BasePrice = 1200, IntermediateTier = IntermediateTier.Commercial },
            new() { Id = 54, Name = "🅿️ 停车场", Type = CellType.Park, Price = 0, BasePrice = 0 },
            new() { Id = 55, Name = "莘庄", Type = CellType.RealEstate, Price = 900, BasePrice = 900, IntermediateTier = IntermediateTier.Industrial },
            new() { Id = 56, Name = "🏥 诊所", Type = CellType.Hospital, Price = 0, BasePrice = 0 },
            new() { Id = 57, Name = "周浦", Type = CellType.RealEstate, Price = 500, BasePrice = 500, IntermediateTier = IntermediateTier.Residential },
            new() { Id = 58, Name = "🎯 命运之门", Type = CellType.Destiny, Price = 0, BasePrice = 0 },
            new() { Id = 59, Name = "七宝", Type = CellType.RealEstate, Price = 800, BasePrice = 800, IntermediateTier = IntermediateTier.Office },
            new() { Id = 60, Name = "💎 钻石广场", Type = CellType.Diamond, Price = 0, BasePrice = 0 },
            new() { Id = 61, Name = "陆家嘴金融区", Type = CellType.RealEstate, Price = 1700, BasePrice = 1700, IntermediateTier = IntermediateTier.Office },
            new() { Id = 62, Name = "❓ 随机传送", Type = CellType.Chance, Price = 0, BasePrice = 0 },
            new() { Id = 63, Name = "🚨 抓进监狱", Type = CellType.GoToJail, Price = 0, BasePrice = 0 }
        };

        return cells;
    }

    private static List<Stock> GenerateStocks()
    {
        var stockData = new[]
        {
            ("腾讯", "TMT"), ("平安", "金融"), ("中石油", "能源"), ("茅台", "消费"),
            ("恒瑞", "消费"), ("中车", "周期"), ("万科", "周期"), ("隆平", "农业"),
            ("船舶", "防务"), ("哔哩", "TMT"), ("顺丰", "基建"), ("紫金", "周期"),
            ("中芯", "TMT"), ("宁德", "能源"), ("比亚迪", "消费"), ("美的", "消费")
        };

        var r = new Random(42);
        var stocks = new List<Stock>();
        foreach (var (name, sector) in stockData)
        {
            var price = r.Next(50, 500);
            var base_ = price;

            // 随机初始化市场参与者倾向
            var retailBias = (decimal)(r.NextDouble() * 0.4 - 0.2); // -0.2 ~ +0.2
            var institutionBias = (decimal)(r.NextDouble() * 0.3 - 0.15); // -0.15 ~ +0.15
            var whaleBias = (decimal)(r.NextDouble() * 0.4 - 0.2); // -0.2 ~ +0.2
            var manipulatorBias = (decimal)(r.NextDouble() * 0.6 - 0.3); // -0.3 ~ +0.3
            var quantBias = (decimal)(r.NextDouble() * 0.5 - 0.25); // -0.25 ~ +0.25

            var stock = new Stock
            {
                Symbol = name,
                Name = name + "控股",
                Sector = sector,
                Price = price,
                Base = base_,
                Change = Math.Round((decimal)(r.NextDouble() * 10 - 5), 2),
                EventDesc = "无重大事件",
                // 市场参与者倾向
                RetailBias = retailBias,
                InstitutionBias = institutionBias,
                WhaleBias = whaleBias,
                ManipulatorBias = manipulatorBias,
                QuantBias = quantBias
            };

            // Generate K-line history
            stock.History = GenerateStockHistory(price, r);
            // ✅ 同步 stock.Price 为最后一根历史 K 线的 Close（让"今天 Open = 昨天 Close"严格成立）
            stock.Price = stock.History.Last().Close;
            stocks.Add(stock);
        }
        return stocks;
    }

    private static List<KLine> GenerateStockHistory(int basePrice, Random r)
    {
        var history = new List<KLine>();
        decimal price = basePrice;

        for (int i = 0; i < 20; i++)
        {
            var change = (decimal)(r.NextDouble() * 20 - 10);
            var open = price;
            price = Math.Max(1, price * (1 + change / 100));
            var close = price;
            var high = Math.Max(open, close) * (1 + (decimal)(r.NextDouble() * 5 / 100));
            var low = Math.Min(open, close) * (1 - (decimal)(r.NextDouble() * 5 / 100));

            history.Add(new KLine
            {
                Open = Math.Round(open, 2),
                High = Math.Round(high, 2),
                Low = Math.Round(low, 2),
                Close = Math.Round(close, 2),
                Volume = r.Next(1000, 10000)
            });
        }
        return history;
    }

    private List<FuturesContract> GenerateFutures()
    {
        // 期货基础价锚定商品市场价 + 溢价/折价
        var cementBase = Room?.CementPrice ?? 100m;
        var steelBase = Room?.SteelPrice ?? 200m;
        var rubberBase = Room?.RubberPrice ?? 150m;
        var preciousBase = Room?.PreciousMetalsPrice ?? 500m;
        var diamondBase = Room?.DiamondsPrice ?? 1000m;

        var futuresData = new (string name, FuturesType type, FuturesCategory category, decimal basePrice)[]
        {
            ("黄金", FuturesType.Gold, FuturesCategory.Precious, preciousBase),
            ("白银", FuturesType.Silver, FuturesCategory.Precious, preciousBase * 0.2m),
            ("钻石", FuturesType.Diamond, FuturesCategory.Precious, diamondBase),
            ("水泥", FuturesType.Cement, FuturesCategory.Material, cementBase),
            ("钢材", FuturesType.Steel, FuturesCategory.Material, steelBase),
            ("橡胶", FuturesType.Rubber, FuturesCategory.Material, rubberBase),
            ("原油", FuturesType.Oil, FuturesCategory.Energy, 500m),
            ("小麦", FuturesType.Wheat, FuturesCategory.Agriculture, 80m)
        };

        var r = new Random(42);
        var futures = new List<FuturesContract>();
        foreach (var (name, type, category, basePrice) in futuresData)
        {
            var price = basePrice * (1 + (decimal)(r.NextDouble() * 0.4 - 0.2));

            // 期货市场参与者倾向
            var retailBias = (decimal)(r.NextDouble() * 0.4 - 0.2);
            var institutionBias = (decimal)(r.NextDouble() * 0.3 - 0.15);
            var whaleBias = (decimal)(r.NextDouble() * 0.4 - 0.2);
            var manipulatorBias = (decimal)(r.NextDouble() * 0.6 - 0.3);
            var quantBias = (decimal)(r.NextDouble() * 0.5 - 0.25);

            var futuresContract = new FuturesContract
            {
                Symbol = name,
                Name = name + "期货",
                Type = type,
                Category = category,
                Price = price,
                Base = basePrice,
                Unit = 1,
                Change = Math.Round((decimal)(r.NextDouble() * 10 - 5), 2),
                IsMaterial = category == FuturesCategory.Material,
                // 每个合约初始剩余天数随机（10-60天），避免同时到期
                ExpiresInDays = r.Next(10, 61),
                // 市场参与者倾向
                RetailBias = retailBias,
                InstitutionBias = institutionBias,
                WhaleBias = whaleBias,
                ManipulatorBias = manipulatorBias,
                QuantBias = quantBias
            };
            // Generate K-line history for futures
            futuresContract.History = GenerateFuturesHistory((double)basePrice, r);
            // ✅ 同步 futures.Price 为最后一根历史 K 线的 Close（防止 K 线跳空）
            futuresContract.Price = futuresContract.History.Last().Close;
            futures.Add(futuresContract);
        }
        return futures;
    }

    private static List<KLine> GenerateFuturesHistory(double basePrice, Random r)
    {
        var history = new List<KLine>();
        decimal price = (decimal)basePrice;

        for (int i = 0; i < 20; i++)
        {
            var change = (decimal)(r.NextDouble() * 20 - 10);
            var open = price;
            price = Math.Max(1, price * (1 + change / 100));
            var close = price;
            var high = Math.Max(open, close) * (1 + (decimal)(r.NextDouble() * 5 / 100));
            var low = Math.Min(open, close) * (1 - (decimal)(r.NextDouble() * 5 / 100));

            history.Add(new KLine
            {
                Open = open,
                Close = close,
                High = high,
                Low = low,
                Volume = (decimal)(r.NextDouble() * 10000 + 1000)
            });
        }
        return history;
    }
}
