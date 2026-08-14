using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using OxyPlot;
using OxyPlot.Annotations;
using OxyPlot.Axes;
using OxyPlot.Series;
using Richman.Shared;

namespace Richman.Client.Modals;

public class StockDisplayItem
{
    public string Symbol { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    public string PriceText => $"${Price:F2}";
    public decimal Change { get; set; }
    public string ChangeText => $"{(Change >= 0 ? "+" : "")}{Change:F2}%";
    public bool IsDown => Change < 0;
    public string StatusText { get; set; } = "";
    public string HoldingText { get; set; } = "无人持仓";
    public Stock? Stock { get; set; }
}

public class HoldingDisplayItem2
{
    public string Name { get; set; } = "";
    public string ColorHex { get; set; } = "#ffffff";
    public SolidColorBrush Color => new((Color)ColorConverter.ConvertFromString(ColorHex));
    public string ForeColorHex { get; set; } = "#d1d5db";
    public SolidColorBrush ForeColor => new((Color)ColorConverter.ConvertFromString(ForeColorHex));
    public Visibility IsMe { get; set; } = Visibility.Collapsed;
    public string LongText { get; set; } = "";
    public string ShortText { get; set; } = "";
    public Visibility HasLong { get; set; } = Visibility.Collapsed;
    public Visibility HasShort { get; set; } = Visibility.Collapsed;
}

public partial class StockModal : Window
{
    public event Action<string, int, string, int>? OnTrade; // symbol, qty, action, leverage
    public event Action? OnBuyTonghuashun;
    public event Action? OnTradeComplete;

    private List<Stock> _allStocks = new();
    private List<Stock> _filteredStocks = new();
    private Stock? _selectedStock;
    private Player? _player;
    private string _currentAction = "buy";
    private int _quantity = 1;
    private int _leverage = 1;
    private List<Player> _allPlayers = new();

    public StockModal()
    {
        InitializeComponent();

        // Initialize charts
        InitializeKLineChart();
        InitializeVolumeChart();
        InitializeMACDChart();
    }

    public void Update(List<Stock> stocks, Player? player, List<Player>? allPlayers = null)
    {
        _allStocks = stocks;
        _player = player;
        _allPlayers = allPlayers ?? new List<Player>();

        // 重置选中状态，避免残留旧股票
        _selectedStock = null;

        // Update sectors
        var sectors = new List<string> { "全部" };
        sectors.AddRange(_allStocks.Select(s => s.Sector).Distinct());
        SectorList.ItemsSource = sectors;
        if (SectorList.SelectedIndex < 0) SectorList.SelectedIndex = 0;

        // Update Tonghuashun banner
        TonghuashunBanner.Visibility = (player?.AtStockExchange == true && player?.HasTonghuashun != true) ? Visibility.Visible : Visibility.Collapsed;

        ApplyFilter();
        // 默认选中第一只股票，确保 _selectedStock 不为 null
        if (StockList.Items.Count > 0 && StockList.SelectedIndex < 0)
        {
            StockList.SelectedIndex = 0;
        }
        RefreshDetail();
    }

    private void ApplyFilter()
    {
        var selectedSector = SectorList.SelectedItem as string ?? "全部";
        _filteredStocks = selectedSector == "全部"
            ? _allStocks
            : _allStocks.Where(s => s.Sector == selectedSector).ToList();

        var items = _filteredStocks.Select(s =>
        {
            var stockItem = new StockDisplayItem
            {
                Symbol = s.Symbol,
                Name = s.Name,
                Price = s.Price,
                Change = s.Change,
                Stock = s
            };

            // Status - 涨停跌停公开，📢 仅在有权限时显示
            var canSeePrivate = (_player?.AtStockExchange == true) || (_player?.HasTonghuashun == true);
            var statusParts = new List<string>();
            if (s.LimitUp) statusParts.Add("涨停");
            if (s.LimitDown) statusParts.Add("跌停");
            if (canSeePrivate && !string.IsNullOrEmpty(s.EventDesc) && s.EventDesc != "无重大事件") statusParts.Add("📢");
            stockItem.StatusText = string.Join("", statusParts);

            // Holdings
            var holdingCount = 0;
            foreach (var p in _allPlayers)
            {
                var h = p.Stocks.FirstOrDefault(st => st.Symbol == s.Symbol);
                if (h != null) holdingCount += h.Quantity + h.ShortQuantity;
            }
            stockItem.HoldingText = holdingCount > 0 ? $"×{holdingCount}" : "无人持仓";

            return stockItem;
        }).ToList();

        StockList.ItemsSource = items;
    }

    private void RefreshDetail()
    {
        if (_selectedStock == null)
        {
            DetailPanel.Visibility = Visibility.Collapsed;
            EmptyState.Visibility = Visibility.Visible;
            return;
        }

        DetailPanel.Visibility = Visibility.Visible;
        EmptyState.Visibility = Visibility.Collapsed;

        var s = _selectedStock;
        DetailName.Text = s.Name;
        DetailPrice.Text = $"${s.Price:F2}";
        DetailChange.Text = $"{(s.Change >= 0 ? "+" : "")}{s.Change:F2}%";
        // ✅ 跟 K 线颜色规则一致：涨红跌绿（A 股惯例）
        DetailChange.Foreground = s.Change >= 0
            ? new SolidColorBrush(Color.FromRgb(239, 68, 68))   // 红 = 涨
            : new SolidColorBrush(Color.FromRgb(34, 197, 94));  // 绿 = 跌
        DetailInfo.Text = $"{s.Sector} · {s.Symbol} · 基础价 ${s.Base:F2}";

        var canSeePrivate = (_player?.AtStockExchange == true) || (_player?.HasTonghuashun == true);

        if (!string.IsNullOrEmpty(s.EventDesc) && s.EventDesc != "无重大事件")
        {
            DetailEvent.Text = $"📢 {s.EventDesc}";
            DetailEvent.Visibility = Visibility.Visible;
        }
        else
        {
            DetailEvent.Visibility = Visibility.Collapsed;
        }

        // Per-stock news: 只有在交易所或有同花顺时才能看到个股消息
        if (!string.IsNullOrEmpty(s.News) && canSeePrivate)
        {
            var tail = s.EventDays > 1 ? $"（剩余 {s.EventDays} 天）" : s.EventDays == 1 ? "（今日最后一天）" : "";
            DetailNews.Text = $"📰 {s.News}{tail}";
            DetailNews.Foreground = new SolidColorBrush(Color.FromRgb(251, 191, 36));
            DetailNews.Visibility = Visibility.Visible;
        }
        else
        {
            DetailNews.Visibility = Visibility.Collapsed;
        }

        // News bar (bottom): always show market sentiment + other stocks' news
        UpdateNewsBar(s);

        // Update charts
        UpdateKLineChart(s);
        UpdateVolumeChart(s);
        UpdateMACDChart(s);

        // Player holdings
        UpdatePlayerHoldings(s);

        // My holdings
        UpdateMyHolding(s);

        // Trade info
        UpdateTradeInfo();
    }

    // 始终显示 NewsBar：优先个股 News，否则显示市场整体动态
    private void UpdateNewsBar(Stock s)
    {
        NewsBar.Visibility = Visibility.Visible;
        var canSeePrivate = (_player?.AtStockExchange == true) || (_player?.HasTonghuashun == true);

        // 1. 个股 News 优先（只在有权限时显示）
        if (!string.IsNullOrEmpty(s.News) && canSeePrivate)
        {
            var tail = s.EventDays > 1 ? $"（剩余 {s.EventDays} 天）" : "（今日最后一天）";
            NewsText.Text = $"📰 {s.News}{tail}";
            NewsText.Foreground = new SolidColorBrush(Color.FromRgb(251, 191, 36)); // 黄色
            return;
        }

        // 2. 计算市场整体情绪：基于全部股票的 Change 分布
        var allStocks = _allStocks ?? new List<Stock>();
        if (allStocks.Count == 0)
        {
            NewsText.Text = "📊 暂无市场数据";
            NewsText.Foreground = new SolidColorBrush(Color.FromRgb(156, 163, 175));
            return;
        }

        var upCount = allStocks.Count(x => x.Change > 0);
        var downCount = allStocks.Count(x => x.Change < 0);
        var flatCount = allStocks.Count(x => x.Change == 0);
        var total = allStocks.Count;

        // 找出当前 News 列表（最多展示 3 条）- 只在有权限时包含个股 News
        var newsCandidates = canSeePrivate
            ? allStocks.Where(x => !string.IsNullOrEmpty(x.News))
            : Enumerable.Empty<Stock>();
        var liveNews = newsCandidates
            .Select(x => new { x.News, x.EventDays })
            .Take(3)
            .ToList();

        string sentiment;
        Color color;
        if (upCount > downCount * 1.3m)
        {
            sentiment = "市场整体偏多 🟢";
            color = Color.FromRgb(239, 68, 68); // 红（A 股惯例：涨=红）
        }
        else if (downCount > upCount * 1.3m)
        {
            sentiment = "市场整体偏空 🔴";
            color = Color.FromRgb(34, 197, 94); // 绿（A 股惯例：跌=绿）
        }
        else
        {
            sentiment = "市场震荡整理 🟡";
            color = Color.FromRgb(251, 191, 36); // 黄
        }

        NewsText.Foreground = new SolidColorBrush(color);

        if (liveNews.Count > 0)
        {
            // 有其他股票的 News：拼接出来
            var head = $"📊 {sentiment} · 今日 {upCount} 涨 {flatCount} 平 {downCount} 跌 · 市场要闻：";
            var tail = string.Join(" ｜ ", liveNews.Select(n =>
                n.EventDays > 1 ? $"{n.News}(剩{n.EventDays}天)" : n.News));
            NewsText.Text = head + tail;
        }
        else if (canSeePrivate)
        {
            // 有权限但当前股票无 News
            NewsText.Text = $"📊 {sentiment} · 今日 {upCount} 涨 {flatCount} 平 {downCount} 跌 · 当前 {s.Name} 暂无个股消息";
        }
        else
        {
            // 无权限
            NewsText.Text = $"📊 {sentiment} · 今日 {upCount} 涨 {flatCount} 平 {downCount} 跌 · 🔒 个股消息需进入交易所或购买同花顺";
        }
    }

    private void UpdatePlayerHoldings(Stock s)
    {
        var items = new List<HoldingDisplayItem2>();

        foreach (var p in _allPlayers)
        {
            var h = p.Stocks.FirstOrDefault(st => st.Symbol == s.Symbol);
            if (h == null || (h.Quantity == 0 && h.ShortQuantity == 0)) continue;

            items.Add(new HoldingDisplayItem2
            {
                Name = p.Name,
                ColorHex = p.Color,
                ForeColorHex = p.Color,
                IsMe = p.Id == _player?.Id ? Visibility.Visible : Visibility.Collapsed,
                LongText = h.Quantity > 0 ? $"多{h.Quantity}" : "",
                ShortText = h.ShortQuantity > 0 ? $"空{h.ShortQuantity}" : "",
                HasLong = h.Quantity > 0 ? Visibility.Visible : Visibility.Collapsed,
                HasShort = h.ShortQuantity > 0 ? Visibility.Visible : Visibility.Collapsed
            });
        }

        PlayerHoldingsList.ItemsSource = items;
    }

    private void UpdateMyHolding(Stock s)
    {
        var h = _player?.Stocks.FirstOrDefault(st => st.Symbol == s.Symbol);
        if (h == null || (h.Quantity == 0 && h.ShortQuantity == 0))
        {
            MyHoldingPanel.Visibility = Visibility.Collapsed;
            return;
        }

        MyHoldingPanel.Visibility = Visibility.Visible;
        MyLongQty.Text = h.Quantity.ToString();
        MyShortQty.Text = h.ShortQuantity.ToString();
        MyLongCost.Text = $"${h.AvgCost:F2}";
        MyShortCost.Text = $"${h.ShortAvgCost:F2}";

        // Long P&L
        if (h.Quantity > 0)
        {
            MyPnlPanel.Visibility = Visibility.Visible;
            var longPnl = (s.Price - h.AvgCost) * h.Quantity;
            MyLongPnl.Text = $"{(longPnl >= 0 ? "+" : "")}${longPnl:F0}";
            MyLongPnl.Foreground = longPnl >= 0
                ? new SolidColorBrush(Color.FromRgb(34, 197, 94))
                : new SolidColorBrush(Color.FromRgb(239, 68, 68));
        }
        else
        {
            MyPnlPanel.Visibility = Visibility.Collapsed;
        }

        // Short defense
        if (h.ShortQuantity > 0)
        {
            ShortDefensePanel.Visibility = Visibility.Visible;
            var shrQty = h.ShortQuantity;
            var notional = s.Price * shrQty;
            var initialMargin = h.ShortMarginFrozen > 0 ? h.ShortMarginFrozen : notional * 0.5m;
            var maintenanceMargin = notional * 0.3m;
            var unrealizedLoss = (h.ShortAvgCost - s.Price) * shrQty;
            var availableMargin = initialMargin + unrealizedLoss;
            var healthRatio = maintenanceMargin > 0 ? availableMargin / maintenanceMargin : 1;
            var shortPnl = (h.ShortAvgCost - s.Price) * shrQty * h.ShortLeverage;
            // 全部平仓预估：买回成本 vs 返还保证金（含盈亏杠杆效应）
            var allCoverCost = s.Price * shrQty;
            var allMarginReturn = h.ShortMarginFrozen;
            var allPnlEst = shortPnl;
            var coverEstStr = $"{allPnlEst:+#;-#;0}（返${allMarginReturn:N0}）";

            ShortInitialMargin.Text = $"${initialMargin:N0}";
            ShortMaintenance.Text = $"${maintenanceMargin:N0}";
            ShortAvailable.Text = $"${availableMargin:N0}";
            ShortHealth.Text = $"{(healthRatio * 100):F0}%";
            ShortPnl.Text = $"{(shortPnl >= 0 ? "+" : "")}${shortPnl:N0}";
            ShortCoverEstimate.Text = coverEstStr;

            var isDanger = healthRatio < 1.5m;
            var isCritical = healthRatio < 1.0m;

            ShortAvailable.Foreground = isCritical
                ? new SolidColorBrush(Color.FromRgb(239, 68, 68))
                : isDanger ? new SolidColorBrush(Color.FromRgb(249, 115, 22))
                : new SolidColorBrush(Color.FromRgb(34, 197, 94));

            ShortHealth.Text = $"{(healthRatio * 100):F0}%";
            if (isCritical) ShortHealth.Text += " 🚨";
            else if (isDanger) ShortHealth.Text += " ⚠️";

            ShortPnl.Foreground = shortPnl >= 0
                ? new SolidColorBrush(Color.FromRgb(34, 197, 94))
                : new SolidColorBrush(Color.FromRgb(239, 68, 68));
        }
        else
        {
            ShortDefensePanel.Visibility = Visibility.Collapsed;
        }
    }

    private void UpdateTradeInfo()
    {
        if (_selectedStock == null) return;

        var s = _selectedStock;
        var h = _player?.Stocks.FirstOrDefault(x => x.Symbol == s.Symbol);

        string info;
        if (_currentAction == "cover")
        {
            // 平空：显示盈亏和返还保证金（默认填最大可平数量）
            var coverable = h?.ShortQuantity ?? 0;
            var qty = Math.Min(_quantity, coverable);
            if (qty == 0)
            {
                info = "⚠️ 当前无做空持仓，无需平仓";
            }
            else
            {
                var coverCost = s.Price * qty;
                var marginReturn = h!.ShortMarginFrozen * qty / h.ShortQuantity;
                var pnl = (h.ShortAvgCost - s.Price) * qty;
                var pnlStr = pnl >= 0 ? $"+${pnl:N0}" : $"-${-pnl:N0}";
                info = $"💰 买回需付: ${coverCost:N0}\n📊 浮动盈亏: {pnlStr}\n🔓 返还保证金: ${marginReturn:N0}";
            }
        }
        else
        {
            info = _currentAction switch
            {
                "buy" => $"💰 保证金(从存款): ${s.Price * _quantity / _leverage:N0}（{_leverage}x杠杆）\n现金留给地皮交易",
                "sell" => $"💵 获得: ${s.Price * _quantity:N0} → 存款",
                "short" => $"💵 获得现金: ${s.Price * _quantity:N0}\n🔒 保证金(从存款): ${s.Price * _quantity / _leverage:N0}（{_leverage}x杠杆）",
                _ => ""
            };
        }
        TradeInfo.Text = info;

        var actionText = _currentAction switch
        {
            "buy" => "买入",
            "sell" => "卖出",
            "short" => "做空",
            "cover" => "平空",
            _ => _currentAction
        };

        ExecuteBtn.Content = $"确认{actionText}";

        LeveragePanel.Visibility = (_currentAction == "buy" || _currentAction == "short") ? Visibility.Visible : Visibility.Collapsed;
    }

    // Charts
    private void InitializeKLineChart()
    {
        var model = new PlotModel
        {
            Background = OxyColors.Transparent,
            PlotAreaBorderColor = OxyColor.FromRgb(55, 65, 81),
            TextColor = OxyColor.FromRgb(156, 163, 175)
        };

        model.Axes.Add(new CategoryAxis
        {
            Position = AxisPosition.Bottom,
            AxislineColor = OxyColor.FromRgb(55, 65, 81),
            TicklineColor = OxyColor.FromRgb(55, 65, 81),
            TextColor = OxyColor.FromRgb(107, 114, 128),
            AxislineStyle = LineStyle.None,
            TickStyle = TickStyle.None
        });

        model.Axes.Add(new LinearAxis
        {
            Position = AxisPosition.Left,
            AxislineColor = OxyColor.FromRgb(55, 65, 81),
            TicklineColor = OxyColor.FromRgb(55, 65, 81),
            TextColor = OxyColor.FromRgb(107, 114, 128),
            MajorGridlineColor = OxyColor.FromRgb(31, 41, 55),
            MajorGridlineStyle = LineStyle.Solid,
            MajorGridlineThickness = 1,
            AxislineStyle = LineStyle.None,
            TickStyle = TickStyle.None,
            MajorStep = 1
        });

        KLineChart.Model = model;
    }

    private void InitializeVolumeChart()
    {
        var model = new PlotModel
        {
            Background = OxyColors.Transparent,
            PlotAreaBorderColor = OxyColor.FromRgb(55, 65, 81),
            TextColor = OxyColor.FromRgb(156, 163, 175)
        };

        model.Axes.Add(new CategoryAxis
        {
            Position = AxisPosition.Bottom,
            AxislineColor = OxyColor.FromRgb(55, 65, 81),
            TicklineColor = OxyColor.FromRgb(55, 65, 81),
            TextColor = OxyColor.FromRgb(107, 114, 128),
            AxislineStyle = LineStyle.None,
            TickStyle = TickStyle.None,
            IsAxisVisible = false
        });

        model.Axes.Add(new LinearAxis
        {
            Position = AxisPosition.Left,
            AxislineStyle = LineStyle.None,
            TickStyle = TickStyle.None,
            IsAxisVisible = false
        });

        VolumeChart.Model = model;
    }

    private void InitializeMACDChart()
    {
        var model = new PlotModel
        {
            Background = OxyColors.Transparent,
            PlotAreaBorderColor = OxyColor.FromRgb(55, 65, 81),
            TextColor = OxyColor.FromRgb(156, 163, 175)
        };

        model.Axes.Add(new CategoryAxis
        {
            Position = AxisPosition.Bottom,
            AxislineColor = OxyColor.FromRgb(55, 65, 81),
            TicklineColor = OxyColor.FromRgb(55, 65, 81),
            TextColor = OxyColor.FromRgb(107, 114, 128),
            AxislineStyle = LineStyle.None,
            TickStyle = TickStyle.None,
            IsAxisVisible = false
        });

        model.Axes.Add(new LinearAxis
        {
            Position = AxisPosition.Left,
            AxislineStyle = LineStyle.None,
            TickStyle = TickStyle.None,
            IsAxisVisible = false
        });

        MACDChart.Model = model;
    }

    private void UpdateKLineChart(Stock s)
    {
        if (s.History == null || s.History.Count == 0) return;

        var closes = s.History.Select(h => (double)h.Close).ToList();

        var model = new PlotModel
        {
            Background = OxyColors.Transparent,
            PlotAreaBorderColor = OxyColor.FromRgb(61, 65, 72),
            TextColor = OxyColor.FromRgb(86, 95, 137)
        };

        // X axis - 用 LinearAxis 让 RectangleAnnotation 对齐（CategoryAxis 会有 data-coordinate 错位）
        var xAxis = new LinearAxis
        {
            Position = AxisPosition.Bottom,
            Minimum = -0.5,
            Maximum = s.History.Count - 0.5,
            MajorStep = 1,
            MinimumMajorStep = 1,
            MajorGridlineStyle = LineStyle.None,
            MinorGridlineStyle = LineStyle.None,
            AxislineColor = OxyColor.FromRgb(61, 65, 72),
            TicklineColor = OxyColor.FromRgb(61, 65, 72),
            TextColor = OxyColor.FromRgb(86, 95, 137),
            FontSize = 8,
            Angle = 0,
            LabelFormatter = x => $"D{(int)System.Math.Round(x) + 1}"
        };
        model.Axes.Add(xAxis);

        // Y axis - 手动设置范围包含所有K线的最高最低（避免annotation超出）
        var minY = s.History.Min(h => (double)h.Low);
        var maxY = s.History.Max(h => (double)h.High);
        var yPad = Math.Max((maxY - minY) * 0.05, 0.5);
        var yAxis = new LinearAxis
        {
            Position = AxisPosition.Left,
            Minimum = minY - yPad,
            Maximum = maxY + yPad,
            AxislineColor = OxyColor.FromRgb(61, 65, 72),
            TicklineColor = OxyColor.FromRgb(61, 65, 72),
            TextColor = OxyColor.FromRgb(86, 95, 137),
            MajorGridlineColor = OxyColor.FromRgb(36, 40, 59),
            MajorGridlineStyle = LineStyle.Solid,
            FontSize = 8
        };
        model.Axes.Add(yAxis);

        // 蜡烛图：使用 OxyPlot 内置的 CandleStickSeries（和 ECharts candlestick 完全等价）
        // 实体 + 影线颜色自动跟随涨跌，与 React 端 ECharts 行为一致
        var upColor = OxyColor.FromRgb(239, 68, 68);     // 红 = 涨 (与 React #ef4444 一致)
        var downColor = OxyColor.FromRgb(34, 197, 94);  // 绿 = 跌 (与 React #22c55e 一致)

        var candleSeries = new CandleStickSeries
        {
            IncreasingColor = upColor,
            DecreasingColor = downColor,
            Color = OxyColor.FromRgb(120, 130, 150),    // 中性（doji/open=close 用）
            StrokeThickness = 1,
            CandleWidth = 0.6
        };
        for (int i = 0; i < s.History.Count; i++)
        {
            var h = s.History[i];
            candleSeries.Items.Add(new HighLowItem
            {
                X = i,
                High = (double)h.High,
                Low = (double)h.Low,
                Open = (double)h.Open,
                Close = (double)h.Close
            });
        }
        model.Series.Add(candleSeries);

        // MA5 line
        var ma5 = CalculateMA(closes, 5);
        var ma5Series = new LineSeries
        {
            Color = OxyColor.FromRgb(96, 165, 250),
            StrokeThickness = 1
        };
        for (int i = 0; i < ma5.Count; i++)
        {
            if (ma5[i].HasValue) ma5Series.Points.Add(new DataPoint(i, ma5[i]!.Value));
        }
        model.Series.Add(ma5Series);

        // MA10 line
        var ma10 = CalculateMA(closes, 10);
        var ma10Series = new LineSeries
        {
            Color = OxyColor.FromRgb(251, 191, 36),
            StrokeThickness = 1
        };
        for (int i = 0; i < ma10.Count; i++)
        {
            if (ma10[i].HasValue) ma10Series.Points.Add(new DataPoint(i, ma10[i]!.Value));
        }
        model.Series.Add(ma10Series);

        // MA20 line
        var ma20 = CalculateMA(closes, 20);
        var ma20Series = new LineSeries
        {
            Color = OxyColor.FromRgb(167, 139, 250),
            StrokeThickness = 1
        };
        for (int i = 0; i < ma20.Count; i++)
        {
            if (ma20[i].HasValue) ma20Series.Points.Add(new DataPoint(i, ma20[i]!.Value));
        }
        model.Series.Add(ma20Series);

        KLineChart.Model = model;
    }

    private void UpdateVolumeChart(Stock s)
    {
        if (s.History == null || s.History.Count == 0) return;

        var model = new PlotModel
        {
            Background = OxyColors.Transparent,
            PlotAreaBorderColor = OxyColor.FromRgb(61, 65, 72),
            TextColor = OxyColor.FromRgb(86, 95, 137)
        };

        var categoryAxis = new CategoryAxis
        {
            Position = AxisPosition.Bottom,
            IsAxisVisible = false,
            Key = "x"
        };
        for (int i = 0; i < s.History.Count; i++)
        {
            categoryAxis.Labels.Add($"D{i + 1}");
        }
        model.Axes.Add(categoryAxis);

        model.Axes.Add(new LinearAxis
        {
            Position = AxisPosition.Left,
            IsAxisVisible = false,
            Key = "y"
        });

        // Volume bars - 红色上涨，绿色下跌
        for (int i = 0; i < s.History.Count; i++)
        {
            var h = s.History[i];
            var color = h.Close >= h.Open ? OxyColor.FromRgb(239, 68, 68) : OxyColor.FromRgb(34, 197, 94);
            var lineSeries = new LineSeries
            {
                Color = color,
                StrokeThickness = 3
            };
            lineSeries.Points.Add(new DataPoint(i, 0));
            lineSeries.Points.Add(new DataPoint(i, (double)h.Volume));
            model.Series.Add(lineSeries);
        }

        VolumeChart.Model = model;
    }

    private void UpdateMACDChart(Stock s)
    {
        if (s.History == null || s.History.Count == 0) return;

        var closes = s.History.Select(h => (double)h.Close).ToList();

        // Calculate EMA
        var emaFast = CalculateEMA(closes, 12);
        var emaSlow = CalculateEMA(closes, 26);
        var dif = new List<double?>();
        for (int i = 0; i < closes.Count; i++)
        {
            dif.Add(emaFast[i].HasValue && emaSlow[i].HasValue ? emaFast[i].Value - emaSlow[i].Value : null);
        }

        var dea = CalculateEMA(dif.Where(d => d.HasValue).Select(d => d!.Value).ToList(), 9);

        var macd = new List<double?>();
        int deaIdx = 0;
        for (int i = 0; i < closes.Count; i++)
        {
            if (dif[i].HasValue && deaIdx < dea.Count)
            {
                macd.Add(2 * (dif[i]!.Value - dea[deaIdx]));
                deaIdx++;
            }
            else
            {
                macd.Add(null);
            }
        }

        var model = new PlotModel
        {
            Background = OxyColors.Transparent,
            PlotAreaBorderColor = OxyColor.FromRgb(61, 65, 72),
            TextColor = OxyColor.FromRgb(86, 95, 137)
        };

        var categoryAxis = new CategoryAxis
        {
            Position = AxisPosition.Bottom,
            IsAxisVisible = false,
            Key = "x"
        };
        for (int i = 0; i < macd.Count; i++)
        {
            categoryAxis.Labels.Add($"D{i + 1}");
        }
        model.Axes.Add(categoryAxis);

        model.Axes.Add(new LinearAxis
        {
            Position = AxisPosition.Left,
            IsAxisVisible = false,
            Key = "y"
        });

        // MACD bars - draw thick vertical lines
        for (int i = 0; i < macd.Count; i++)
        {
            if (!macd[i].HasValue) continue;
            var val = macd[i]!.Value;
            var color = val >= 0 ? OxyColor.FromRgb(239, 68, 68) : OxyColor.FromRgb(34, 197, 94);
            var lineSeries = new LineSeries
            {
                Color = color,
                StrokeThickness = 3
            };
            lineSeries.Points.Add(new DataPoint(i, 0));
            lineSeries.Points.Add(new DataPoint(i, val));
            model.Series.Add(lineSeries);
        }

        MACDChart.Model = model;
    }

    private List<double?> CalculateMA(List<double> data, int period)
    {
        var result = new List<double?>();
        for (int i = 0; i < data.Count; i++)
        {
            if (i + 1 < period)
            {
                result.Add(null);
            }
            else
            {
                double sum = 0;
                for (int j = i + 1 - period; j <= i; j++) sum += data[j];
                result.Add(Math.Round(sum / period, 2));
            }
        }
        return result;
    }

    private List<double?> CalculateEMA(List<double> data, int period)
    {
        var result = new List<double?>();
        double? prevEma = null;
        double k = 2.0 / (period + 1);

        foreach (var p in data)
        {
            if (!prevEma.HasValue)
            {
                prevEma = p;
            }
            else
            {
                prevEma = p * k + prevEma.Value * (1 - k);
            }
            result.Add(prevEma.HasValue ? Math.Round(prevEma.Value, 4) : null);
        }
        return result;
    }

    // Event handlers
    private void SectorList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        ApplyFilter();
    }

    private void StockList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (StockList.SelectedItem is StockDisplayItem item)
        {
            _selectedStock = item.Stock;
            RefreshDetail();
        }
    }

    private void SetAction_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string action)
        {
            _currentAction = action;
            UpdateActionButtons();

            // 平空时：默认填最大可平数量
            if (action == "cover" && _selectedStock != null)
            {
                var h = _player?.Stocks.FirstOrDefault(x => x.Symbol == _selectedStock.Symbol);
                if (h != null && h.ShortQuantity > 0)
                {
                    _quantity = h.ShortQuantity;
                    UpdateQuantityButtons();
                }
            }

            UpdateTradeInfo();
        }
    }

    private void UpdateActionButtons()
    {
        BuyBtn.Background = _currentAction == "buy" ? new SolidColorBrush(Color.FromRgb(34, 197, 94)) : new SolidColorBrush(Color.FromRgb(55, 65, 81));
        SellBtn.Background = _currentAction == "sell" ? new SolidColorBrush(Color.FromRgb(59, 130, 246)) : new SolidColorBrush(Color.FromRgb(55, 65, 81));
        ShortBtn.Background = _currentAction == "short" ? new SolidColorBrush(Color.FromRgb(249, 115, 22)) : new SolidColorBrush(Color.FromRgb(55, 65, 81));
        CoverBtn.Background = _currentAction == "cover" ? new SolidColorBrush(Color.FromRgb(147, 51, 234)) : new SolidColorBrush(Color.FromRgb(55, 65, 81));
        UpdateQuantityButtons();
    }

    private void UpdateQuantityButtons()
    {
        // 通过Tag值匹配数量按钮，动态变色
        foreach (var child in ((Panel)Qty1Btn.Parent).Children)
        {
            if (child is Button btn && btn.Tag is string tagStr && int.TryParse(tagStr, out var tag))
            {
                var active = _quantity == tag;
                btn.Background = active
                    ? new SolidColorBrush(Color.FromRgb(244, 63, 94))   // 选中红色
                    : new SolidColorBrush(Color.FromRgb(55, 65, 81));   // 灰色
                btn.Foreground = active
                    ? Brushes.White
                    : new SolidColorBrush(Color.FromRgb(209, 213, 219));
            }
        }
    }

    private void SetQuantity_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && int.TryParse(btn.Tag?.ToString(), out var qty))
        {
            _quantity = qty;
            UpdateQuantityButtons();
            UpdateTradeInfo();
        }
    }

    private void LeverageSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        _leverage = (int)LeverageSlider.Value;
        LeverageText.Text = $"{_leverage}x";
        UpdateTradeInfo();
    }

    private void ExecuteTrade_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedStock == null) return;
        OnTrade?.Invoke(_selectedStock.Symbol, _quantity, _currentAction, _leverage);
        OnTradeComplete?.Invoke();
    }

    private void BuyTonghuashun_Click(object sender, RoutedEventArgs e)
    {
        OnBuyTonghuashun?.Invoke();
    }

    private void Close_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
