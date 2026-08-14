using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using Richman.Shared;

namespace Richman.Client.Modals;

public class CardDisplayItem
{
    public string CardName { get; set; } = "";
    public string Icon { get; set; } = "🎴";
    public string Name { get; set; } = "";
    public string Desc { get; set; } = "";
    public int Price { get; set; }
    public string DisplayName => $"{Icon} {Name}";
    public Color GradientStart { get; set; }
    public Color GradientEnd { get; set; }
    public bool CanBuy { get; set; }
}

public partial class CardModal : Window
{
    public event Action<string, string?, string?>? OnUseCard;
    public event Action<string>? OnBuyCard;

    private Player? _player;
    private List<Stock> _stocks = new();
    private CardDisplayItem? _selectedCard;
    private string? _selectedTarget;
    private string? _rumorDirection;
    private bool _isMyTurn;

    private readonly Dictionary<string, CardDisplayItem> _allCards = new()
    {
        { "停留卡", new CardDisplayItem { CardName = "停留卡", Icon = "⏸️", Name = "停留卡", Desc = "在原地多停留一次（再获得一次买/升级机会）", Price = 40, GradientStart = Color.FromRgb(37, 99, 235), GradientEnd = Color.FromRgb(29, 78, 216) } },
        { "骰子卡", new CardDisplayItem { CardName = "骰子卡", Icon = "🎲", Name = "骰子卡", Desc = "指定下一次骰子点数 (1-6)", Price = 30, GradientStart = Color.FromRgb(124, 58, 237), GradientEnd = Color.FromRgb(109, 40, 217) } },
        { "均贫卡", new CardDisplayItem { CardName = "均贫卡", Icon = "⚖️", Name = "均贫卡", Desc = "所有玩家现金取平均值", Price = 100, GradientStart = Color.FromRgb(202, 138, 4), GradientEnd = Color.FromRgb(161, 98, 7) } },
        { "红心卡", new CardDisplayItem { CardName = "红心卡", Icon = "❤️", Name = "红心卡", Desc = "指定股票散户看多倾向 +25% (4天)", Price = 60, GradientStart = Color.FromRgb(219, 39, 119), GradientEnd = Color.FromRgb(190, 24, 93) } },
        { "黑心卡", new CardDisplayItem { CardName = "黑心卡", Icon = "🖤", Name = "黑心卡", Desc = "指定股票散户看空倾向 +30% (5天)", Price = 80, GradientStart = Color.FromRgb(55, 65, 81), GradientEnd = Color.FromRgb(31, 41, 55) } },
        { "占地卡", new CardDisplayItem { CardName = "占地卡", Icon = "🚩", Name = "占地卡", Desc = "随机占领一块无人地皮", Price = 120, GradientStart = Color.FromRgb(220, 38, 38), GradientEnd = Color.FromRgb(185, 28, 28) } },
        { "地皮升级卡", new CardDisplayItem { CardName = "地皮升级卡", Icon = "⬆️", Name = "地皮升级卡", Desc = "自动升级一块地皮", Price = 60, GradientStart = Color.FromRgb(22, 163, 74), GradientEnd = Color.FromRgb(21, 128, 61) } },
        { "护盾卡", new CardDisplayItem { CardName = "护盾卡", Icon = "🛡️", Name = "护盾卡", Desc = "让持仓股票免疫下次卡牌影响", Price = 100, GradientStart = Color.FromRgb(8, 145, 178), GradientEnd = Color.FromRgb(14, 116, 144) } },
        { "谣言卡", new CardDisplayItem { CardName = "谣言卡", Icon = "📢", Name = "谣言卡", Desc = "对股票散布利好/利空消息", Price = 50, GradientStart = Color.FromRgb(217, 119, 6), GradientEnd = Color.FromRgb(180, 83, 9) } }
    };

    public CardModal()
    {
        InitializeComponent();
    }

    public void Update(Player? player, List<Stock>? stocks, bool isMyTurn = true)
    {
        _player = player;
        _stocks = stocks ?? new List<Stock>();
        _isMyTurn = isMyTurn;

        if (player == null) return;

        DiamondCount.Text = player.Diamonds.ToString();
        var diamondValue = player.Diamonds * 5000;
        DiamondValue.Text = $"≈ ${diamondValue:N0}";

        // My cards
        if (player.Cards.Count > 0)
        {
            MyCardsSection.Visibility = Visibility.Visible;
            var myCards = player.Cards.Select(c =>
            {
                if (_allCards.TryGetValue(c, out var card))
                    return card;
                return new CardDisplayItem { CardName = c, Icon = "🎴", Name = c };
            }).ToList();
            MyCardsList.ItemsSource = myCards;
        }
        else
        {
            MyCardsSection.Visibility = Visibility.Collapsed;
            MyCardsList.ItemsSource = new List<CardDisplayItem>();
        }

        // Shop
        NotMyTurnHint.Visibility = isMyTurn ? Visibility.Collapsed : Visibility.Visible;
        var shopItems = _allCards.Values.Select(c =>
        {
            c.CanBuy = player.Diamonds >= c.Price && isMyTurn;
            return c;
        }).ToList();
        CardShop.ItemsSource = shopItems;

        // Reset selection
        _selectedCard = null;
        _selectedTarget = null;
        _rumorDirection = null;
        UseCardPanel.Visibility = Visibility.Collapsed;
    }

    private void UseCard_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string cardName)
        {
            if (_allCards.TryGetValue(cardName, out var card))
            {
                _selectedCard = card;
                ShowUsePanel(cardName);
            }
        }
    }

    private void ShowUsePanel(string cardName)
    {
        UseCardPanel.Visibility = Visibility.Visible;
        UseCardIcon.Text = _selectedCard?.Icon ?? "🎴";
        UseCardTitle.Text = $"使用：{cardName}";

        // Hide all panels first
        DicePanel.Visibility = Visibility.Collapsed;
        StockSelectPanel.Visibility = Visibility.Collapsed;
        RumorPanel.Visibility = Visibility.Collapsed;

        _selectedTarget = null;
        _rumorDirection = null;

        switch (cardName)
        {
            case "骰子卡":
                DicePanel.Visibility = Visibility.Visible;
                ExecuteUseBtn.IsEnabled = false;
                break;
            case "红心卡":
            case "黑心卡":
            case "护盾卡":
                StockSelectPanel.Visibility = Visibility.Visible;
                StockList.ItemsSource = _stocks;
                _selectedTarget = null;
                UpdateStockSelection();
                ExecuteUseBtn.IsEnabled = false;
                break;
            case "谣言卡":
                RumorPanel.Visibility = Visibility.Visible;
                RumorDirectionPanel.Visibility = Visibility.Collapsed;
                RumorStockList.ItemsSource = _stocks;
                ExecuteUseBtn.IsEnabled = false;
                break;
            default:
                ExecuteUseBtn.IsEnabled = true;
                break;
        }
    }

    private void SelectDice_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string value)
        {
            _selectedTarget = value;
            ExecuteUseBtn.IsEnabled = true;
            UpdateDiceSelection(value);
        }
    }

    private void UpdateDiceSelection(string selected)
    {
        // 遍历DicePanel的直接子元素找UniformGrid，再遍历UniformGrid找按钮
        foreach (var child in DicePanel.Children)
        {
            if (child is UniformGrid grid)
            {
                foreach (var btn in grid.Children)
                {
                    if (btn is Button button && button.Tag is string tag)
                    {
                        button.Background = tag == selected
                            ? new SolidColorBrush(Color.FromRgb(122, 162, 247))
                            : new SolidColorBrush(Color.FromRgb(61, 65, 72));
                    }
                }
            }
        }
    }

    private void SelectStock_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string symbol)
        {
            _selectedTarget = symbol;
            UpdateStockSelection();
            ExecuteUseBtn.IsEnabled = true;
        }
    }

    private void UpdateStockSelection()
    {
        foreach (var child in ((Panel)StockList.Parent).Children)
        {
            if (child is Button btn && btn.Tag is string symbol)
            {
                var isSelected = symbol == _selectedTarget;
                btn.Background = isSelected
                    ? new SolidColorBrush(Color.FromRgb(219, 39, 119))  // 红心卡：红色高亮
                    : new SolidColorBrush(Color.FromRgb(55, 65, 81));
                btn.BorderBrush = isSelected
                    ? new SolidColorBrush(Colors.White)
                    : Brushes.Transparent;
                btn.BorderThickness = new Thickness(isSelected ? 2 : 0);
            }
        }
    }

    private void SelectRumorStock_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string symbol)
        {
            _selectedTarget = symbol;
            RumorDirectionPanel.Visibility = Visibility.Visible;
        }
    }

    private void SelectRumorDirection_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string direction)
        {
            _rumorDirection = direction;
            ExecuteUseBtn.IsEnabled = true;
        }
    }

    private void ExecuteUse_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedCard == null) return;

        // 缓存到本地变量，防止后续回调（如 BroadcastState 触发 UpdateCardInfo 重置 _selectedCard）造成 NRE
        var selectedCard = _selectedCard;
        string cardName = selectedCard.CardName;
        string cardIcon = selectedCard.Icon;

        string? target = null;
        string? extra = null;

        if (cardName == "骰子卡")
        {
            target = _selectedTarget;
        }
        else if (cardName == "谣言卡")
        {
            target = _selectedTarget;
            extra = _rumorDirection;
        }
        else if (cardName == "红心卡" ||
                 cardName == "黑心卡" ||
                 cardName == "护盾卡")
        {
            target = _selectedTarget;
        }

        // 先显示确认弹窗（只有在选中了目标时才弹出）
        string? confirmTargetName = null;
        if (target != null && (cardName == "红心卡" || cardName == "黑心卡" || cardName == "护盾卡"))
        {
            confirmTargetName = _stocks.FirstOrDefault(s => s.Symbol == target)?.Name ?? target;
        }

        var confirmMsg = confirmTargetName != null
            ? $"确定对「{confirmTargetName}」使用 {cardName} {cardIcon} 吗？"
            : $"确定使用 {cardName} {cardIcon} 吗？";
        var confirm = MessageBox.Show(confirmMsg, "确认使用卡片", MessageBoxButton.YesNo, MessageBoxImage.Question);
        if (confirm != MessageBoxResult.Yes) return;

        // 确认后 invoke
        try
        {
            OnUseCard?.Invoke(cardName, target, extra);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"使用卡片失败：{ex.Message}", "错误", MessageBoxButton.OK, MessageBoxImage.Error);
        }

        // 引擎已执行，结果已在消息栏显示，这里只给简要反馈
        MessageBox.Show($"✅ 使用了 {cardName}！", "卡片", MessageBoxButton.OK, MessageBoxImage.Information);

        UseCardPanel.Visibility = Visibility.Collapsed;
        _selectedCard = null;
        _selectedTarget = null;
        _rumorDirection = null;
    }

    private void BuyCard_Click(object sender, MouseButtonEventArgs e)
    {
        if (sender is Border border && border.DataContext is CardDisplayItem card)
        {
            if (!card.CanBuy)
            {
                MessageBox.Show("无法购买：钻石不足或不是你的回合", "提示", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            OnBuyCard?.Invoke(card.CardName);
        }
    }
}
