using Microsoft.AspNetCore.SignalR;
using Richman.Shared;

namespace Richman.Server;

public static class GameHubManager
{
    private static readonly Dictionary<string, GameRoom> _rooms = new();
    private static readonly Dictionary<string, (string roomCode, Player player)> _connections = new();
    private static readonly object _lock = new();
    private static IHubContext<GameHub>? _hubContext;

    public static void SetHubContext(IHubContext<GameHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public static void SetConnection(string roomCode, string connectionId, Player player)
    {
        lock (_lock)
        {
            _connections[connectionId] = (roomCode, player);
        }
    }

    public static (string? roomCode, Player? player) GetConnection(string connectionId)
    {
        lock (_lock)
        {
            if (_connections.TryGetValue(connectionId, out var info))
            {
                if (_rooms.TryGetValue(info.roomCode, out var room))
                {
                    var player = room.Players.FirstOrDefault(p => p.Id == connectionId);
                    return (info.roomCode, player);
                }
            }
            return (null, null);
        }
    }

    public static GameRoom CreateRoom(string mode, int maxPlayers = 6)
    {
        lock (_lock)
        {
            var room = new GameRoom
            {
                Code = GenerateRoomCode(),
                Mode = mode == "singleplayer" ? GameMode.Singleplayer : GameMode.Multiplayer,
                MaxPlayers = maxPlayers,
                Phase = GamePhase.Lobby,
                CurrentTurn = 0,
                CurrentPlayerIndex = 0,
                TargetAssets = GameConstants.SingleplayerTarget,
                Cells = GenerateCells(),
                Stocks = GenerateStocks(),
                Futures = GenerateFutures(),
                GameDate = DateTime.UtcNow.ToString("yyyy-MM-dd")
            };

            _rooms[room.Code] = room;
            return room;
        }
    }

    public static Player? JoinRoom(string roomCode, string playerName, string connectionId)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(roomCode, out var room)) return null;
            if (room.Phase != GamePhase.Lobby) return null;
            if (room.Players.Count >= room.MaxPlayers) return null;

            var player = new Player
            {
                Id = connectionId,
                Name = playerName,
                Color = GameConstants.PlayerColors[room.Players.Count],
                Cash = GameConstants.InitialCash,
                Deposit = GameConstants.InitialDeposit,
                Diamonds = GameConstants.InitialDiamonds,
                Position = 0,
                Materials = new Materials()
            };

            room.Players.Add(player);
            _connections[connectionId] = (roomCode, player);
            return player;
        }
    }

    public static GameRoom? GetRoom(string code)
    {
        lock (_lock)
        {
            return _rooms.TryGetValue(code, out var room) ? room : null;
        }
    }

    public static List<GameRoom> GetRoomList()
    {
        lock (_lock)
        {
            return _rooms.Values.Where(r => r.Phase == GamePhase.Lobby).ToList();
        }
    }

    public static List<GameRoom> GetGlobalRoomList() => GetRoomList();
    public static GameRoom? GetGlobalRoom(string code) => GetRoom(code);
    public static GameRoom CreateGlobalRoom(string mode, int maxPlayers) => CreateRoom(mode, maxPlayers);

    public static void BroadcastState(string roomCode)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(roomCode, out var room)) return;
            _hubContext?.Clients.Group(roomCode).SendAsync("ReceiveState", room);
        }
    }

    public static void AddAiPlayers(string roomCode, string difficulty, int count)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(roomCode, out var room)) return;

            var aiNames = difficulty switch
            {
                "easy" => GameConstants.AiNamesEasy,
                "hard" => GameConstants.AiNamesHard,
                _ => GameConstants.AiNamesNormal
            };

            for (int i = 0; i < count && room.Players.Count < room.MaxPlayers; i++)
            {
                var aiPlayer = new Player
                {
                    Id = $"AI_{Guid.NewGuid():N}",
                    Name = aiNames[i % aiNames.Length],
                    IsAI = true,
                    Color = GameConstants.PlayerColors[room.Players.Count],
                    Cash = GameConstants.InitialCash,
                    Deposit = GameConstants.InitialDeposit,
                    Diamonds = GameConstants.InitialDiamonds,
                    Position = 0,
                    Materials = new Materials()
                };
                room.Players.Add(aiPlayer);
                _connections[aiPlayer.Id] = (roomCode, aiPlayer);
            }
        }
    }

    public static void SendMessage(string roomCode, MessageType type, string content)
    {
        lock (_lock)
        {
            _hubContext?.Clients.Group(roomCode).SendAsync("ReceiveMessage", new GameMessage
            {
                Type = type,
                Content = content,
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            });
        }
    }

    public static void StartGame(string roomCode)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(roomCode, out var room)) return;
            if (room.Players.Count < 1) return;

            room.Phase = GamePhase.Playing;
            room.CurrentTurn = 1;
            room.CurrentPlayerIndex = 0;
            room.TurnStartedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            room.GameDate = DateTime.UtcNow.ToString("yyyy-MM-dd");

            room.Stocks.ForEach(s => s.Price = s.Base);

            SendMessage(roomCode, MessageType.Info, $"游戏开始！目标资产: ${room.TargetAssets:N0}");
        }
    }

    public static void RollDice(string roomCode, Player player)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(roomCode, out var room)) return;
            if (room.Phase != GamePhase.Playing) return;
            if (room.Players[room.CurrentPlayerIndex].Id != player.Id) return;
            if (room.DiceValue.HasValue) return;

            var dice = room.ForcedDice ?? GameHelper.RollDice();
            room.DiceValue = dice;
            room.ForcedDice = null;

            SendMessage(roomCode, MessageType.Info, $"{player.Name} 掷出 {dice} 点");

            player.Position = (player.Position + dice) % GameConstants.TotalCells;

            if (player.Position < dice)
            {
                player.Cash += GameConstants.StartBonus;
                SendMessage(roomCode, MessageType.Info, $"{player.Name} 经过起点，获得 ${GameConstants.StartBonus}");
            }

            ProcessCellEvent(roomCode, room, player);
            player.TotalAssets = CalculateAssets(roomCode, player);
        }
    }

    public static void EndTurn(string roomCode)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(roomCode, out var room)) return;
            if (room.Phase != GamePhase.Playing) return;

            var currentPlayer = room.Players[room.CurrentPlayerIndex];
            currentPlayer.StayTurns = 0;

            ProcessEndOfDay(roomCode, room);
            NextPlayer(roomCode, room);
            BroadcastState(roomCode);
        }
    }

    private static void ProcessEndOfDay(string roomCode, GameRoom room)
    {
        room.CurrentTurn++;
        room.GameDate = GameHelper.AddDays(room.GameDate, 1);

        UpdateStockPrices(room);
        UpdateFuturesPrices(room);
        ProcessLoans(roomCode, room);
        ProcessSpecialUpgrades(roomCode, room);
        CheckMarginCall(roomCode, room);
    }

    private static void NextPlayer(string roomCode, GameRoom room)
    {
        room.Players = room.Players.Where(p => !p.IsBankrupt).ToList();

        if (room.Mode == GameMode.Multiplayer)
        {
            if (room.Players.Count <= 1)
            {
                room.Phase = GamePhase.Ended;
                if (room.Players.Count == 1)
                {
                    room.WinnerId = room.Players[0].Id;
                    SendMessage(roomCode, MessageType.Success, $"🎉 {room.Players[0].Name} 获得最终胜利！");
                }
                return;
            }

            room.CurrentPlayerIndex = (room.CurrentPlayerIndex + 1) % room.Players.Count;
            if (room.CurrentPlayerIndex >= room.Players.Count) room.CurrentPlayerIndex = 0;
        }
        else
        {
            var humanIndex = room.Players.FindIndex(p => !p.IsAI);
            if (humanIndex < 0)
            {
                room.Phase = GamePhase.Ended;
                return;
            }
            room.CurrentPlayerIndex = humanIndex;
        }

        room.DiceValue = null;
        room.TurnStartedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var currentPlayer = room.Players[room.CurrentPlayerIndex];
        if (!currentPlayer.IsAI && room.Mode == GameMode.Singleplayer)
        {
            var assets = CalculateAssets(roomCode, currentPlayer);
            if (assets >= room.TargetAssets)
            {
                room.Phase = GamePhase.Ended;
                room.WinnerId = currentPlayer.Id;
                SendMessage(roomCode, MessageType.Success, $"🎉 {currentPlayer.Name} 总资产达到 ${assets:N0}，达成亿万富翁目标！");
            }
        }
    }

    public static decimal CalculateAssets(string roomCode, Player player)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(roomCode, out var room)) return 0;

            decimal assets = player.Cash + player.Deposit;

            foreach (var propId in player.Properties)
            {
                if (propId >= 0 && propId < room.Cells.Count)
                {
                    var cell = room.Cells[propId];
                    assets += cell.Price * (decimal)Math.Pow(2, cell.Level);
                }
            }

            foreach (var holding in player.Stocks)
            {
                var stock = room.Stocks.FirstOrDefault(s => s.Symbol == holding.Symbol);
                if (stock != null)
                {
                    assets += stock.Price * holding.Quantity;
                    if (holding.ShortQuantity > 0)
                    {
                        assets -= stock.Price * holding.ShortQuantity;
                    }
                }
            }

            var diamondFutures = room.Futures.FirstOrDefault(f => f.Type == FuturesType.Diamond);
            if (diamondFutures != null)
            {
                assets += player.Diamonds * diamondFutures.Price * diamondFutures.Unit;
            }

            var goldFutures = room.Futures.FirstOrDefault(f => f.Type == FuturesType.Gold);
            if (goldFutures != null)
            {
                assets += player.Materials.PreciousMetals * goldFutures.Price;
            }

            return assets;
        }
    }

    private static void ProcessCellEvent(string roomCode, GameRoom room, Player player)
    {
        var cell = room.Cells[player.Position];
        player.PassedBank = false;
        player.AtStockExchange = false;
        player.AtFuturesExchange = false;

        if (cell.Type == CellType.Empty && cell.Owner == player.Id)
        {
            cell.VisitCount = (cell.VisitCount ?? 0) + 1;
        }

        switch (cell.Type)
        {
            case CellType.Start:
                player.Cash += GameConstants.StartBonus;
                SendMessage(roomCode, MessageType.Info, $"{player.Name} 经过起点，获得 ${GameConstants.StartBonus}");
                break;

            case CellType.Bank:
                player.PassedBank = true;
                SendMessage(roomCode, MessageType.Info, $"{player.Name} 来到银行");
                break;

            case CellType.Stock:
                player.AtStockExchange = true;
                SendMessage(roomCode, MessageType.Info, $"{player.Name} 来到股票交易所");
                break;

            case CellType.Futures:
                player.AtFuturesExchange = true;
                SendMessage(roomCode, MessageType.Info, $"{player.Name} 来到期货交易所");
                break;

            case CellType.Chance:
                ProcessChanceEvent(roomCode, player);
                break;

            case CellType.Destiny:
                ProcessDestinyEvent(roomCode, player);
                break;

            case CellType.Diamond:
                var diamondReward = Random.Shared.Next(30, 51);
                player.Diamonds += diamondReward;
                SendMessage(roomCode, MessageType.Success, $"{player.Name} 获得 {diamondReward}💎");
                break;

            case CellType.Empty:
                ProcessEmptyCell(roomCode, room, player, cell);
                break;
        }

        if (player.Cash + player.Deposit < 0)
        {
            player.IsBankrupt = true;
            foreach (var propId in player.Properties)
            {
                room.Cells[propId].Owner = null;
                room.Cells[propId].Level = 0;
            }
            SendMessage(roomCode, MessageType.Error, $"{player.Name} 破产了!");
        }
    }

    private static void ProcessChanceEvent(string roomCode, Player player)
    {
        var r = Random.Shared.NextDouble();
        if (r < 0.4)
        {
            var card = GameConstants.GiftCards[Random.Shared.Next(GameConstants.GiftCards.Length)];
            player.Cards.Add(card);
            SendMessage(roomCode, MessageType.Success, $"{player.Name} 抽到机会卡，获得 [{card}]");
        }
        else if (r < 0.7)
        {
            var materials = new[] { "cement", "steel", "rubber" };
            var mat = materials[Random.Shared.Next(3)];
            var qty = Random.Shared.Next(3, 9);
            switch (mat)
            {
                case "cement": player.Materials.Cement += qty; break;
                case "steel": player.Materials.Steel += qty; break;
                case "rubber": player.Materials.Rubber += qty; break;
            }
            var matName = mat == "cement" ? "水泥" : mat == "steel" ? "钢材" : "橡胶";
            SendMessage(roomCode, MessageType.Success, $"{player.Name} 获得建材：{matName} ×{qty}");
        }
        else
        {
            player.Cash += 1000;
            SendMessage(roomCode, MessageType.Info, $"{player.Name} 获得 $1000");
        }
    }

    private static void ProcessDestinyEvent(string roomCode, Player player)
    {
        var r = Random.Shared.NextDouble();
        if (r < 0.3)
        {
            player.Cash -= 500;
            SendMessage(roomCode, MessageType.Warning, $"{player.Name} 命运不佳，损失 $500");
        }
        else if (r < 0.5)
        {
            player.Deposit += 1000;
            SendMessage(roomCode, MessageType.Success, $"{player.Name} 命运眷顾，存款 +$1000");
        }
        else if (r < 0.7)
        {
            player.Position = 0;
            player.Cash += GameConstants.StartBonus;
            SendMessage(roomCode, MessageType.Info, $"{player.Name} 命运降临，回到起点");
        }
        else
        {
            player.Diamonds += 1;
            SendMessage(roomCode, MessageType.Success, $"{player.Name} 命运眷顾，获得 1💎");
        }
    }

    private static void ProcessEmptyCell(string roomCode, GameRoom room, Player player, Cell cell)
    {
        if (cell.FromAuction)
        {
            SendMessage(roomCode, MessageType.Info, $"{player.Name} 踏入拍卖地 [{cell.Name}]（免过路费）");
            return;
        }

        if (cell.Owner != null && cell.Owner != player.Id)
        {
            var owner = room.Players.FirstOrDefault(p => p.Id == cell.Owner);
            if (owner != null && !owner.IsBankrupt)
            {
                var fee = cell.BasePrice * (decimal)Math.Pow(2, cell.Level);
                if (cell.Upgrade == PropertyUpgrade.Agency) fee *= 2;
                var hasAgency = owner.Properties.Any(pid => pid >= 0 && pid < room.Cells.Count && room.Cells[pid].Upgrade == PropertyUpgrade.Agency);
                if (hasAgency) fee *= 2;
                var hasHotel = owner.Properties.Any(pid => pid >= 0 && pid < room.Cells.Count && room.Cells[pid].Upgrade == PropertyUpgrade.Hotel);
                if (hasHotel) fee = Math.Ceiling(fee * 1.1m);
                var appreciation = cell.Appreciation ?? 0;
                fee = Math.Ceiling(fee * (1 + Math.Min(appreciation, 2.0m)));

                if (player.Cash >= fee)
                {
                    player.Cash -= fee;
                    owner.Cash += fee;
                    cell.Appreciation = Math.Min(2.0m, appreciation + 0.02m);
                    SendMessage(roomCode, MessageType.Info, $"{player.Name} 支付过路费 ${fee:N0} 给 {owner.Name}");
                }
                else
                {
                    player.IsBankrupt = true;
                    owner.Cash += player.Cash;
                    owner.Deposit += player.Deposit;
                    player.Cash = 0;
                    player.Deposit = 0;
                    SendMessage(roomCode, MessageType.Error, $"{player.Name} 现金不足，破产!");
                }
            }
        }
    }

    public static bool BuyProperty(string roomCode, Player player, int cellId)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(roomCode, out var room)) return false;
            if (room.Phase != GamePhase.Playing) return false;
            if (room.Players[room.CurrentPlayerIndex].Id != player.Id) return false;

            var cell = room.Cells[cellId];
            if (cell.Type != CellType.Empty) return false;
            if (cell.Owner != null) return false;

            if (player.Cash < cell.Price) return false;

            player.Cash -= cell.Price;
            cell.Owner = player.Id;
            if (!player.Properties.Contains(cellId))
                player.Properties.Add(cellId);

            SendMessage(roomCode, MessageType.Success, $"{player.Name} 购买 [{cell.Name}]，花费 ${cell.Price:N0}");
            return true;
        }
    }

    public static bool UpgradeProperty(string roomCode, Player player, int cellId)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(roomCode, out var room)) return false;
            if (room.Phase != GamePhase.Playing) return false;
            if (room.Players[room.CurrentPlayerIndex].Id != player.Id) return false;

            var cell = room.Cells[cellId];
            if (cell.Owner != player.Id) return false;
            if (cell.Level >= 4) return false;

            var upgradeCost = cell.BasePrice * (decimal)Math.Pow(2, cell.Level);
            if (cell.FromAuction) upgradeCost /= 2;

            if (player.Cash < upgradeCost) return false;

            player.Cash -= upgradeCost;
            cell.Level++;

            SendMessage(roomCode, MessageType.Success, $"{player.Name} 升级 [{cell.Name}] 至 Lv.{cell.Level}");
            return true;
        }
    }

    public static bool BankDeposit(string roomCode, Player player, decimal amount)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(roomCode, out var room)) return false;
            if (amount <= 0) return false;
            if (!player.PassedBank) return false;

            var actualAmount = amount * (1 - GameConstants.BankFeeRate);
            if (player.Cash < amount) return false;

            player.Cash -= amount;
            player.Deposit += actualAmount;

            SendMessage(roomCode, MessageType.Info, $"{player.Name} 存款 ${actualAmount:N0}（手续费 ${amount - actualAmount:N0}）");
            return true;
        }
    }

    public static bool BankWithdraw(string roomCode, Player player, decimal amount)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(roomCode, out var room)) return false;
            if (amount <= 0) return false;
            if (!player.PassedBank) return false;

            var actualAmount = amount * (1 - GameConstants.BankFeeRate);
            if (player.Deposit < amount) return false;

            player.Deposit -= amount;
            player.Cash += actualAmount;

            SendMessage(roomCode, MessageType.Info, $"{player.Name} 取款 ${amount:N0}（到手 ${actualAmount:N0}）");
            return true;
        }
    }

    public static (bool success, string message) BankLoan(string roomCode, Player player, decimal amount)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(roomCode, out var room)) return (false, "房间不存在");
            if (amount <= 0) return (false, "贷款金额必须为正");
            if (!player.PassedBank) return (false, "需要站在银行才能贷款");

            var fee = amount * GameConstants.LoanFeeRate;
            if (player.Cash < fee) return (false, $"手续费不足（需 ${fee:N0}）");

            player.Cash -= fee;
            player.Deposit += amount;

            var loan = new Loan
            {
                Id = Guid.NewGuid().ToString(),
                Amount = amount,
                InterestRate = GameConstants.LoanInterestRate,
                TurnsRemaining = GameConstants.LoanTurnsUntilDue,
                CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };
            player.Loans.Add(loan);

            SendMessage(roomCode, MessageType.Info, $"{player.Name} 贷款 ${amount:N0}（手续费 ${fee:N0}，{GameConstants.LoanTurnsUntilDue}天后到期）");
            return (true, "贷款成功");
        }
    }

    private static void ProcessLoans(string roomCode, GameRoom room)
    {
        foreach (var player in room.Players)
        {
            if (player.Loans.Count == 0) continue;

            foreach (var loan in player.Loans)
            {
                loan.TurnsRemaining--;
            }

            var dueLoans = player.Loans.Where(l => l.TurnsRemaining <= 0).ToList();
            foreach (var loan in dueLoans)
            {
                var totalDue = loan.Amount + Math.Floor(loan.Amount * loan.InterestRate);
                var actualPaid = Math.Min(totalDue, player.Cash + player.Deposit);

                if (actualPaid >= totalDue)
                {
                    if (player.Cash >= totalDue)
                        player.Cash -= totalDue;
                    else
                    {
                        player.Deposit -= (totalDue - player.Cash);
                        player.Cash = 0;
                    }
                    SendMessage(roomCode, MessageType.Success, $"{player.Name} 还清贷款 ${totalDue:N0}");
                }
                else
                {
                    player.IsBankrupt = true;
                    foreach (var propId in player.Properties)
                    {
                        room.Cells[propId].Owner = null;
                        room.Cells[propId].Level = 0;
                    }
                    SendMessage(roomCode, MessageType.Error, $"{player.Name} 贷款到期无法偿还，破产!");
                }
            }

            player.Loans = player.Loans.Where(l => l.TurnsRemaining > 0).ToList();
        }
    }

    private static void ProcessSpecialUpgrades(string roomCode, GameRoom room)
    {
        foreach (var player in room.Players)
        {
            if (player.IsBankrupt) continue;

            foreach (var propId in player.Properties)
            {
                if (propId < 0 || propId >= room.Cells.Count) continue;
                var cell = room.Cells[propId];
                if (cell.Upgrade == PropertyUpgrade.Hotel)
                {
                    var interest = Math.Floor(player.Deposit * 0.05m);
                    player.Deposit += interest;
                    if (interest > 0)
                        SendMessage(roomCode, MessageType.Info, $"🏨 {player.Name} 的酒店收益 +${interest:N0}");
                }
            }
        }
    }

    private static void CheckMarginCall(string roomCode, GameRoom room)
    {
        foreach (var player in room.Players)
        {
            if (player.IsBankrupt) continue;

            foreach (var holding in player.Stocks.Where(h => h.ShortQuantity > 0))
            {
                var stock = room.Stocks.FirstOrDefault(s => s.Symbol == holding.Symbol);
                if (stock == null) continue;

                var notional = stock.Price * holding.ShortQuantity;
                var initialMargin = holding.ShortMarginFrozen;
                var maintenanceMargin = notional * GameConstants.ShortMaintenanceRate;
                var unrealizedLoss = (holding.ShortAvgCost - stock.Price) * holding.ShortQuantity;
                var availableMargin = initialMargin + unrealizedLoss;

                if (availableMargin < maintenanceMargin)
                {
                    var qty = holding.ShortQuantity;
                    var coverCost = stock.Price * qty;

                    if (player.Cash + player.Deposit < coverCost)
                    {
                        player.IsBankrupt = true;
                        SendMessage(roomCode, MessageType.Warning, $"{player.Name} 无法补缴保证金，破产!");
                    }
                    else
                    {
                        GameHelper.DeductFunds(player, coverCost, "auto");
                        player.Deposit += initialMargin;
                        var profit = (holding.ShortAvgCost - stock.Price) * qty;
                        player.Cash += profit;
                        SendMessage(roomCode, MessageType.Warning, $"⚠️ {player.Name} {stock.Name} 触发强制平仓！{(profit >= 0 ? $"获利" : $"亏损")} ${Math.Abs(profit):N0}");
                    }

                    holding.ShortQuantity = 0;
                    holding.ShortAvgCost = 0;
                    holding.ShortMarginFrozen = 0;
                    holding.ShortCashReceived = 0;
                }
            }
        }
    }

    private static void UpdateStockPrices(GameRoom room)
    {
        foreach (var stock in room.Stocks)
        {
            // 初始化历史（首次运行）
            if (stock.History == null || stock.History.Count == 0)
            {
                var price = (double)stock.Base;
                stock.History = new List<KLine>();
                for (int d = 0; d < 20; d++)
                {
                    var chg = (Random.Shared.NextDouble() * 0.20 - 0.10);
                    var open = price;
                    price = Math.Max(1, price * (1 + chg));
                    var close = price;
                    var high = Math.Max(open, close) * (1 + Random.Shared.NextDouble() * 0.05);
                    var low = Math.Min(open, close) * (1 - Random.Shared.NextDouble() * 0.05);
                    stock.History.Add(new KLine
                    {
                        Open = Math.Round((decimal)open, 2),
                        Close = Math.Round((decimal)close, 2),
                        High = Math.Round((decimal)high, 2),
                        Low = Math.Round((decimal)low, 2),
                        Volume = Random.Shared.Next(1000, 10000)
                    });
                }
            }

            // 计算新闻影响
            decimal newsEffect = 0m;
            if (!string.IsNullOrEmpty(stock.News))
            {
                if (stock.News.Contains("预增") || stock.News.Contains("看涨") || stock.News.Contains("利好") ||
                    stock.News.Contains("突破") || stock.News.Contains("大订单") || stock.News.Contains("入选"))
                    newsEffect = 0.12m;
                else if (stock.News.Contains("做空") || stock.News.Contains("不及预期") || stock.News.Contains("减持") ||
                         stock.News.Contains("债务") || stock.News.Contains("调查"))
                    newsEffect = -0.12m;
            }

            var openPrice = (double)stock.Price;
            var baseChange = ((decimal)Random.Shared.NextDouble() - 0.5m) * 0.10m; // ±5%
            var totalChange = baseChange + newsEffect;
            var oldPrice = stock.Price;
            stock.Price = Math.Max(1, stock.Price * (1 + totalChange));
            stock.Change = (stock.Price - stock.Base) / stock.Base * 100;
            stock.LimitUp = stock.Change >= 10;
            stock.LimitDown = stock.Change <= -10;

            // 每日追加K线：影线 ±5%，与初始历史生成一致
            var maxOC = Math.Max(oldPrice, stock.Price);
            var minOC = Math.Min(oldPrice, stock.Price);
            var intraHigh = maxOC * (1 + (decimal)(Random.Shared.NextDouble() * 0.05));
            var intraLow = minOC * (1 - (decimal)(Random.Shared.NextDouble() * 0.05));
            stock.History.Add(new KLine
            {
                Open = Math.Round(oldPrice, 2),
                Close = Math.Round(stock.Price, 2),
                High = Math.Round(intraHigh, 2),
                Low = Math.Round(intraLow, 2),
                Volume = Random.Shared.Next(100000, 1000000)
            });
            if (stock.History.Count > 60) stock.History.RemoveAt(0);

            // 生成新闻
            if (stock.News == null && Random.Shared.NextDouble() < 0.05)
            {
                var isBullish = Random.Shared.NextDouble() > 0.5;
                var templates = isBullish
                    ? new[] {
                        $"{stock.Name} 业绩预增，机构看好！",
                        $"{stock.Name} 获得大订单，后市看涨！",
                        $"{stock.Name} 分红超预期，利好公告！",
                        $"{stock.Name} 技术突破，股价飙升！",
                        $"{stock.Name} 入选指数成分股！"
                    }
                    : new[] {
                        $"{stock.Name} 遭遇做空，警惕风险！",
                        $"{stock.Name} 业绩不及预期，下调评级！",
                        $"{stock.Name} 高管减持，股价承压！",
                        $"{stock.Name} 债务压力加剧！",
                        $"{stock.Name} 面临监管调查！"
                    };
                stock.News = templates[Random.Shared.Next(templates.Length)];
                stock.EventDays = Random.Shared.Next(1, 6);
            }
            else if (stock.EventDays > 0)
            {
                stock.EventDays--;
                if (stock.EventDays == 0) stock.News = null;
            }
        }
    }

    private static void UpdateFuturesPrices(GameRoom room)
    {
        foreach (var futures in room.Futures)
        {
            if (futures.ExpiresInDays > 0)
                futures.ExpiresInDays--;

            var change = ((decimal)Random.Shared.NextDouble() - 0.5m) * futures.Base * futures.Volatility;
            futures.Price = Math.Max(1, futures.Price + change);
            futures.Change = (futures.Price - futures.Base) / futures.Base * 100;
        }
    }

    public static (bool success, string message) BuyStock(string roomCode, Player player, string symbol, int quantity, bool isShort = false)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(roomCode, out var room)) return (false, "房间不存在");
            if (!player.AtStockExchange) return (false, "需要站在股票交易所");
            if (quantity <= 0) return (false, "数量必须为正");

            var stock = room.Stocks.FirstOrDefault(s => s.Symbol == symbol);
            if (stock == null) return (false, "股票不存在");

            var holding = player.Stocks.FirstOrDefault(h => h.Symbol == symbol);
            var cost = stock.Price * quantity;

            if (isShort)
            {
                var marginRequired = cost * GameConstants.ShortInitialMarginRate;
                if (player.Cash + player.Deposit < marginRequired)
                    return (false, $"保证金不足（需 ${marginRequired:N0}）");

                if (holding == null)
                {
                    holding = new StockHolding { Symbol = symbol };
                    player.Stocks.Add(holding);
                }

                holding.ShortQuantity += quantity;
                holding.ShortAvgCost = ((holding.ShortAvgCost * holding.ShortQuantity) + stock.Price * quantity) / holding.ShortQuantity;
                holding.ShortMarginFrozen = cost * GameConstants.ShortInitialMarginRate;
                holding.ShortCashReceived = cost;

                player.Cash += cost;
                SendMessage(roomCode, MessageType.Info, $"{player.Name} 做空 {quantity} 股 {stock.Name} @ ${stock.Price:N2}");
            }
            else
            {
                if (player.Cash < cost)
                    return (false, $"现金不足（需 ${cost:N0}，持有 ${player.Cash:N0}）");

                player.Cash -= cost;

                if (holding == null)
                {
                    holding = new StockHolding { Symbol = symbol };
                    player.Stocks.Add(holding);
                }

                holding.Quantity += quantity;
                holding.AvgCost = ((holding.AvgCost * (holding.Quantity - quantity)) + stock.Price * quantity) / holding.Quantity;

                SendMessage(roomCode, MessageType.Success, $"{player.Name} 买入 {quantity} 股 {stock.Name} @ ${stock.Price:N2}");
            }

            return (true, "交易成功");
        }
    }

    public static (bool success, string message) SellStock(string roomCode, Player player, string symbol, int quantity)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(roomCode, out var room)) return (false, "房间不存在");
            if (!player.AtStockExchange) return (false, "需要站在股票交易所");

            var holding = player.Stocks.FirstOrDefault(h => h.Symbol == symbol);
            if (holding == null || holding.Quantity < quantity)
                return (false, "持仓不足");

            var stock = room.Stocks.FirstOrDefault(s => s.Symbol == symbol);
            if (stock == null) return (false, "股票不存在");

            var proceeds = stock.Price * quantity;
            var profit = (stock.Price - holding.AvgCost) * quantity;

            holding.Quantity -= quantity;
            player.Cash += proceeds;

            if (holding.Quantity == 0)
                player.Stocks.Remove(holding);

            SendMessage(roomCode, MessageType.Success, $"{player.Name} 卖出 {quantity} 股 {stock.Name}，{(profit >= 0 ? $"获利" : $"亏损")} ${Math.Abs(profit):N0}");
            return (true, "交易成功");
        }
    }

    public static void HandleDisconnect(string connectionId)
    {
        lock (_lock)
        {
            if (_connections.TryGetValue(connectionId, out var info))
            {
                if (_rooms.TryGetValue(info.roomCode, out var room))
                {
                    room.Players.RemoveAll(p => p.Id == connectionId);
                    if (room.Players.Count == 0 || (room.Players.Count == 1 && room.Players[0].IsAI))
                    {
                        _rooms.Remove(info.roomCode);
                    }
                    else if (room.Phase == GamePhase.Lobby)
                    {
                        BroadcastState(info.roomCode);
                    }
                }
                _connections.Remove(connectionId);
            }
        }
    }

    private static string GenerateRoomCode()
    {
        var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var code = new char[4];
        for (int i = 0; i < 4; i++)
        {
            code[i] = chars[Random.Shared.Next(chars.Length)];
        }
        return new string(code);
    }

    private static List<Cell> GenerateCells()
    {
        var cells = new List<Cell>();
        var specialPositions = new Dictionary<int, CellType>
        {
            { 0, CellType.Start },
            { 5, CellType.Bank },
            { 16, CellType.Stock },
            { 48, CellType.Futures },
            { 32, CellType.RealEstate }
        };

        var diamondPositions = new[] { 10, 21, 36, 52 };
        var chancePositions = new[] { 3, 7, 11, 18, 23, 27, 33, 38, 42, 46, 53, 58 };
        var destinyPositions = new[] { 15, 25, 39, 55 };

        for (int i = 0; i < GameConstants.TotalCells; i++)
        {
            var cell = new Cell { Id = i };

            if (specialPositions.TryGetValue(i, out var specialType))
            {
                cell.Type = specialType;
                cell.Name = specialType switch
                {
                    CellType.Start => "🚩起点",
                    CellType.Bank => "🏦平安银行",
                    CellType.Stock => "📈股票交易所",
                    CellType.Futures => "🛢️期货交易所",
                    CellType.RealEstate => "🏛️房地产交易中心",
                    _ => ""
                };
            }
            else if (diamondPositions.Contains(i))
            {
                cell.Type = CellType.Diamond;
                cell.Name = "💎钻石";
            }
            else if (chancePositions.Contains(i))
            {
                cell.Type = CellType.Chance;
                cell.Name = "❓机会";
            }
            else if (destinyPositions.Contains(i))
            {
                cell.Type = CellType.Destiny;
                cell.Name = "🎯命运";
            }
            else
            {
                cell.Type = CellType.Empty;
                cell.Name = i < GameConstants.RegionNames.Length ? GameConstants.RegionNames[i] : $"地块{i}";

                if (i >= 32 && i <= 47)
                    cell.BasePrice = Random.Shared.Next(600, 1400);
                else if (i >= 48 && i <= 63)
                    cell.BasePrice = Random.Shared.Next(700, 1700);
                else
                    cell.BasePrice = Random.Shared.Next(1000, 2500);

                cell.Price = cell.BasePrice;
            }

            cells.Add(cell);
        }

        return cells;
    }

    private static List<Stock> GenerateStocks()
    {
        var stocks = new List<Stock>();
        int idx = 0;

        for (int sector = 0; sector < GameConstants.StockNames.Count; sector++)
        {
            foreach (var name in GameConstants.StockNames[sector])
            {
                var basePrice = (decimal)(Random.Shared.NextDouble() * 90 + 10);
                var stock = new Stock
                {
                    Symbol = $"S{idx:D2}",
                    Name = name,
                    Sector = GameConstants.StockSectors[sector],
                    Base = basePrice,
                    Price = basePrice,
                    Change = 0,
                    EventEffect = 1.0m,
                    EventDesc = "无重大事件",
                    History = new List<KLine>()
                };
                // 生成20根历史K线
                var price = (double)basePrice;
                for (int d = 0; d < 20; d++)
                {
                    var chg = (Random.Shared.NextDouble() * 0.20 - 0.10); // ±10%
                    var open = price;
                    price = Math.Max(1, price * (1 + chg));
                    var close = price;
                    var high = Math.Max(open, close) * (1 + Random.Shared.NextDouble() * 0.05);
                    var low = Math.Min(open, close) * (1 - Random.Shared.NextDouble() * 0.05);
                    stock.History.Add(new KLine
                    {
                        Open = Math.Round((decimal)open, 2),
                        Close = Math.Round((decimal)close, 2),
                        High = Math.Round((decimal)high, 2),
                        Low = Math.Round((decimal)low, 2),
                        Volume = Random.Shared.Next(1000, 10000)
                    });
                }
                stocks.Add(stock);
                idx++;
            }
        }

        return stocks;
    }

    private static List<FuturesContract> GenerateFutures()
    {
        var futures = new List<FuturesContract>();
        int idx = 0;

        foreach (var fData in GameConstants.FuturesNames)
        {
            var basePrice = (decimal)(Random.Shared.NextDouble() * 90 + 10);
            var unit = fData["type"] switch
            {
                FuturesType.Gold => 100,
                FuturesType.Silver => 500,
                FuturesType.Diamond => 10,
                FuturesType.Cement => 200,
                FuturesType.Steel => 100,
                FuturesType.Rubber => 500,
                FuturesType.Oil => 1000,
                FuturesType.Wheat => 500,
                _ => 100
            };

            futures.Add(new FuturesContract
            {
                Symbol = $"F{idx:D2}",
                Name = (string)fData["name"]!,
                Type = (FuturesType)fData["type"]!,
                Category = (FuturesCategory)fData["category"]!,
                IsMaterial = (bool)fData["isMaterial"]!,
                Base = basePrice,
                Price = basePrice,
                Unit = unit,
                Volatility = 0.02m,
                LimitThreshold = basePrice * 0.12m,
                ExpiresInDays = Random.Shared.Next(10, 31),
                ExpiresOnDay = Random.Shared.Next(10, 31),
                EventEffect = 1.0m,
                EventDesc = "无重大事件"
            });
            idx++;
        }

        return futures;
    }
}
