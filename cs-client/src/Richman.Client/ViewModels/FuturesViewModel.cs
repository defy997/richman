// =============================================================================
// FuturesViewModel.cs
// -----------------------------------------------------------------------------
// 期货面板 (Phase 6) — 简化版
// =============================================================================
using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Richman.Client.Net;
using Richman.Client.Services;

namespace Richman.Client.ViewModels;

public sealed partial class FuturesViewModel : ObservableObject
{
    private readonly GameClient _client;
    private readonly GameStore _store;

    public FuturesViewModel(GameClient client, GameStore store)
    {
        _client = client;
        _store  = store;
        store.StateApplied += () => Refresh();
    }

    [ObservableProperty] private string? _selectedSymbol;
    [ObservableProperty] private int _tradeQuantity = 1;
    [ObservableProperty] private int _tradeLeverage = 1;

    public ObservableCollection<FuturesDto> Futures { get; } = new();
    public GameStore Store => _store;

    public FuturesDto? Selected
    {
        get
        {
            if (string.IsNullOrEmpty(SelectedSymbol)) return null;
            return Futures.FirstOrDefault(f => f.Symbol == SelectedSymbol);
        }
    }

    public bool HasSelected => !string.IsNullOrEmpty(SelectedSymbol);
    public string? TypeLabel( FuturesDto? f) => f?.Type switch
    {
        "metal" => "贵金属",
        "energy" => "能源",
        "agriculture" => "农产品",
        "stone" => "建材",
        "diamond" => "钻石",
        _ => f?.Type ?? ""
    };

    public void Refresh()
    {
        var src = _store.CurrentState;
        if (src?.Futures is null) return;
        Futures.Clear();
        foreach (var f in src.Futures) Futures.Add(f);
        if (SelectedSymbol is null && Futures.Count > 0)
            SelectedSymbol = Futures[0].Symbol;
        OnPropertyChanged(nameof(Selected));
    }

    partial void OnSelectedSymbolChanged(string? value) => OnPropertyChanged(nameof(Selected));

    [RelayCommand]
    public void OpenLong()  { if (HasSelected) _client.TradeFutures(SelectedSymbol!, "buy",   TradeQuantity, Math.Clamp(TradeLeverage, 1, 10)); }
    [RelayCommand]
    public void OpenShort() { if (HasSelected) _client.TradeFutures(SelectedSymbol!, "sell",  TradeQuantity, Math.Clamp(TradeLeverage, 1, 10)); }
    [RelayCommand]
    public void Close()     { if (HasSelected) _client.TradeFutures(SelectedSymbol!, "close", TradeQuantity, 1); }
}
