using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Richman.Shared;

namespace Richman.Client.Modals;

public partial class RealEstateModal : Window
{
    public event Action<int>? OnUpgrade;
    public event Action<decimal>? OnBid;
    public event Action<int>? OnSellToCenter;
    public event Action<string>? OnUpgradeCommercial;

    private Player? _player;
    private GameRoom? _room;

    public RealEstateModal()
    {
        InitializeComponent();
    }

    public void Update(Player? player, GameRoom? room)
    {
        _player = player;
        _room = room;

        if (player == null || room == null) return;

        // My properties
        var myProps = room.Cells.Where(c => c.Owner == player.Id).ToList();
        MyPropertiesList.ItemsSource = myProps;
        MyPropertiesTitle.Text = $"我的地皮 ({myProps.Count})";

        // 商业用地（拍卖得来）
        var myCommercial = room.AuctionedProperties.Where(p => p.WinnerId == player.Id).ToList();
        MyCommercialList.ItemsSource = myCommercial;
        MyCommercialTitle.Text = $"我的商业用地 ({myCommercial.Count})";

        // 当前拍卖中的商业用地
        var hasAuction = room.ActiveAuction != null && !room.ActiveAuction.Closed;
        AuctionList.Visibility = hasAuction ? Visibility.Visible : Visibility.Collapsed;
        NoAuctionText.Visibility = hasAuction ? Visibility.Collapsed : Visibility.Visible;
        if (hasAuction)
        {
            var au = room.ActiveAuction!;
            AuctionTitle.Text = $"🎯 本轮拍卖: {au.Name}";
            AuctionReserveText.Text = $"底价: ${au.ReservePrice:N0} · 剩余 {room.Players.Count(p => !p.IsBankrupt)} 位玩家可出价";
            if (room.AuctionBids.TryGetValue(player.Id, out var myBid))
            {
                MyBidStatus.Text = $"✅ 你已出价 ${myBid:N0}";
                MyBidStatus.Foreground = new SolidColorBrush(Color.FromRgb(34, 197, 94));
            }
            else
            {
                MyBidStatus.Text = $"⚠️ 你尚未出价";
                MyBidStatus.Foreground = new SolidColorBrush(Color.FromRgb(251, 191, 36));
            }
        }

        // Sell to center (only if at position 32)
        var atCenter = player.Position == 32;
        SellStatusText.Text = atCenter ? "可以卖给交易所" : "需要站在房地产交易中心 (地块32)";
        SellStatusText.Foreground = atCenter ? new SolidColorBrush(Color.FromRgb(34, 197, 94)) : new SolidColorBrush(Color.FromRgb(239, 68, 68));
        SellablePropertiesList.ItemsSource = atCenter ? myProps : new List<Cell>();

        // All players
        var playersData = room.Players.Select(p => new
        {
            p.Id,
            p.Name,
            p.Color,
            Properties = room.Cells.Where(c => c.Owner == p.Id).ToList()
        }).ToList();
        AllPlayersList.ItemsSource = playersData;
    }

    private void Upgrade_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is int cellId)
        {
            OnUpgrade?.Invoke(cellId);
        }
    }

    private void AuctionBidBtn_Click(object sender, RoutedEventArgs e)
    {
        var input = new InputDialog("拍卖出价", "请输入你的暗标出价（隐藏，其他玩家看不到）:", "10000");
        if (input.ShowDialog() == true && decimal.TryParse(input.InputText, out var bid) && bid > 0)
        {
            OnBid?.Invoke(bid);
        }
    }

    private void UpgradeCommercial_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string id)
        {
            OnUpgradeCommercial?.Invoke(id);
        }
    }

    private void Sell_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is int cellId)
        {
            OnSellToCenter?.Invoke(cellId);
        }
    }

    private void SellToCenter_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is int cellId)
        {
            OnSellToCenter?.Invoke(cellId);
        }
    }
}

public class InputDialog : Window
{
    public string InputText { get; private set; } = "";

    public InputDialog(string title, string prompt, string defaultValue)
    {
        Title = title;
        Width = 350;
        Height = 160;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ResizeMode = ResizeMode.NoResize;
        Background = new SolidColorBrush(Color.FromRgb(30, 41, 59));

        var grid = new Grid { Margin = new Thickness(20) };
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

        var label = new TextBlock { Text = prompt, Foreground = Brushes.White, Margin = new Thickness(0, 0, 0, 10) };
        Grid.SetRow(label, 0);

        var textBox = new TextBox { Text = defaultValue, Background = new SolidColorBrush(Color.FromRgb(15, 52, 96)), Foreground = Brushes.White, BorderBrush = new SolidColorBrush(Color.FromRgb(71, 85, 105)), Padding = new Thickness(8, 5, 8, 5), FontSize = 14 };
        Grid.SetRow(textBox, 1);

        var buttonPanel = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 15, 0, 0) };
        Grid.SetRow(buttonPanel, 2);

        var okButton = new Button { Content = "确定", Width = 80, Padding = new Thickness(10, 5, 10, 5), Background = new SolidColorBrush(Color.FromRgb(34, 197, 94)), Foreground = Brushes.White, BorderThickness = new Thickness(0), Margin = new Thickness(0, 0, 10, 0) };
        okButton.Click += (s, e) => { InputText = textBox.Text; DialogResult = true; };
        buttonPanel.Children.Add(okButton);

        var cancelButton = new Button { Content = "取消", Width = 80, Padding = new Thickness(10, 5, 10, 5), Background = new SolidColorBrush(Color.FromRgb(71, 85, 105)), Foreground = Brushes.White, BorderThickness = new Thickness(0) };
        cancelButton.Click += (s, e) => { DialogResult = false; };
        buttonPanel.Children.Add(cancelButton);

        grid.Children.Add(label);
        grid.Children.Add(textBox);
        grid.Children.Add(buttonPanel);

        Content = grid;
    }
}
