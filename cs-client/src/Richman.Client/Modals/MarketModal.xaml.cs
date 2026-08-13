using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Richman.Shared;

namespace Richman.Client.Modals;

public class MarketDisplayItem
{
    public string Icon { get; set; } = "📦";
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    public decimal Change { get; set; }
    public string PriceText => $"${Price:N0}";
    public string ChangeText => $"{(Change >= 0 ? "+" : "")}{Change:F1}%";
    public Brush ChangeBrush => Change >= 0
        ? new SolidColorBrush(Color.FromRgb(239, 68, 68))      // 红 = 涨（与 K 线规则一致）
        : new SolidColorBrush(Color.FromRgb(34, 197, 94));     // 绿 = 跌
    public MaterialKind Kind { get; set; }
}

public partial class MarketModal : Window
{
    public event Action<MaterialKind, int>? OnPurchase;

    private Player? _player;
    private GameRoom? _room;
    private readonly Dictionary<MaterialKind, MarketDisplayItem> _items = new();
    private readonly Dictionary<MaterialKind, int> _quantities = new();
    private int _currentDay = 1;

    public MarketModal()
    {
        InitializeComponent();
    }

    public void Update(GameRoom? room, Player? player)
    {
        _room = room;
        _player = player;
        if (room == null) return;
        _currentDay = room.CurrentTurn;

        DayText.Text = $"第{_currentDay}天 · 通胀 ×{room.InflationMultiplier:F2}";

        // 宏观因子面板
        var ec = room.MacroEconomicCycle;
        var inf = room.MacroInflation;
        var risk = room.MacroRiskAppetite;
        string Macro(double v) => v >= 0.3 ? "📈" : v <= -0.3 ? "📉" : "➖";
        MacroText.Text = $"宏观: 经济周期 {Macro((double)ec)} {ec:+0.00;-0.00;0.00} · 通胀 {Macro((double)inf)} {inf:+0.00;-0.00;0.00} · 风险偏好 {Macro((double)risk)} {risk:+0.00;-0.00;0.00}";

        // 板块指数
        var buildingAvg = (room.CementPrice + room.SteelPrice + room.RubberPrice) / 3m;
        var preciousAvg = (room.PreciousMetalsPrice + room.DiamondsPrice) / 2m;
        BuildingSectorText.Text = $"🏗️ 建材指数: ${buildingAvg:N0}";
        PreciousSectorText.Text = $"🥇 贵金属指数: ${preciousAvg:N0}";

        // 更新资源显示
        if (player != null)
        {
            CashText.Text = $"${player.Cash:N0}";
            DiamondText.Text = player.Diamonds.ToString();
            CementText.Text = player.Materials.Cement.ToString();
            SteelText.Text = player.Materials.Steel.ToString();
        }
        else
        {
            CashText.Text = "$0";
            DiamondText.Text = "0";
            CementText.Text = "0";
            SteelText.Text = "0";
        }

        // 计算昨日价格用于显示涨跌
        var yesterday = room.MarketPriceHistory.Count >= 2
            ? room.MarketPriceHistory[^2]
            : null;

        _items[MaterialKind.Cement] = new MarketDisplayItem
        {
            Icon = "🏗️",
            Name = "水泥",
            Price = room.CementPrice,
            Change = yesterday != null && yesterday.CementPrice > 0
                ? (room.CementPrice - yesterday.CementPrice) / yesterday.CementPrice * 100
                : 0,
            Kind = MaterialKind.Cement
        };
        _items[MaterialKind.Steel] = new MarketDisplayItem
        {
            Icon = "🔩",
            Name = "钢材",
            Price = room.SteelPrice,
            Change = yesterday != null && yesterday.SteelPrice > 0
                ? (room.SteelPrice - yesterday.SteelPrice) / yesterday.SteelPrice * 100
                : 0,
            Kind = MaterialKind.Steel
        };
        _items[MaterialKind.Rubber] = new MarketDisplayItem
        {
            Icon = "🌳",
            Name = "橡胶",
            Price = room.RubberPrice,
            Change = yesterday != null && yesterday.RubberPrice > 0
                ? (room.RubberPrice - yesterday.RubberPrice) / yesterday.RubberPrice * 100
                : 0,
            Kind = MaterialKind.Rubber
        };
        _items[MaterialKind.PreciousMetals] = new MarketDisplayItem
        {
            Icon = "🥇",
            Name = "贵金属",
            Price = room.PreciousMetalsPrice,
            Change = yesterday != null && yesterday.PreciousMetalsPrice > 0
                ? (room.PreciousMetalsPrice - yesterday.PreciousMetalsPrice) / yesterday.PreciousMetalsPrice * 100
                : 0,
            Kind = MaterialKind.PreciousMetals
        };
        _items[MaterialKind.Diamond] = new MarketDisplayItem
        {
            Icon = "💎",
            Name = "钻石",
            Price = room.DiamondsPrice,
            Change = yesterday != null && yesterday.DiamondsPrice > 0
                ? (room.DiamondsPrice - yesterday.DiamondsPrice) / yesterday.DiamondsPrice * 100
                : 0,
            Kind = MaterialKind.Diamond
        };

        RefreshList();
        UpdateTotal();
    }

    private void RefreshList()
    {
        GoodsList.Children.Clear();
        foreach (var item in _items.Values)
        {
            var row = CreateGoodsRow(item);
            GoodsList.Children.Add(row);
        }
    }

    private Border CreateGoodsRow(MarketDisplayItem item)
    {
        var row = new Border
        {
            Background = new SolidColorBrush(Color.FromRgb(26, 27, 38)),
            CornerRadius = new CornerRadius(4),
            Padding = new Thickness(8),
            Margin = new Thickness(0, 0, 0, 6)
        };

        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(100) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(80) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(120) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(120) });

        // 商品名
        var namePanel = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        namePanel.Children.Add(new TextBlock
        {
            Text = item.Icon,
            FontSize = 16,
            VerticalAlignment = VerticalAlignment.Center
        });
        namePanel.Children.Add(new TextBlock
        {
            Text = item.Name,
            Foreground = Brushes.White,
            FontSize = 13,
            FontWeight = FontWeights.Bold,
            Margin = new Thickness(8, 0, 0, 0),
            VerticalAlignment = VerticalAlignment.Center
        });
        Grid.SetColumn(namePanel, 0);
        grid.Children.Add(namePanel);

        // 价格
        var priceBlock = new TextBlock
        {
            Text = item.PriceText,
            Foreground = Brushes.White,
            FontSize = 13,
            FontWeight = FontWeights.Bold,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Center
        };
        Grid.SetColumn(priceBlock, 1);
        grid.Children.Add(priceBlock);

        // 涨跌
        var changeBlock = new TextBlock
        {
            Text = item.ChangeText,
            Foreground = item.ChangeBrush,
            FontSize = 11,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Center
        };
        Grid.SetColumn(changeBlock, 2);
        grid.Children.Add(changeBlock);

        // 数量选择
        var qtyPanel = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };

        var minusBtn = new Button
        {
            Content = "−",
            Width = 26,
            Height = 26,
            Tag = item.Kind,
            Background = new SolidColorBrush(Color.FromRgb(61, 61, 92)),
            Foreground = Brushes.White,
            BorderThickness = new Thickness(0),
            FontSize = 14,
            FontWeight = FontWeights.Bold
        };
        minusBtn.Click += MinusBtn_Click;

        var qtyText = new TextBlock
        {
            Text = "0",
            Foreground = Brushes.White,
            FontSize = 13,
            FontWeight = FontWeights.Bold,
            Width = 40,
            TextAlignment = TextAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(4, 0, 4, 0),
            Tag = $"qty_{item.Kind}"
        };

        var plusBtn = new Button
        {
            Content = "+",
            Width = 26,
            Height = 26,
            Tag = item.Kind,
            Background = new SolidColorBrush(Color.FromRgb(34, 197, 94)),
            Foreground = Brushes.White,
            BorderThickness = new Thickness(0),
            FontSize = 14,
            FontWeight = FontWeights.Bold
        };
        plusBtn.Click += PlusBtn_Click;

        qtyPanel.Children.Add(minusBtn);
        qtyPanel.Children.Add(qtyText);
        qtyPanel.Children.Add(plusBtn);

        Grid.SetColumn(qtyPanel, 3);
        grid.Children.Add(qtyPanel);

        // 购买按钮
        var buyBtn = new Button
        {
            Content = "购买",
            Background = new SolidColorBrush(Color.FromRgb(122, 162, 247)),
            Foreground = Brushes.White,
            BorderThickness = new Thickness(0),
            Padding = new Thickness(10, 5, 10, 5),
            FontSize = 11,
            FontWeight = FontWeights.Bold,
            Tag = item.Kind,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };
        buyBtn.Click += BuyBtn_Click;
        Grid.SetColumn(buyBtn, 4);
        grid.Children.Add(buyBtn);

        row.Child = grid;
        return row;
    }

    private void PlusBtn_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is MaterialKind kind)
        {
            if (!_quantities.ContainsKey(kind)) _quantities[kind] = 0;
            if (_quantities[kind] < 99) _quantities[kind]++;
            RefreshList();
            UpdateTotal();
        }
    }

    private void MinusBtn_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is MaterialKind kind)
        {
            if (!_quantities.ContainsKey(kind)) _quantities[kind] = 0;
            if (_quantities[kind] > 0) _quantities[kind]--;
            RefreshList();
            UpdateTotal();
        }
    }

    private void BuyBtn_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is MaterialKind kind)
        {
            var qty = _quantities.GetValueOrDefault(kind, 0);
            if (qty <= 0) return;
            OnPurchase?.Invoke(kind, qty);
            _quantities[kind] = 0;
            RefreshList();
            UpdateTotal();
        }
    }

    private void UpdateTotal()
    {
        decimal total = 0;
        foreach (var kv in _quantities)
        {
            if (_items.TryGetValue(kv.Key, out var item))
                total += item.Price * kv.Value;
        }
        TotalText.Text = $"选中商品合计: ${total:N0}";
    }
}