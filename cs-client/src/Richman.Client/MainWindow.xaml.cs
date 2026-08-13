using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using Richman.Client.Modals;
using Richman.Client.ViewModels;
using Richman.Shared;

namespace Richman.Client;

public partial class MainWindow : Window
{
    private readonly LocalGameEngine _gameEngine = new();
    private MainViewModel ViewModel => (MainViewModel)DataContext;
    private StockModal? _stockModal;
    private BankModal? _bankModal;
    private CardModal? _cardModal;
    private RealEstateModal? _realEstateModal;
    private FuturesModal? _futuresModal;
    private MarketModal? _marketModal;
    private readonly DispatcherTimer _diceTimer = new();
    private readonly DispatcherTimer _aiTimer = new();
    private bool _isDiceAnimating;

    public MainWindow()
    {
        InitializeComponent();
        DataContext = new MainViewModel();
        Loaded += MainWindow_Loaded;

        _gameEngine.OnStateChanged += OnGameStateChanged;
        _gameEngine.OnMessage += OnGameMessage;

        _diceTimer.Interval = TimeSpan.FromMilliseconds(100);
        _diceTimer.Tick += DiceTimer_Tick;

        _aiTimer.Interval = TimeSpan.FromMilliseconds(1200);
        _aiTimer.Tick += AiTimer_Tick;
        _aiTimer.Start();

        InitializeCalendar();
        SetupBottomButtons();
    }

    private void SetupBottomButtons()
    {
        StockPanelBtn.MouseLeftButtonDown += (s, e) => OpenStockPanel_Click(s, e);
        FuturesPanelBtn.MouseLeftButtonDown += (s, e) => OpenFuturesPanel_Click(s, e);
        BankPanelBtn.MouseLeftButtonDown += (s, e) => OpenBankPanel_Click(s, e);
        RealEstatePanelBtn.MouseLeftButtonDown += (s, e) => OpenRealEstatePanel_Click(s, e);
        CardPanelBtn.MouseLeftButtonDown += (s, e) => OpenCardPanel_Click(s, e);
    }

    private void GameBoard_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        if (_gameEngine.Room != null)
        {
            DrawBoard(_gameEngine.Room);
        }
    }

    private void InitializeCalendar()
    {
        // Add day headers
        var days = new[] { "日", "一", "二", "三", "四", "五", "六" };
        foreach (var day in days)
        {
            var textBlock = new TextBlock
            {
                Text = day,
                Foreground = new SolidColorBrush(Color.FromRgb(100, 116, 139)),
                FontSize = 9,
                FontWeight = FontWeights.Bold,
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(2)
            };
            CalendarGrid.Children.Add(textBlock);
        }
    }

    private void UpdateCalendar(string dateStr)
    {
        try
        {
            var parts = dateStr.Split('-');
            if (parts.Length < 3) return;

            int year = int.Parse(parts[0]);
            int month = int.Parse(parts[1]);
            int day = int.Parse(parts[2]);

            CalendarDateText.Text = $"{year}年{month}月{day}日";

            // Clear existing day cells (keep headers)
            while (CalendarGrid.Children.Count > 7)
            {
                CalendarGrid.Children.RemoveAt(CalendarGrid.Children.Count - 1);
            }

            var firstDay = new DateTime(year, month, 1).DayOfWeek;
            int daysInMonth = DateTime.DaysInMonth(year, month);

            // Add empty cells before first day
            for (int i = 0; i < (int)firstDay; i++)
            {
                CalendarGrid.Children.Add(new TextBlock { Text = "" });
            }

            // Add day cells
            for (int d = 1; d <= daysInMonth; d++)
            {
                var isCurrentDay = d == day;
                var textBlock = new TextBlock
                {
                    Text = d.ToString(),
                    Foreground = isCurrentDay
                        ? new SolidColorBrush(Colors.White)
                        : new SolidColorBrush(Color.FromRgb(203, 213, 225)),
                    Background = isCurrentDay
                        ? new SolidColorBrush(Color.FromRgb(244, 63, 94))
                        : null,
                    FontSize = 10,
                    TextAlignment = TextAlignment.Center,
                    Margin = new Thickness(2),
                    Padding = new Thickness(4, 2, 4, 2)
                };
                if (isCurrentDay)
                {
                    textBlock.FontWeight = FontWeights.Bold;
                }
                CalendarGrid.Children.Add(textBlock);
            }
        }
        catch { }
    }

    private void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        UpdateUI();
    }

    private void DiceTimer_Tick(object? sender, EventArgs e)
    {
        if (_isDiceAnimating)
        {
            DiceValueText.Text = new Random().Next(1, 7).ToString();
        }
    }

    private void AiTimer_Tick(object? sender, EventArgs e)
    {
        _gameEngine.TriggerAI();
    }

    private void OnGameStateChanged(GameRoom room)
    {
        Dispatcher.Invoke(() =>
        {
            // 每次状态刷新时，如果轮到人类玩家就清除旧的高亮
            var currentPlayer = room.Players[room.CurrentPlayerIndex];
            if (!currentPlayer.IsAI)
            {
                ClearCellHighlight();
                ViewModel.ClearSelection();
            }
            var isMyTurn = currentPlayer.Id == _gameEngine.HumanPlayer?.Id;

            RoomInfoText.Text = $"房间: {room.Code}";
            TurnText.Text = room.CurrentTurn.ToString();
            UpdateCalendar(room.GameDate);

            try
            {
                CurrentPlayerColor.Fill = new SolidColorBrush((Color)ColorConverter.ConvertFromString(currentPlayer.Color));
            }
            catch { }
            CurrentPlayerName.Text = currentPlayer.Name + (currentPlayer.IsAI ? " 🤖" : "");

            // Tonghuashun icon
            TonghuashunIcon.Visibility = currentPlayer.HasTonghuashun ? Visibility.Visible : Visibility.Collapsed;

            MyTurnBadge.Visibility = isMyTurn ? Visibility.Visible : Visibility.Collapsed;

            // Singleplayer badge
            SingleplayerBadge.Visibility = room.Mode == GameMode.Singleplayer ? Visibility.Visible : Visibility.Collapsed;

            // Progress bar
            if (room.Mode == GameMode.Singleplayer && _gameEngine.HumanPlayer != null)
            {
                ProgressPanel.Visibility = Visibility.Visible;
                var progress = Math.Min(100, (double)(_gameEngine.HumanPlayer.TotalAssets / room.TargetAssets) * 100);
                ProgressText.Text = $"${_gameEngine.HumanPlayer.TotalAssets:N0} / ${room.TargetAssets:N0} ({progress:F2}%)";
                ProgressBar.Width = Math.Max(0, (CalendarGrid.ActualWidth) * progress / 100);
            }
            else
            {
                ProgressPanel.Visibility = Visibility.Collapsed;
            }

            // Update my info
            if (_gameEngine.HumanPlayer != null)
            {
                PlayerInfoPanel.Visibility = Visibility.Visible;
                var p = _gameEngine.HumanPlayer;
                try { MyColor.Fill = new SolidColorBrush((Color)ColorConverter.ConvertFromString(p.Color)); } catch { }
                MyName.Text = p.Name;
                MyCash.Text = $"${p.Cash:N0}";
                MyDeposit.Text = $"${p.Deposit:N0}";
                MyDiamonds.Text = p.Diamonds.ToString();

                decimal stockValue = 0;
                foreach (var h in p.Stocks)
                {
                    var stock = room.Stocks.FirstOrDefault(s => s.Symbol == h.Symbol);
                    if (stock != null) stockValue += stock.Price * h.Quantity;
                }
                MyStocks.Text = $"${stockValue:N0}";
                MyProperties.Text = $"{p.Properties.Count}块";

                // 总资产 = 现金 + 存款 + 商品价值（建材按当前市价）+ 钻石当前价值
                decimal goodsValue = 0;
                if (p.Materials != null)
                {
                    goodsValue += p.Materials.Cement * room.CementPrice
                                  + p.Materials.Steel * room.SteelPrice
                                  + p.Materials.Rubber * room.RubberPrice
                                  + p.Materials.PreciousMetals * room.PreciousMetalsPrice;
                }
                goodsValue += p.Diamonds * room.DiamondsPrice;
                decimal total = p.Cash + p.Deposit + goodsValue + stockValue;
                p.TotalAssets = total;
                MyTotalAssets.Text = $"${total:N0}";
            }

            // Other players
            var others = room.Players.Where(pl => pl.Id != _gameEngine.HumanPlayer?.Id).ToList();
            OtherPlayersList.ItemsSource = others;

            // Bottom panel hints
            DiamondCount.Text = $"💎 {(_gameEngine.HumanPlayer?.Diamonds ?? 0)}";
            DepositInfo.Text = $"${(_gameEngine.HumanPlayer?.Deposit ?? 0):N0}";

            // Dice display
            if (room.DiceValue.HasValue)
            {
                DiceDisplay.Visibility = Visibility.Visible;
                DiceValueText.Text = room.DiceValue.Value.ToString();
            }
            else
            {
                DiceDisplay.Visibility = Visibility.Collapsed;
            }

            // Update modals
            _stockModal?.Update(room.Stocks, _gameEngine.HumanPlayer);
            _bankModal?.Update(_gameEngine.HumanPlayer, room);
            _cardModal?.Update(_gameEngine.HumanPlayer, null, true);
            _realEstateModal?.Update(_gameEngine.HumanPlayer, room);
            _futuresModal?.Update(room.Futures, _gameEngine.HumanPlayer);
            _marketModal?.Update(room, _gameEngine.HumanPlayer);

            UpdateUI();
            DrawBoard(room);

            // Check win/lose
            if (room.Phase == GamePhase.Ended)
            {
                WinOverlay.Visibility = Visibility.Collapsed;
                LoseOverlay.Visibility = Visibility.Collapsed;

                if (room.WinnerId == _gameEngine.HumanPlayer?.Id)
                {
                    WinOverlay.Visibility = Visibility.Visible;
                    WinTitle.Text = "亿万富翁达成！";
                    WinIcon.Text = "🎉";
                    WinAssets.Text = $"总资产: ${_gameEngine.HumanPlayer?.TotalAssets:N0}";
                    WinTurns.Text = $"共用 {room.CurrentTurn} 回合达成目标！";
                }
                else
                {
                    LoseOverlay.Visibility = Visibility.Visible;
                }
            }
        });
    }

    private void OnGameMessage(GameMessage message)
    {
        Dispatcher.BeginInvoke(() =>
        {
            ViewModel.Messages.Add(message);

            var logItems = MessageLog.ItemsSource as IList<object> ?? new List<object>();
            var newList = new List<object>(logItems) { message };
            MessageLog.ItemsSource = newList;

            if (MessageLog.Items.Count > 0)
            {
                MessageLog.ScrollIntoView(MessageLog.Items[MessageLog.Items.Count - 1]);
            }

            if (newList.Count > 200) newList.RemoveAt(0);
        });
    }

    private void UpdateUI()
    {
        var room = _gameEngine.Room;
        var isInRoom = room != null;
        var isGameStarted = room?.Phase == GamePhase.Playing;
        var currentPlayer = room?.Players[room.CurrentPlayerIndex];
        var isMyTurn = currentPlayer?.Id == _gameEngine.HumanPlayer?.Id;

        StartBtn.Content = isGameStarted == true ? "重新开始" : "开始";

        RollDiceBtn.IsEnabled = isInRoom && isMyTurn && room?.DiceValue.HasValue != true && isGameStarted;
        EndTurnBtn.IsEnabled = isInRoom && isMyTurn && room?.DiceValue.HasValue == true;

        // 选中格子后，再决定 Buy/Upgrade 是否可用
        bool canBuy = false;
        bool canUpgrade = false;
        string buyHint = "";
        string upgradeHint = "";

        if (room != null && isMyTurn && ViewModel.SelectedCellId >= 0 && ViewModel.SelectedCellId < room.Cells.Count)
        {
            var cell = room.Cells[ViewModel.SelectedCellId];
            var hp = _gameEngine.HumanPlayer;
            if (hp != null && (cell.Type == CellType.RealEstate || cell.Type == CellType.Empty))
            {
                if (cell.Owner == null)
                {
                    // 无主：必须站在该地块并本次停留尚未买过
                    if (hp.Position == ViewModel.SelectedCellId && !cell.HasStopped)
                        canBuy = true;
                    else if (hp.Position != ViewModel.SelectedCellId)
                        buyHint = "需站在该地块才能购买";
                    else
                        buyHint = "本次停留已购买，需再次停留才能再买";
                }
                else if (cell.Owner == hp.Id)
                {
                    // 自己的地：本次停留尚未升级过即可升
                    if (hp.Position == ViewModel.SelectedCellId && !cell.HasStopped && cell.Level < 5)
                        canUpgrade = true;
                    else if (cell.Level >= 5)
                        upgradeHint = "已达顶级，可使用顶级升级";
                    else if (hp.Position != ViewModel.SelectedCellId)
                        upgradeHint = "需站在该地块才能升级";
                    else
                        upgradeHint = "本次停留已升级，需再次停留才能再升";
                }
            }
        }

        // 选中格子 + 自己回合才显示 Buy/Upgrade；点了以后引擎会显示具体原因
        // 这里允许在选中"可买/可升级"以外的合法格子时仍然激活按钮，方便玩家点开看提示
        bool selectedIsActionable = false;
        if (room != null && isMyTurn && ViewModel.SelectedCellId >= 0 && ViewModel.SelectedCellId < room.Cells.Count)
        {
            var selCell = room.Cells[ViewModel.SelectedCellId];
            var selHp = _gameEngine.HumanPlayer;
            if (selHp != null && (selCell.Type == CellType.RealEstate || selCell.Type == CellType.Empty))
            {
                if (selCell.Owner == null || selCell.Owner == selHp.Id)
                    selectedIsActionable = true;
            }
        }

        // 始终允许点 BuyBtn —— 点不动比看不到反馈更糟糕
        // 引擎内部会显示具体失败原因（参数不足、未停留、现金不足等）
        // 唯一禁用场景：游戏未开始或没选格子
        var gameActive = room?.Phase == GamePhase.Playing;
        BuyBtn.IsEnabled = gameActive && ViewModel.SelectedCellId >= 0;
        UpgradeBtn.IsEnabled = gameActive && ViewModel.SelectedCellId >= 0;
        BuyBtn.ToolTip = canBuy ? "购买该地块" : (string.IsNullOrEmpty(buyHint) ? "点击尝试购买（若失败会显示原因）" : buyHint);
        UpgradeBtn.ToolTip = canUpgrade ? "升级该地块" : (string.IsNullOrEmpty(upgradeHint) ? "点击尝试升级（若失败会显示原因）" : upgradeHint);

        if (room != null && ViewModel.SelectedCellId >= 0 && ViewModel.SelectedCellId < room.Cells.Count)
        {
            var cell = room.Cells[ViewModel.SelectedCellId];
            var owner = cell.Owner != null ? GetPlayerName(room, cell.Owner) : "无主";
            SelectedCellInfo.Text = $"【{cell.Name}】价格: ${cell.Price:N0} | 所有者: {owner} Lv.{cell.Level}";

            // 根据地块状态显示浮动操作按钮（非地产类地块也提示，避免用户疑惑为什么买不到）
            var hp = _gameEngine.HumanPlayer;
            if (hp != null && (cell.Type == CellType.RealEstate || cell.Type == CellType.Empty))
            {
                CellActionsPanel.Visibility = Visibility.Visible;

                if (cell.Owner == null)
                {
                    CellBuyBtn.Visibility = Visibility.Visible;
                    CellBuyBtn.IsEnabled = canBuy;
                    CellUpgradeBtn.Visibility = Visibility.Collapsed;
                    CellForceUpgradeBtn.Visibility = Visibility.Collapsed;
                    CellActionHint.Text = buyHint.Length > 0 ? buyHint : (cell.HasStopped && hp.Position == ViewModel.SelectedCellId ? "可购买" : "可购买");
                }
                else if (cell.Owner == hp.Id)
                {
                    CellBuyBtn.Visibility = Visibility.Collapsed;
                    CellUpgradeBtn.Visibility = cell.Level < 5 ? Visibility.Visible : Visibility.Collapsed;
                    CellUpgradeBtn.IsEnabled = canUpgrade;
                    CellForceUpgradeBtn.Visibility = cell.Level < 5 ? Visibility.Visible : Visibility.Collapsed;
                    if (cell.Level == 5)
                        CellActionHint.Text = "已达顶级，可使用建材升级到特殊建筑";
                    else if (upgradeHint.Length > 0)
                        CellActionHint.Text = upgradeHint;
                    else
                        CellActionHint.Text = $"升级费用: ${(cell.BasePrice * 2 * (decimal)Math.Pow(2, cell.Level) * room.InflationMultiplier):N0}";
                }
                else
                {
                    // 他人的地：不能操作，但仍显示提示
                    CellBuyBtn.Visibility = Visibility.Collapsed;
                    CellUpgradeBtn.Visibility = Visibility.Collapsed;
                    CellForceUpgradeBtn.Visibility = Visibility.Collapsed;
                    CellActionHint.Text = $"该地块属于 {owner}，无法操作";
                    CellActionsPanel.Visibility = Visibility.Visible;
                }
            }
            else
            {
                // 非地产类地块（如银行、机会、医院）：显示为何不能买
                CellActionsPanel.Visibility = Visibility.Visible;
                CellBuyBtn.Visibility = Visibility.Collapsed;
                CellUpgradeBtn.Visibility = Visibility.Collapsed;
                CellForceUpgradeBtn.Visibility = Visibility.Collapsed;
                CellActionHint.Text = $"【{cell.Name}】为功能地块，不可购买";
            }
        }
        else
        {
            SelectedCellInfo.Text = "点击地图选择地皮";
            CellActionsPanel.Visibility = Visibility.Collapsed;
        }
    }

    private void DrawBoard(GameRoom room)
    {
        GameBoard.Children.Clear();

        const int margin = 15;
        double boardWidth = GameBoard.ActualWidth > 0 ? GameBoard.ActualWidth : 700;
        double boardHeight = GameBoard.ActualHeight > 0 ? GameBoard.ActualHeight : 600;

        // 16格棋盘（64个位置，4边各16格）
        double maxCellW = (boardWidth - 2 * margin) / 16;
        double maxCellH = (boardHeight - 2 * margin) / 16;
        double cellSize = Math.Min(maxCellW, maxCellH);
        cellSize = Math.Max(48, Math.Min(68, cellSize)); // 增大格子大小

        // 先绘制所有格子
        for (int i = 0; i < 64; i++)
        {
            int x, y;
            if (i < 16) { x = i; y = 0; }
            else if (i < 32) { x = 15; y = i - 16; }
            else if (i < 48) { x = 47 - i; y = 15; }
            else { x = 0; y = 63 - i; }

            double left = margin + x * cellSize;
            double top = margin + y * cellSize;

            var cell = room.Cells[i];
            var cellColor = GetCellColor(cell);

            var rect = new Rectangle
            {
                Width = cellSize - 1,
                Height = cellSize - 1,
                Fill = new SolidColorBrush((Color)ColorConverter.ConvertFromString(cellColor)),
                Stroke = new SolidColorBrush(Colors.White),
                StrokeThickness = 0.5,
                Tag = i,
                RadiusX = 2,
                RadiusY = 2
            };

            Canvas.SetLeft(rect, left);
            Canvas.SetTop(rect, top);

            rect.ToolTip = $"【{cell.Name}】\n价格: ${cell.Price:N0}\n所有者: {(cell.Owner != null ? GetPlayerName(room, cell.Owner) : "无")}\n等级: {cell.Level}";

            rect.MouseLeftButtonDown += (s, e) =>
            {
                int idx = -1;
                if (s is System.Windows.Shapes.Rectangle r && r.Tag is int t) idx = t;
                ViewModel.SelectCell(idx);
                HighlightSelectedCell(idx);
                if (_gameEngine?.Room != null) UpdateUI();
            };

            GameBoard.Children.Add(rect);

            // 解析emoji+中文（如"🏦 银行"），分别绘制
            string? emoji = null;
            string displayName = cell.Name;
            if (cell.Name.Contains(' '))
            {
                var parts = cell.Name.Split(' ', 2);
                emoji = parts[0];
                displayName = parts.Length >= 2 ? parts[1] : parts[0];
            }
            else if (char.IsSurrogate(cell.Name[0]))
            {
                emoji = cell.Name[..2];
                displayName = cell.Name[2..];
            }
            if (displayName.Length > 4) displayName = displayName[..4] + "·";

            // 判断是否为无主普通地块（白底需深色文字）
            var isUnownedRegularCell = (cell.Type == CellType.RealEstate || cell.Type == CellType.Empty) && cell.Owner == null;
            var labelBrush = isUnownedRegularCell
                ? new SolidColorBrush(Color.FromRgb(30, 41, 59))
                : Brushes.White;

            // 顶部emoji图标
            if (!string.IsNullOrEmpty(emoji))
            {
                var emojiBlock = new TextBlock
                {
                    Text = emoji,
                    FontSize = 12,
                    TextAlignment = TextAlignment.Center,
                    Width = cellSize - 2,
                    Foreground = labelBrush
                };
                Canvas.SetLeft(emojiBlock, left + 1);
                Canvas.SetTop(emojiBlock, top + 1);
                GameBoard.Children.Add(emojiBlock);
            }

            var label = new TextBlock
            {
                Text = displayName,
                FontSize = 9,
                Foreground = labelBrush,
                TextAlignment = TextAlignment.Center,
                Width = cellSize - 2,
                FontWeight = FontWeights.Bold,
                TextWrapping = TextWrapping.NoWrap
            };
            Canvas.SetLeft(label, left + 1);
            Canvas.SetTop(label, top + cellSize - 14);
            GameBoard.Children.Add(label);
        }

        // 后绘制玩家标记（确保在最上层）
        foreach (var player in room.Players.Where(p => !p.IsBankrupt))
        {
            int i = player.Position;
            int x, y;
            if (i < 16) { x = i; y = 0; }
            else if (i < 32) { x = 15; y = i - 16; }
            else if (i < 48) { x = 47 - i; y = 15; }
            else { x = 0; y = 63 - i; }

            double left = margin + x * cellSize;
            double top = margin + y * cellSize;

            var ellipse = new Ellipse
            {
                Width = 12,
                Height = 12,
                Fill = new SolidColorBrush((Color)ColorConverter.ConvertFromString(player.Color)),
                Stroke = Brushes.White,
                StrokeThickness = 1.5,
                Tag = $"player_{player.Id}"
            };
            Canvas.SetLeft(ellipse, left + cellSize / 2 - 6);
            Canvas.SetTop(ellipse, top + 2);
            GameBoard.Children.Add(ellipse);
        }

        // 浮动按钮已移除——只保留右侧按钮
    }

    /*
    private void DrawFloatingActionButtons(GameRoom room, double margin, double cellSize)
        if (ViewModel.SelectedCellId < 0 || ViewModel.SelectedCellId >= room.Cells.Count) return;
        if (_gameEngine.HumanPlayer == null) return;
        if (GameBoard.ActualWidth <= 0 || GameBoard.ActualHeight <= 0) return;

        var cell = room.Cells[ViewModel.SelectedCellId];
        var hp = _gameEngine.HumanPlayer;

        int i = ViewModel.SelectedCellId;
        int x, y;
        if (i < 16) { x = i; y = 0; }
        else if (i < 32) { x = 15; y = i - 16; }
        else if (i < 48) { x = 47 - i; y = 15; }
        else { x = 0; y = 63 - i; }

        double cellLeft = margin + x * cellSize;
        double cellTop = margin + y * cellSize;

        // 创建浮动按钮容器
        var panel = new Border
        {
            Background = new SolidColorBrush(Color.FromRgb(10, 14, 39)),
            BorderBrush = new SolidColorBrush(Color.FromRgb(251, 191, 36)),
            BorderThickness = new Thickness(1.5),
            CornerRadius = new CornerRadius(6),
            Padding = new Thickness(8, 6, 8, 6),
            Tag = "floating_actions"
        };

        var stack = new StackPanel { Orientation = Orientation.Vertical };

        // 标题
        stack.Children.Add(new TextBlock
        {
            Text = $"【{cell.Name}】",
            Foreground = Brushes.White,
            FontSize = 11,
            FontWeight = FontWeights.Bold,
            Margin = new Thickness(0, 0, 0, 4)
        });

        bool isOwner = cell.Owner == hp.Id;

        // 非地产类地块：只显示提示，无操作按钮
        if (cell.Type != CellType.RealEstate && cell.Type != CellType.Empty)
        {
            stack.Children.Add(new TextBlock
            {
                Text = $"【{cell.Name}】为功能地块，不可购买",
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                FontSize = 10,
                TextWrapping = TextWrapping.Wrap,
                MaxWidth = 140
            });
        }
        else if (cell.Owner == null)
        {
            // 无主：购买按钮
            bool canBuyNow = cell.HasStopped && hp.Position == ViewModel.SelectedCellId && hp.Cash >= cell.Price * room.InflationMultiplier;
            string hint = !cell.HasStopped ? "需再停留一次才能购买"
                          : hp.Position != ViewModel.SelectedCellId ? "需站在该地块才能购买"
                          : hp.Cash < cell.Price * room.InflationMultiplier ? $"现金不足（需 ${cell.Price * room.InflationMultiplier:N0}）"
                          : "";

            var btn = new Button
            {
                Content = canBuyNow ? $"🏠 购买 ${cell.Price * room.InflationMultiplier:N0}" : "🏠 购买",
                Background = new SolidColorBrush(canBuyNow ? Color.FromRgb(34, 197, 94) : Color.FromRgb(75, 85, 99)),
                Foreground = Brushes.White,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(8, 5, 8, 5),
                FontWeight = FontWeights.Bold,
                FontSize = 10,
                IsEnabled = canBuyNow,
                Cursor = System.Windows.Input.Cursors.Hand,
                Tag = "float_buy"
            };
            btn.Click += (s, e) => _gameEngine.BuyProperty(ViewModel.SelectedCellId);
            stack.Children.Add(btn);

            if (!string.IsNullOrEmpty(hint))
            {
                stack.Children.Add(new TextBlock
                {
                    Text = hint,
                    Foreground = new SolidColorBrush(Color.FromRgb(251, 191, 36)),
                    FontSize = 9,
                    TextWrapping = TextWrapping.Wrap,
                    Margin = new Thickness(0, 3, 0, 0),
                    MaxWidth = 140
                });
            }
        }
        else if (isOwner)
        {
            // 自己的地：升级 + 升级卡
            if (cell.Level < 5)
            {
                bool canUpg = cell.HasStopped && hp.Position == ViewModel.SelectedCellId;
                var cost = cell.BasePrice * 2 * (decimal)Math.Pow(2, cell.Level) * room.InflationMultiplier;
                bool hasCash = hp.Cash >= cost;
                string upgHint = !canUpg
                    ? (hp.Position != ViewModel.SelectedCellId ? "需站在该地块才能升级" : "需再次停留才能升级")
                    : (!hasCash ? $"现金不足（需 ${cost:N0}）" : "");

                var upgradeBtn = new Button
                {
                    Content = canUpg && hasCash ? $"⬆️ 升级 ${cost:N0}" : "⬆️ 升级",
                    Background = new SolidColorBrush(canUpg && hasCash ? Color.FromRgb(245, 158, 11) : Color.FromRgb(75, 85, 99)),
                    Foreground = Brushes.White,
                    BorderThickness = new Thickness(0),
                    Padding = new Thickness(8, 5, 8, 5),
                    FontWeight = FontWeights.Bold,
                    FontSize = 10,
                    IsEnabled = canUpg && hasCash,
                    Cursor = System.Windows.Input.Cursors.Hand,
                    Tag = "float_upgrade"
                };
                upgradeBtn.Click += (s, e) => _gameEngine.UpgradeProperty(ViewModel.SelectedCellId);
                stack.Children.Add(upgradeBtn);

                if (!string.IsNullOrEmpty(upgHint))
                {
                    stack.Children.Add(new TextBlock
                    {
                        Text = upgHint,
                        Foreground = new SolidColorBrush(Color.FromRgb(251, 191, 36)),
                        FontSize = 9,
                        TextWrapping = TextWrapping.Wrap,
                        Margin = new Thickness(0, 3, 0, 0),
                        MaxWidth = 140
                    });
                }
            }

            var forceBtn = new Button
            {
                Content = "🃏 用升级卡升级",
                Background = new SolidColorBrush(Color.FromRgb(139, 92, 246)),
                Foreground = Brushes.White,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(8, 5, 8, 5),
                FontWeight = FontWeights.Bold,
                FontSize = 10,
                Cursor = System.Windows.Input.Cursors.Hand,
                Tag = "float_forceupgrade"
            };
            forceBtn.Click += (s, e) => _gameEngine.ForceUpgradeProperty(ViewModel.SelectedCellId);
            stack.Children.Add(forceBtn);

            if (cell.Level >= 5)
            {
                stack.Children.Add(new TextBlock
                {
                    Text = "已达顶级，可使用建材进行特殊升级",
                    Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                    FontSize = 9,
                    TextWrapping = TextWrapping.Wrap,
                    Margin = new Thickness(0, 3, 0, 0),
                    MaxWidth = 140
                });
            }
        }
        else
        {
            // 他人的地
            var ownerName = room.Players.FirstOrDefault(p => p.Id == cell.Owner)?.Name ?? "其他玩家";
            stack.Children.Add(new TextBlock
            {
                Text = $"该地块属于 {ownerName}，无法操作",
                Foreground = new SolidColorBrush(Color.FromRgb(248, 113, 113)),
                FontSize = 10,
                TextWrapping = TextWrapping.Wrap,
                MaxWidth = 140
            });
        }

        panel.Child = stack;

        // 强制 layout 让 DesiredSize 准确
        panel.Measure(new Size(160, double.PositiveInfinity));
        double panelW = panel.DesiredSize.Width > 0 ? panel.DesiredSize.Width : 150;
        double panelH = panel.DesiredSize.Height > 0 ? panel.DesiredSize.Height : 60;

        // 定位策略：格子右侧 → 下方 → 上方
        double canvasW = GameBoard.ActualWidth;
        double canvasH = GameBoard.ActualHeight;
        double panelLeft = cellLeft + cellSize + 6;
        double panelTop = cellTop;

        if (panelLeft + panelW > canvasW - 4)
        {
            panelLeft = Math.Max(4, cellLeft + cellSize / 2 - panelW / 2);
            panelTop = cellTop + cellSize + 6;
        }
        if (panelTop + panelH > canvasH - 4)
        {
            panelTop = Math.Max(4, cellTop - panelH - 6);
        }
        if (panelLeft < 4) panelLeft = 4;
        if (panelTop < 4) panelTop = 4;
        // 二次裁剪（保险）
        if (panelLeft + panelW > canvasW - 4) panelLeft = Math.Max(4, canvasW - panelW - 4);
        if (panelTop + panelH > canvasH - 4) panelTop = Math.Max(4, canvasH - panelH - 4);

        Canvas.SetLeft(panel, panelLeft);
        Canvas.SetTop(panel, panelTop);
        Panel.SetZIndex(panel, 9999);
        GameBoard.Children.Add(panel);
    }
    */

    private void HighlightSelectedCell(int cellId)
    {
        foreach (var child in GameBoard.Children)
        {
            if (child is System.Windows.Shapes.Rectangle rect)
            {
                if (rect.Tag is int tag && tag == cellId)
                {
                    rect.Stroke = new SolidColorBrush(Colors.Yellow);
                    rect.StrokeThickness = 3;
                }
                else
                {
                    rect.Stroke = new SolidColorBrush(Colors.White);
                    rect.StrokeThickness = 0.5;
                }
            }
        }
    }

    private void ClearCellHighlight()
    {
        HighlightSelectedCell(-1);
    }

    private string GetCellColor(Cell cell)
    {
        // 已购地块显示所有者颜色
        if (cell.Owner != null && (cell.Type == CellType.RealEstate || cell.Type == CellType.Empty))
            return GetOwnerColor(cell.Owner);

        return cell.Type switch
        {
            CellType.Start => "#22c55e",
            CellType.Bank => "#3b82f6",
            CellType.Stock => "#f59e0b",
            CellType.Futures => "#8b5cf6",
            CellType.Diamond => "#ec4899",
            CellType.Chance => "#fbbf24",
            CellType.Destiny => "#06b6d4",
            CellType.Tax => "#ef4444",
            CellType.Jail => "#64748b",
            CellType.FreeParking => "#10b981",
            CellType.GoToJail => "#dc2626",
            CellType.Material => "#84cc16",
            CellType.Insurance => "#14b8a6",
            CellType.Museum => "#f97316",
            CellType.Hospital => "#f43f5e",
            CellType.Park => "#22c55e",
            CellType.Market => "#f97316",
            // 房地产空地统一白色
            CellType.RealEstate => "#ffffff",
            CellType.Empty => "#ffffff",
            _ => "#374151"
        };
    }

    private string GetOwnerColor(string ownerId)
    {
        var player = _gameEngine.Room?.Players.FirstOrDefault(p => p.Id == ownerId);
        return player?.Color ?? "#374151";
    }

    private string GetPlayerName(GameRoom room, string playerId)
    {
        var player = room.Players.FirstOrDefault(p => p.Id == playerId);
        return player?.Name ?? "未知";
    }

    // Button Handlers
    private void StartSingleplayer_Click(object sender, RoutedEventArgs e)
    {
        var playerName = string.IsNullOrWhiteSpace(PlayerNameBox.Text) ? "玩家" : PlayerNameBox.Text;
        _gameEngine.StartSingleplayer(playerName, 3);
        _gameEngine.StartGame();
    }

    private void RollDice_Click(object sender, RoutedEventArgs e)
    {
        if (_isDiceAnimating) return;
        _isDiceAnimating = true;
        _diceTimer.Start();

        Task.Delay(500).ContinueWith(_ =>
        {
            Dispatcher.Invoke(() =>
            {
                _isDiceAnimating = false;
                _diceTimer.Stop();
                _gameEngine.RollDice();
            });
        });
    }

    private void EndTurn_Click(object sender, RoutedEventArgs e)
    {
        ClearCellHighlight();
        ViewModel.ClearSelection();
        _gameEngine.EndTurn();
    }

    private void BuyProperty_Click(object sender, RoutedEventArgs e) => CellBuyBtn_Click(sender, e);

    private void UpgradeProperty_Click(object sender, RoutedEventArgs e) => CellUpgradeBtn_Click(sender, e);

    private void CellBuyBtn_Click(object sender, RoutedEventArgs e)
    {
        if (ViewModel.SelectedCellId < 0) return;
        if (_gameEngine.Room == null || ViewModel.SelectedCellId >= _gameEngine.Room.Cells.Count) return;
        _gameEngine.BuyProperty(ViewModel.SelectedCellId);
    }

    private void CellUpgradeBtn_Click(object sender, RoutedEventArgs e)
    {
        if (ViewModel.SelectedCellId < 0) return;
        _gameEngine.UpgradeProperty(ViewModel.SelectedCellId);
    }

    private void CellForceUpgradeBtn_Click(object sender, RoutedEventArgs e)
    {
        if (ViewModel.SelectedCellId < 0) return;
        _gameEngine.ForceUpgradeProperty(ViewModel.SelectedCellId);
    }

    private void RestartGame_Click(object sender, RoutedEventArgs e)
    {
        WinOverlay.Visibility = Visibility.Collapsed;
        LoseOverlay.Visibility = Visibility.Collapsed;
        var playerName = string.IsNullOrWhiteSpace(PlayerNameBox.Text) ? "玩家" : PlayerNameBox.Text;
        _gameEngine.StartSingleplayer(playerName, 3);
        _gameEngine.StartGame();
    }

    // Modal Handlers
    private void OpenStockPanel_Click(object sender, RoutedEventArgs e)
    {
        if (_stockModal == null || !_stockModal.IsLoaded)
        {
            _stockModal = new StockModal();
            _stockModal.OnTrade += (symbol, qty, action, leverage) =>
            {
                switch (action)
                {
                    case "buy": _gameEngine.BuyStock(symbol, qty, leverage); break;
                    case "sell": _gameEngine.SellStock(symbol, qty); break;
                    case "short": _gameEngine.ShortStock(symbol, qty, leverage); break;
                    case "cover": _gameEngine.CoverShort(symbol, qty); break;
                }
            };
            _stockModal.OnTradeComplete += () =>
            {
                // 交易后刷新面板（持仓/K线可能变化）
                _stockModal.Update(_gameEngine.Room?.Stocks ?? new List<Stock>(), _gameEngine.HumanPlayer, _gameEngine.Room?.Players);
            };
            _stockModal.OnBuyTonghuashun += () => _gameEngine.BuyTonghuashun();
            _stockModal.Owner = this;
        }
        _stockModal?.Update(_gameEngine.Room?.Stocks ?? new List<Stock>(), _gameEngine.HumanPlayer, _gameEngine.Room?.Players);
        _stockModal?.Show();
    }

    private void OpenFuturesPanel_Click(object sender, RoutedEventArgs e)
    {
        if (_futuresModal == null || !_futuresModal.IsLoaded)
        {
            _futuresModal = new FuturesModal();
            _futuresModal.OnTrade += (symbol, qty, action, leverage) =>
            {
                switch (action)
                {
                    case "buy":
                        _gameEngine.BuyFutures(symbol, qty, leverage);
                        break;
                    case "sell":
                        _gameEngine.ShortFutures(symbol, qty, leverage);
                        break;
                    case "close":
                        _gameEngine.CloseFutures(symbol, qty, 1);
                        break;
                    case "close_short":
                        _gameEngine.CloseFutures(symbol, qty, -1);
                        break;
                    case "delivery":
                        _gameEngine.DeliverFutures(symbol, qty, true);
                        break;
                    case "delivery_short":
                        _gameEngine.DeliverFutures(symbol, qty, false);
                        break;
                }
            };
            _futuresModal.Owner = this;
        }
        _futuresModal?.Update(_gameEngine.Room?.Futures ?? new List<FuturesContract>(), _gameEngine.HumanPlayer);
        _futuresModal?.Show();
    }

    private void OpenBankPanel_Click(object sender, RoutedEventArgs e)
    {
        if (_bankModal == null || !_bankModal.IsLoaded)
        {
            _bankModal = new BankModal();
            _bankModal.OnDeposit += amount => _gameEngine.BankDeposit(amount);
            _bankModal.OnWithdraw += amount => _gameEngine.BankWithdraw(amount);
            _bankModal.OnTakeLoan += amount => _gameEngine.TakeLoan(amount);
        }
        _bankModal?.Update(_gameEngine.HumanPlayer, _gameEngine.Room);
        _bankModal?.Show();
    }

    private void OpenMarketPanel_Click(object sender, RoutedEventArgs e)
    {
        if (_marketModal == null || !_marketModal.IsLoaded)
        {
            _marketModal = new MarketModal();
            _marketModal.OnPurchase += (kind, qty) => _gameEngine.BuyFromMarket(kind, qty);
            _marketModal.Owner = this;
        }
        _marketModal?.Update(_gameEngine.Room, _gameEngine.HumanPlayer);
        _marketModal?.Show();
    }

    private void OpenRealEstatePanel_Click(object sender, RoutedEventArgs e)
    {
        if (_realEstateModal == null || !_realEstateModal.IsLoaded)
        {
            _realEstateModal = new RealEstateModal();
            _realEstateModal.OnUpgrade += cellId => _gameEngine.UpgradeProperty(cellId);
            _realEstateModal.OnBid += bid => _gameEngine.BidAuction(bid);
            _realEstateModal.OnUpgradeCommercial += id => _gameEngine.UpgradeCommercialProperty(id);
            _realEstateModal.OnSellToCenter += cellId => _gameEngine.SellPropertyToCenter(cellId);
        }
        _realEstateModal?.Update(_gameEngine.HumanPlayer, _gameEngine.Room);
        _realEstateModal?.Show();
    }

    private void OpenCardPanel_Click(object sender, RoutedEventArgs e)
    {
        if (_cardModal == null || !_cardModal.IsLoaded)
        {
            _cardModal = new CardModal();
            _cardModal.OnUseCard += (cardName, target, extra) =>
            {
                if (extra != null)
                    _gameEngine.UseCard(cardName, $"{target}:{extra}");
                else
                    _gameEngine.UseCard(cardName, target);
            };
            _cardModal.OnBuyCard += cardName => _gameEngine.BuyCard(cardName);
        }

        var isMyTurn = _gameEngine.Room?.Players[_gameEngine.Room.CurrentPlayerIndex]?.Id == _gameEngine.HumanPlayer?.Id;
        _cardModal?.Update(_gameEngine.HumanPlayer, _gameEngine.Room?.Stocks, isMyTurn);
        _cardModal?.Show();
    }
}
