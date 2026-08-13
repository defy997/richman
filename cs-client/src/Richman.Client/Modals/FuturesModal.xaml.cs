using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using OxyPlot;
using OxyPlot.Annotations;
using OxyPlot.Axes;
using OxyPlot.Series;
using Richman.Shared;

namespace Richman.Client.Modals;

public class FuturesDisplayItem
{
    public string Icon { get; set; } = "📦";
    public string ShortCode { get; set; } = "?";
    public string Symbol { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    public decimal Change { get; set; }
    public string StatusText { get; set; } = "正常";
    public string ExpiryText { get; set; } = "30天到期";
    public string PriceText => $"${Price:N0}";
    public string ChangeText => $"{(Change >= 0 ? "+" : "")}{Change:F1}%";
    public Brush ChangeBrush => Change >= 0 ? new SolidColorBrush(Color.FromRgb(239, 68, 68)) : new SolidColorBrush(Color.FromRgb(34, 197, 94));
    public FuturesContract? Contract { get; set; }
}

public class HoldingDisplayItem
{
    public string PlayerName { get; set; } = "";
    public SolidColorBrush Color { get; set; } = Brushes.White;
    public SolidColorBrush BorderBrush { get; set; } = Brushes.White;
    public Visibility IsMe { get; set; } = Visibility.Collapsed;
    public string PnlText { get; set; } = "";
    public SolidColorBrush PnlColor { get; set; } = Brushes.White;
    public string PositionText { get; set; } = "";
}

public partial class FuturesModal : Window
{
    public event Action<string, int, string, int>? OnTrade;

    private List<FuturesContract> _futures = new();
    private Player? _player;
    private FuturesDisplayItem? _selected;
    private string _currentAction = "buy";
    private int _leverage = 1;
    private int _quantity = 1;
    private string _currentFilter = "all";

    public FuturesModal()
    {
        InitializeComponent();
    }

    public void Update(List<FuturesContract> futures, Player? player)
    {
        _futures = futures ?? new List<FuturesContract>();
        _player = player;

        try
        {
            if (player != null)
            {
                DiamondCount.Text = player.Diamonds.ToString();
                CementCount.Text = player.Materials.Cement.ToString();
                SteelCount.Text = player.Materials.Steel.ToString();
                DepositText.Text = $"${player.Deposit:N0}";
                CashText.Text = $"${player.Cash:N0}";
            }
            else
            {
                DiamondCount.Text = "0";
                CementCount.Text = "0";
                SteelCount.Text = "0";
                DepositText.Text = "$0";
                CashText.Text = "$0";
            }

            RefreshList();
            RefreshHoldings();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"FuturesModal.Update error: {ex.Message}");
        }
    }

    private void RefreshList()
    {
        try
        {
            if (_futures == null || _futures.Count == 0)
            {
                FuturesGrid.ItemsSource = new List<FuturesDisplayItem>();
                return;
            }

            List<FuturesContract> filtered;
            if (_currentFilter == "all")
            {
                filtered = _futures;
            }
            else
            {
                var cat = _currentFilter switch
                {
                    "precious" => FuturesCategory.Precious,
                    "material" => FuturesCategory.Material,
                    "energy" => FuturesCategory.Energy,
                    "agriculture" => FuturesCategory.Agriculture,
                    _ => FuturesCategory.Precious
                };
                filtered = _futures.Where(f => f.Category == cat).ToList();
            }

            var items = filtered.Select(f => new FuturesDisplayItem
            {
                Icon = GetIcon(f.Type),
                ShortCode = GetShortCode(f.Type),
                Symbol = f.Symbol ?? "?",
                Name = f.Name ?? "?",
                Price = f.Price,
                Change = f.Change,
                StatusText = f.LimitUp ? "🔴 涨停" : f.LimitDown ? "🔵 跌停" : "正常",
                ExpiryText = $"📅 {f.ExpiresInDays}天到期",
                Contract = f
            }).ToList();

            FuturesGrid.ItemsSource = items;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"RefreshList error: {ex.Message}");
            FuturesGrid.ItemsSource = new List<FuturesDisplayItem>();
        }
    }

    private void RefreshHoldings()
    {
        try
        {
            if (_player == null || _futures == null || _futures.Count == 0)
            {
                HoldingsList.ItemsSource = new List<HoldingDisplayItem>();
                return;
            }

            var items = new List<HoldingDisplayItem>();

            if (_player.FuturesHoldings != null)
            {
                foreach (var h in _player.FuturesHoldings)
                {
                    var f = _futures.FirstOrDefault(x => x.Symbol == h.Symbol);
                    if (f == null || (h.LongQuantity == 0 && h.ShortQuantity == 0)) continue;

                    decimal pnl = 0;
                    if (h.LongQuantity > 0) pnl += (f.Price - h.LongAvgCost) * f.Unit * h.LongQuantity;
                    if (h.ShortQuantity > 0) pnl += (h.ShortAvgCost - f.Price) * f.Unit * h.ShortQuantity;

                    var positionText = "";
                    if (h.LongQuantity > 0) positionText += $"多{h.LongQuantity}手 @ ${h.LongAvgCost:N0}";
                    if (h.ShortQuantity > 0)
                    {
                        if (positionText.Length > 0) positionText += " | ";
                        positionText += $"空{h.ShortQuantity}手 @ ${h.ShortAvgCost:N0}";
                    }

                    items.Add(new HoldingDisplayItem
                    {
                        PlayerName = _player.Name ?? "Player",
                        Color = new SolidColorBrush(Color.FromRgb(122, 162, 247)),
                        BorderBrush = new SolidColorBrush(Color.FromRgb(122, 162, 247)),
                        IsMe = Visibility.Visible,
                        PnlText = $"{(pnl >= 0 ? "+" : "")}${pnl:N0}",
                        PnlColor = pnl >= 0 ? new SolidColorBrush(Color.FromRgb(158, 206, 106)) : new SolidColorBrush(Color.FromRgb(247, 118, 142)),
                        PositionText = positionText
                    });
                }
            }

            HoldingsList.ItemsSource = items;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"RefreshHoldings error: {ex.Message}");
            HoldingsList.ItemsSource = new List<HoldingDisplayItem>();
        }
    }

    private string GetIcon(FuturesType type) => type switch
    {
        FuturesType.Gold => "🥇",
        FuturesType.Silver => "🥈",
        FuturesType.Diamond => "💎",
        FuturesType.Cement => "🧱",
        FuturesType.Steel => "🔩",
        FuturesType.Rubber => "⚙️",
        FuturesType.Oil => "🛢️",
        FuturesType.Wheat => "🌾",
        _ => "📦"
    };

    private string GetShortCode(FuturesType type) => type switch
    {
        FuturesType.Gold => "AU",
        FuturesType.Silver => "AG",
        FuturesType.Diamond => "PT",
        FuturesType.Cement => "SN",
        FuturesType.Steel => "GC",
        FuturesType.Rubber => "XJ",
        FuturesType.Oil => "YU",
        FuturesType.Wheat => "XM",
        _ => "?"
    };

    private void FilterCategory_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string category)
        {
            _currentFilter = category;
            UpdateFilterButtons();
            RefreshList();
        }
    }

    private void UpdateFilterButtons()
    {
        var buttons = new[] { (FilterAll, "all"), (FilterPrecious, "precious"), (FilterMaterial, "material"), (FilterEnergy, "energy"), (FilterAgriculture, "agriculture") };
        foreach (var (btn, cat) in buttons)
        {
            btn.Background = _currentFilter == cat
                ? new SolidColorBrush(Color.FromRgb(122, 162, 247))
                : new SolidColorBrush(Color.FromRgb(61, 65, 72));
        }
    }

    private void SelectFutures_Click(object sender, MouseButtonEventArgs e)
    {
        try
        {
            if (sender is Border border && border.DataContext is FuturesDisplayItem item)
            {
                _selected = item;
                _currentAction = "buy";
                ShowDetail();
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"SelectFutures_Click error: {ex.Message}");
        }
    }

    private void ShowDetail()
    {
        if (_selected?.Contract == null)
        {
            FuturesDetail.Visibility = Visibility.Collapsed;
            return;
        }

        try
        {
            FuturesDetail.Visibility = Visibility.Visible;

            var f = _selected.Contract;
            SelectedIcon.Text = GetIcon(f.Type);
            SelectedName.Text = f.Name;
            SelectedInfo.Text = $"基础价 ${f.Base:N0} · {GetCategoryName(f.Category)} · 波动率 {(f.Volatility * 100):F1}%";
            SelectedExpiry.Text = $"📅 合约到期 {f.ExpiresInDays} 天后";
            SelectedPrice.Text = $"${f.Price:N0}";
            SelectedChange.Text = $"{(f.Change >= 0 ? "+" : "")}{f.Change:F2}%";
            SelectedChange.Foreground = f.Change >= 0
                ? new SolidColorBrush(Color.FromRgb(239, 68, 68))   // 红 = 涨（与 K 线一致）
                : new SolidColorBrush(Color.FromRgb(34, 197, 94));  // 绿 = 跌

            // Event message
            if (f.EventDesc != null && f.EventDesc != "无重大事件")
            {
                EventBorder.Visibility = Visibility.Visible;
                EventText.Text = $"📢 {f.EventDesc}（剩余 {f.EventDays} 天）";
            }
            else
            {
                EventBorder.Visibility = Visibility.Collapsed;
            }

            UpdateMyHolding();
            UpdateActionButtons();
            UpdateTradeInfo();
            UpdateChart(f);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"ShowDetail error: {ex.Message}");
        }
    }

    private string GetCategoryName(FuturesCategory category) => category switch
    {
        FuturesCategory.Precious => "贵金属",
        FuturesCategory.Material => "建材",
        FuturesCategory.Energy => "能源",
        FuturesCategory.Agriculture => "农产品",
        _ => ""
    };

    private void UpdateMyHolding()
    {
        if (_player == null || _selected?.Contract == null)
        {
            MyHoldingBorder.Visibility = Visibility.Collapsed;
            return;
        }

        var f = _selected.Contract;
        var holding = _player.FuturesHoldings?.FirstOrDefault(h => h.Symbol == f.Symbol);

        if (holding == null || (holding.LongQuantity == 0 && holding.ShortQuantity == 0))
        {
            MyHoldingBorder.Visibility = Visibility.Collapsed;
            return;
        }

        MyHoldingBorder.Visibility = Visibility.Visible;

        if (holding.LongQuantity > 0)
        {
            LongPositionPanel.Visibility = Visibility.Visible;
            LongQtyText.Text = $"{holding.LongQuantity} 手 @ ${holding.LongAvgCost:N0}";
            var longPnl = (f.Price - holding.LongAvgCost) * f.Unit * holding.LongQuantity;
            LongPnlText.Text = $"盈亏: {(longPnl >= 0 ? "+" : "")}${longPnl:N0}";
            LongPnlText.Foreground = longPnl >= 0
                ? new SolidColorBrush(Color.FromRgb(158, 206, 106))
                : new SolidColorBrush(Color.FromRgb(247, 118, 142));
        }
        else
        {
            LongPositionPanel.Visibility = Visibility.Collapsed;
        }

        if (holding.ShortQuantity > 0)
        {
            ShortPositionPanel.Visibility = Visibility.Visible;
            ShortQtyText.Text = $"{holding.ShortQuantity} 手 @ ${holding.ShortAvgCost:N0}";
            var shortPnl = (holding.ShortAvgCost - f.Price) * f.Unit * holding.ShortQuantity;
            ShortPnlText.Text = $"盈亏: {(shortPnl >= 0 ? "+" : "")}${shortPnl:N0}";
            ShortPnlText.Foreground = shortPnl >= 0
                ? new SolidColorBrush(Color.FromRgb(158, 206, 106))
                : new SolidColorBrush(Color.FromRgb(247, 118, 142));
        }
        else
        {
            ShortPositionPanel.Visibility = Visibility.Collapsed;
        }

        decimal totalPnl = 0;
        if (holding.LongQuantity > 0) totalPnl += (f.Price - holding.LongAvgCost) * f.Unit * holding.LongQuantity;
        if (holding.ShortQuantity > 0) totalPnl += (holding.ShortAvgCost - f.Price) * f.Unit * holding.ShortQuantity;

        TotalPnlText.Text = $"总浮动盈亏: {(totalPnl >= 0 ? "+" : "")}${totalPnl:N0}";
        TotalPnlText.Foreground = totalPnl >= 0
            ? new SolidColorBrush(Color.FromRgb(158, 206, 106))
            : new SolidColorBrush(Color.FromRgb(247, 118, 142));
    }

    private void UpdateChart(FuturesContract f)
    {
        try
        {
            if (f.History == null || f.History.Count == 0) return;

            var model = new PlotModel
            {
                Background = OxyColors.Transparent,
                PlotAreaBorderColor = OxyColor.FromRgb(61, 65, 72),
                TextColor = OxyColor.FromRgb(86, 95, 137)
            };

            // X axis with all labels
            var categoryAxis = new CategoryAxis
            {
                Position = AxisPosition.Bottom,
                AxislineColor = OxyColor.FromRgb(61, 65, 72),
                TicklineColor = OxyColor.FromRgb(61, 65, 72),
                TextColor = OxyColor.FromRgb(86, 95, 137),
                FontSize = 8,
                Angle = 0
            };
            foreach (var label in f.History.Select((_, i) => $"D{i + 1}"))
            {
                categoryAxis.Labels.Add(label);
            }
            model.Axes.Add(categoryAxis);

            // Y axis - 手动设置范围包含所有K线
            var minY = f.History.Min(h => (double)h.Low);
            var maxY = f.History.Max(h => (double)h.High);
            var yPad = Math.Max((maxY - minY) * 0.05, 0.5);
            model.Axes.Add(new LinearAxis
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
            });

            // 自定义蜡烛图：影线（窄矩形）+ 实体（宽矩形）
            var upColor = OxyColor.FromRgb(239, 68, 68);     // 红 = 涨（与股票/React 一致）
            var downColor = OxyColor.FromRgb(34, 197, 94);  // 绿 = 跌（与股票/React 一致）

            for (int i = 0; i < f.History.Count; i++)
            {
                var h = f.History[i];
                var color = h.Close >= h.Open ? upColor : downColor;

                // 影线（high-low）：窄矩形
                model.Annotations.Add(new RectangleAnnotation
                {
                    MinimumX = i - 0.06,
                    MaximumX = i + 0.06,
                    MinimumY = (double)h.Low,
                    MaximumY = (double)h.High,
                    Fill = color,
                    Stroke = OxyColors.Transparent,
                    StrokeThickness = 0,
                    Layer = AnnotationLayer.BelowSeries,
                    Text = ""
                });

                // 实体（open-close）：矩形
                var top = Math.Max((double)h.Open, (double)h.Close);
                var bottom = Math.Min((double)h.Open, (double)h.Close);
                if (top == bottom) top = bottom + 0.01;
                model.Annotations.Add(new RectangleAnnotation
                {
                    MinimumX = i - 0.3,
                    MaximumX = i + 0.3,
                    MinimumY = bottom,
                    MaximumY = top,
                    Fill = OxyColor.FromAColor(220, color),
                    Stroke = color,
                    StrokeThickness = 1,
                    Layer = AnnotationLayer.BelowSeries,
                    Text = ""
                });
            }

            // MA line
            var closes = f.History.Select(h => (double)h.Close).ToList();
            var ma5 = CalculateMA(closes, 5);
            var maLine = new LineSeries
            {
                Color = OxyColor.FromRgb(122, 162, 247),
                StrokeThickness = 1
            };
            for (int i = 0; i < ma5.Count; i++)
            {
                if (ma5[i].HasValue)
                    maLine.Points.Add(new DataPoint(i, ma5[i]!.Value));
            }
            model.Series.Add(maLine);

            FuturesChart.Model = model;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"UpdateChart error: {ex.Message}");
        }
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

    private void SetAction_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string action)
        {
            _currentAction = action;
            UpdateActionButtons();
            UpdateTradeInfo();
        }
    }

    private void UpdateActionButtons()
    {
        BuyBtn.Background = _currentAction == "buy" ? new SolidColorBrush(Color.FromRgb(25, 102, 39)) : new SolidColorBrush(Color.FromRgb(61, 61, 92));
        SellBtn.Background = _currentAction == "sell" ? new SolidColorBrush(Color.FromRgb(196, 71, 71)) : new SolidColorBrush(Color.FromRgb(61, 61, 92));
        CloseBtn.Background = _currentAction == "close" ? new SolidColorBrush(Color.FromRgb(122, 162, 247)) : new SolidColorBrush(Color.FromRgb(61, 61, 92));
        DeliveryBtn.Background = _currentAction == "delivery" ? new SolidColorBrush(Color.FromRgb(234, 179, 8)) : new SolidColorBrush(Color.FromRgb(61, 61, 92));
        ExchangeBtn.Background = _currentAction == "exchange" ? new SolidColorBrush(Color.FromRgb(234, 179, 8)) : new SolidColorBrush(Color.FromRgb(61, 61, 92));
    }

    private void SetLeverage_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && int.TryParse(btn.Tag?.ToString(), out var leverage))
        {
            _leverage = leverage;
            LeverageText.Text = $"{leverage}x";
            UpdateLeverageButtons();
            UpdateTradeInfo();
        }
    }

    private void UpdateLeverageButtons()
    {
        var buttons = new[] { (1, "1"), (2, "2"), (5, "5"), (7, "7"), (10, "10") };
        var btnControls = new[] { FindName("Leverage1") as Button, FindName("Leverage2") as Button,
            FindName("Leverage5") as Button, FindName("Leverage7") as Button, FindName("Leverage10") as Button };
    }

    private void SetQuantity_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && int.TryParse(btn.Tag?.ToString(), out var qty))
        {
            _quantity = qty;
            QuantityText.Text = qty.ToString();
            UpdateTradeInfo();
        }
    }

    private void UpdateTradeInfo()
    {
        if (_selected?.Contract == null) return;

        var f = _selected.Contract;
        var cost = f.Price * f.Unit * _quantity;
        var fee = Math.Floor(cost * 0.02m);
        var margin = _currentAction switch
        {
            "sell" => Math.Ceiling(cost * 0.20m / _leverage),
            _ => Math.Ceiling(cost / _leverage)
        };

        CostText.Text = $"${cost:N0}";
        MarginText.Text = $"${margin:N0}";
        FeeText.Text = $"${fee:N0}";
        FrozenText.Text = $"${(margin + fee):N0}";

        // 交割信息面板 - 仅对建材期货显示
        if (f.IsMaterial && _player != null)
        {
            DeliveryInfoPanel.Visibility = Visibility.Visible;
            UpdateDeliveryInfo(f);
        }
        else
        {
            DeliveryInfoPanel.Visibility = Visibility.Collapsed;
        }

        var actionText = _currentAction switch
        {
            "buy" => "做多",
            "sell" => "做空",
            "close" => "平仓",
            "delivery" => "交割",
            "exchange" => "兑换",
            _ => _currentAction
        };

        ExecuteBtn.Content = $"✅ {actionText} {_quantity} 手（{_leverage}x杠杆）";
    }

    private void UpdateDeliveryInfo(FuturesContract f)
    {
        if (_player == null) return;

        var holding = _player.FuturesHoldings?.FirstOrDefault(h => h.Symbol == f.Symbol);

        // 做多可交割数量
        var longQty = holding?.LongQuantity ?? 0;
        var longCost = (holding?.LongAvgCost ?? f.Price) * longQty;
        LongDeliverableText.Text = $"{longQty} 手";
        LongDeliveryDesc.Text = longQty > 0
            ? $"(需支付 ${longCost:N0} + 释放 ${(holding?.LongFrozenCost ?? 0):N0}保证金)"
            : "(无多头持仓)";

        // 做空需交付数量（需要持有实物）
        var shortQty = holding?.ShortQuantity ?? 0;
        var shortValue = (holding?.ShortAvgCost ?? f.Price) * shortQty;
        var maxDeliverable = GetMaxMaterialForFutures(f.Type);
        ShortDeliveryText.Text = $"{Math.Min(shortQty, maxDeliverable)} 手 / {shortQty} 手可交";
        ShortDeliveryDesc.Text = shortQty > 0
            ? $"(需 {GetMaterialNameForType(f.Type)} x{shortQty}，可获 ${shortValue:N0})"
            : "(无空头持仓)";
    }

    private int GetMaxMaterialForFutures(FuturesType type) => type switch
    {
        FuturesType.Cement => _player?.Materials.Cement ?? 0,
        FuturesType.Steel => _player?.Materials.Steel ?? 0,
        FuturesType.Rubber => _player?.Materials.Rubber ?? 0,
        FuturesType.Diamond => _player?.Diamonds ?? 0,
        FuturesType.Gold or FuturesType.Silver => _player?.Materials.PreciousMetals ?? 0,
        _ => 0
    };

    private string GetMaterialNameForType(FuturesType type) => type switch
    {
        FuturesType.Cement => "水泥",
        FuturesType.Steel => "钢材",
        FuturesType.Rubber => "橡胶",
        FuturesType.Diamond => "钻石",
        FuturesType.Gold or FuturesType.Silver => "贵金属",
        _ => "建材"
    };

    private void ExecuteTrade_Click(object sender, RoutedEventArgs e)
    {
        if (_selected == null) return;

        OnTrade?.Invoke(_selected.Symbol, _quantity, _currentAction, _leverage);
        MessageBox.Show($"{_currentAction} {_selected.Name} x{_quantity}", "交易成功", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void Close_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
