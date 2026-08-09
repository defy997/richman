// =============================================================================
// StockViewModel.cs
// -----------------------------------------------------------------------------
// 股票面板:
//   - 60 只股票列表
//   - 选中股票 → K 线 + MA5/MA10/MA20 + 成交量
//   - 买卖/做空/平仓操作
//   - 玩家持仓汇总
// 服务端规则 (tradeStock):
//   - buy: 扣 deposit, 允许 1x/2x/3x leverage
//   - sell: 回到 deposit
//   - short: 50% 初始保证金, 获 notional cash
//   - cover: 平仓
// =============================================================================
using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LiveChartsCore;
using LiveChartsCore.Defaults;
using LiveChartsCore.SkiaSharpView;
using LiveChartsCore.SkiaSharpView.Painting;
using SkiaSharp;
using Richman.Client.Net;
using Richman.Client.Services;

namespace Richman.Client.ViewModels;

public sealed partial class StockViewModel : ObservableObject
{
    private readonly GameClient _client;
    private readonly GameStore _store;

    public StockViewModel(GameClient client, GameStore store)
    {
        _client = client;
        _store  = store;
        store.PropertyChanged += (_, _) => RefreshCategories();
        store.StateApplied    += () => RefreshCategories();

        // 初始化空图表
        PriceSeries = new ISeries[]
        {
            new LineSeries<double>
            {
                Name = "MA5",
                Values = new double[0],
                Stroke = new SolidColorPaint(SKColors.Orange, 2),
                GeometryStroke = null,
                GeometryFill = null,
                GeometrySize = 0,
            },
            new LineSeries<double>
            {
                Name = "MA10",
                Values = new double[0],
                Stroke = new SolidColorPaint(SKColors.DodgerBlue, 2),
                GeometryStroke = null,
                GeometryFill = null,
                GeometrySize = 0,
            },
            new LineSeries<double>
            {
                Name = "MA20",
                Values = new double[0],
                Stroke = new SolidColorPaint(SKColors.HotPink, 2),
                GeometryStroke = null,
                GeometryFill = null,
                GeometrySize = 0,
            },
        };

        VolumeSeries = new ISeries[]
        {
            new ColumnSeries<double>
            {
                Name = "Vol",
                Values = new double[0],
                Fill = new SolidColorPaint(SKColors.DarkSlateGray),
            }
        };

        XAxes = new[]
        {
            new Axis { Labels = new string[0], LabelsPaint = new SolidColorPaint(SKColors.Gray) }
        };
        YAxes = new[]
        {
            new Axis { LabelsPaint = new SolidColorPaint(SKColors.Gray) { }, ShowSeparatorLines = true }
        };
        VolumeXAxes = new[]
        {
            new Axis { Labels = new string[0], LabelsPaint = new SolidColorPaint(SKColors.Gray) }
        };
        VolumeYAxes = new[]
        {
            new Axis { LabelsPaint = new SolidColorPaint(SKColors.Gray) }
        };
    }

    // ---- 状态 ----
    [ObservableProperty] private string? _selectedSector;
    [ObservableProperty] private string? _selectedStockSymbol;
    [ObservableProperty] private int _tradeQuantity = 10;
    [ObservableProperty] private int _tradeLeverage = 1;

    public ObservableCollection<StockDto>    AllStocks   { get; } = new();
    public ObservableCollection<StockDto>    FilteredStocks { get; } = new();
    public ObservableCollection<string>      Sectors     { get; } = new();

    public ISeries[] PriceSeries { get; }
    public ISeries[] VolumeSeries { get; }
    public Axis[] XAxes { get; }
    public Axis[] YAxes { get; }
    public Axis[] VolumeXAxes { get; }
    public Axis[] VolumeYAxes { get; }

    public GameStore Store => _store;
    public PlayerDto? MyPlayer => _store.MyPlayer;

    public StockDto? SelectedStock
    {
        get
        {
            if (string.IsNullOrEmpty(SelectedStockSymbol)) return null;
            return AllStocks.FirstOrDefault(s => s.Symbol == SelectedStockSymbol);
        }
    }

    public int? MyHoldingQuantity =>
        MyPlayer?.Stocks?.FirstOrDefault(s => s.Symbol == SelectedStockSymbol)?.Quantity ?? 0;

    public double? MyAvgCost =>
        MyPlayer?.Stocks?.FirstOrDefault(s => s.Symbol == SelectedStockSymbol)?.AvgCost;

    public bool HasSelectedStock => !string.IsNullOrEmpty(SelectedStockSymbol);

    public void RefreshCategories()
    {
        var src = _store.CurrentState;
        if (src?.Stocks is null) return;

        // 同步 AllStocks
        AllStocks.Clear();
        foreach (var s in src.Stocks) AllStocks.Add(s);

        // 同步 Sector 列表
        var newSectors = src.Stocks.Select(s => s.Sector ?? "其它").Distinct().OrderBy(x => x).ToList();
        var oldSelected = SelectedSector;
        Sectors.Clear();
        foreach (var s in newSectors) Sectors.Add(s);
        if (oldSelected is null || !newSectors.Contains(oldSelected))
            SelectedSector = newSectors.FirstOrDefault();

        // 触发分类过滤
        OnPropertyChanged(nameof(FilteredStocks));
        FilterBySector();

        // 同步选中股
        if (SelectedStockSymbol is null && FilteredStocks.Count > 0)
            SelectedStockSymbol = FilteredStocks[0].Symbol;
        OnPropertyChanged(nameof(SelectedStock));
        OnPropertyChanged(nameof(MyHoldingQuantity));
        OnPropertyChanged(nameof(MyAvgCost));
        RenderChart();
    }

    partial void OnSelectedSectorChanged(string? value) => FilterBySector();

    private void FilterBySector()
    {
        FilteredStocks.Clear();
        foreach (var s in AllStocks)
        {
            if (string.IsNullOrEmpty(SelectedSector) || s.Sector == SelectedSector)
                FilteredStocks.Add(s);
        }
    }

    partial void OnSelectedStockSymbolChanged(string? value)
    {
        OnPropertyChanged(nameof(SelectedStock));
        OnPropertyChanged(nameof(MyHoldingQuantity));
        OnPropertyChanged(nameof(MyAvgCost));
        RenderChart();
    }

    private void RenderChart()
    {
        var s = SelectedStock;
        var labels = new List<string>();
        var closes = new List<double>();
        var ma5 = new List<double>();
        var ma10 = new List<double>();
        var ma20 = new List<double>();
        var vols = new List<double>();

        if (s?.History is { Count: > 0 })
        {
            int idx = 0;
            foreach (var k in s.History)
            {
                labels.Add(idx.ToString());
                closes.Add(k.Close ?? 0);
                vols.Add(k.Volume ?? 0);
                idx++;
            }
            // MA
            ma5 = Sma(closes, 5);
            ma10 = Sma(closes, 10);
            ma20 = Sma(closes, 20);
        }

        // 更新价格系列 (MA5/MA10/MA20)
        ((LineSeries<double>)PriceSeries[0]).Values = ma5.ToArray();
        ((LineSeries<double>)PriceSeries[1]).Values = ma10.ToArray();
        ((LineSeries<double>)PriceSeries[2]).Values = ma20.ToArray();

        // 成交量
        ((ColumnSeries<double>)VolumeSeries[0]).Values = vols.ToArray();

        // X 轴 labels
        XAxes[0].Labels = labels.ToArray();
        VolumeXAxes[0].Labels = labels.ToArray();

        // 强制 chart 重绘
        OnPropertyChanged(nameof(PriceSeries));
        OnPropertyChanged(nameof(VolumeSeries));
        OnPropertyChanged(nameof(XAxes));
        OnPropertyChanged(nameof(VolumeXAxes));
    }

    private static List<double> Sma(List<double> prices, int period)
    {
        var result = new List<double>();
        for (int i = 0; i < prices.Count; i++)
        {
            if (i < period - 1) { result.Add(double.NaN); continue; }
            double sum = 0;
            for (int j = i - period + 1; j <= i; j++) sum += prices[j];
            result.Add(sum / period);
        }
        return result;
    }

    // ---- 交易命令 ----
    [RelayCommand]
    public void Buy()  { if (HasSelectedStock) _client.TradeStock(SelectedStockSymbol!, "buy",  TradeQuantity, Math.Clamp(TradeLeverage, 1, 3)); }

    [RelayCommand]
    public void Sell() { if (HasSelectedStock) _client.TradeStock(SelectedStockSymbol!, "sell", TradeQuantity, 1); }

    [RelayCommand]
    public void Short() { if (HasSelectedStock) _client.TradeStock(SelectedStockSymbol!, "short", TradeQuantity, 1); }

    [RelayCommand]
    public void Cover() { if (HasSelectedStock) _client.TradeStock(SelectedStockSymbol!, "cover", TradeQuantity, 1); }
}
