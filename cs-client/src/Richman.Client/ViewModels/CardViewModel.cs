// =============================================================================
// CardViewModel.cs
// -----------------------------------------------------------------------------
// 卡片系统面板 (Phase 7)
// 卡片列表 + 购买按钮 + 使用按钮 + 谣言报告
// =============================================================================
using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Richman.Client.Net;
using Richman.Client.Services;

namespace Richman.Client.ViewModels;

public sealed partial class CardViewModel : ObservableObject
{
    private readonly GameClient _client;
    private readonly GameStore _store;

    public CardViewModel(GameClient client, GameStore store)
    {
        _client = client;
        _store  = store;
        store.StateApplied += () => Refresh();
    }

    public GameStore Store => _store;
    public PlayerDto? MyPlayer => _store.MyPlayer;

    [ObservableProperty] private string? _rumorDirection = "good";
    [ObservableProperty] private string? _rumorTarget;

    public ObservableCollection<CardDef> AvailableCards { get; } = new()
    {
        new("停留卡", 40,  "👟", "下一位玩家本回合停留"),
        new("骰子卡", 30,  "🎲", "下一次投骰子强制为指定点数"),
        new("均贫卡", 100, "🤝", "所有玩家现金取平均"),
        new("红心卡", 60,  "❤️", "目标股票 7 天 +15% 涨幅 (有 7 天冷却)"),
        new("黑心卡", 80,  "🖤", "目标股票 7 天 -15% 跌幅"),
        new("占地卡", 120, "🚩", "占用一张非顶级地皮 (200 💎)"),
        new("地皮升级卡", 60, "⬆️", "直接升级自己的一个地皮"),
        new("护盾卡", 100, "🛡️", "保护你的目标股票 7 天"),
        new("谣言卡", 50,  "📢", "对股票散布利好/利空 (需在交易所或同花顺)"),
    };

    public IReadOnlyList<string> RumorDirections { get; } = new[] { "good", "bad" };

    public void Refresh()
    {
        OnPropertyChanged(nameof(MyPlayer));
    }

    public bool CanBuy => MyPlayer is not null;
    public bool CanUseCard(string cardName)
    {
        var mp = MyPlayer;
        if (mp is null) return false;
        if (mp.Cards is null || !mp.Cards.Contains(cardName)) return false;
        return true;
    }

    [RelayCommand]
    public void BuyCard(string cardName)
    {
        if (!CanBuy) return;
        _client.BuyCard(cardName);
    }

    [RelayCommand]
    public void UseCard(string cardName)
    {
        var mp = MyPlayer;
        if (mp is null) return;
        if (mp.Cards?.Contains(cardName) != true) return;
        if (cardName == "谣言卡")
        {
            if (string.IsNullOrEmpty(RumorTarget) || string.IsNullOrEmpty(RumorDirection)) return;
            _client.UseCard(cardName, $"{RumorTarget}:{RumorDirection}");
        }
        else
        {
            _client.UseCard(cardName, (string?)null);
        }
    }

    [RelayCommand]
    public void SetRumorTarget(string symbol) => RumorTarget = symbol;

    public IReadOnlyList<string> StockSymbols
        => _store.CurrentState?.Stocks?.Select(s => s.Symbol ?? "").Where(x => x.Length > 0).ToList()
           ?? new List<string>();
}

public sealed record CardDef(string Name, int Price, string Icon, string Description);