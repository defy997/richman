// =============================================================================
// GameStore.cs
// -----------------------------------------------------------------------------
// 全局状态容器。订阅 GameClient 的事件流,把服务端推送同步进 ObservableObject
// 属性,供 XAML 绑定。
//
// 设计原则:
//   - 渲染层只读:ViewModel 通过 [ObservableProperty] 暴露属性,XAML OneWay 绑定
//   - 写入收敛:UI 触发 Action -> Action 调 GameClient.Emit -> 服务端回 gameState
//   - 消息列表本地追加:服务端只推增量消息(Phase 1 暂以全量 messages 字段对齐)
// =============================================================================
using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using Richman.Client.Net;

namespace Richman.Client.Services;

public sealed partial class GameStore : ObservableObject
{
    private readonly GameClient _client;

    public GameStore(GameClient client)
    {
        _client = client;
        _client.StateStream.Subscribe(OnState);
        _client.MessageStream.Subscribe(OnMessage);
        _client.ErrorStream.Subscribe(OnError);
        _client.RumorStream.Subscribe(OnRumor);
        _client.Connected += (_, _) => IsConnected = true;
        _client.Disconnected += (_, _) => IsConnected = false;
        _client.RoomCreated += (_, p) => { RoomCode = p.RoomCode; MyPlayerId = p.PlayerId; };
        _client.RoomJoined  += (_, p) => { RoomCode = p.RoomCode; MyPlayerId = p.PlayerId; };
    }

    /// <summary>订阅服务端 push 后的回调,外部可注册</summary>
    public event Action? StateApplied;

    // ---------- 状态 ----------
    [ObservableProperty] private bool _isConnected;
    [ObservableProperty] private string? _myPlayerId;
    [ObservableProperty] private string? _roomCode;
    [ObservableProperty] private string _gamePhase = "lobby";   // lobby / playing / ended
    [ObservableProperty] private string? _gameDate;
    [ObservableProperty] private int _currentTurn;
    [ObservableProperty] private int _currentPlayerIndex;
    [ObservableProperty] private int? _diceValue;
    [ObservableProperty] private int? _selectedCell;
    [ObservableProperty] private double _targetAssets;
    [ObservableProperty] private string? _winnerId;
    [ObservableProperty] private string? _lastError;
    [ObservableProperty] private string? _lastInfo;

    /// <summary>最近一次收到的完整服务端状态,供子 VM 取详细字段</summary>
    public GameStateDto? CurrentState { get; private set; }

    public ObservableCollection<PlayerDto>     Players  { get; } = new();
    public ObservableCollection<CellDto>       Cells    { get; } = new();
    public ObservableCollection<StockDto>      Stocks   { get; } = new();
    public ObservableCollection<FuturesDto>    Futures  { get; } = new();
    public ObservableCollection<string>        Messages { get; } = new();

    public PlayerDto? CurrentPlayer =>
        Players.Count > 0 && CurrentPlayerIndex >= 0 && CurrentPlayerIndex < Players.Count
            ? Players[CurrentPlayerIndex]
            : null;

    public PlayerDto? MyPlayer =>
        string.IsNullOrEmpty(MyPlayerId)
            ? null
            : Players.FirstOrDefault(p => p.Id == MyPlayerId);

    // ---------- 输入 ----------
    private void OnState(GameStateDto? s)
    {
        if (s is null) return;

        CurrentState = s;

        GamePhase          = s.GamePhase ?? "lobby";
        GameDate           = s.GameDate;
        CurrentTurn        = s.CurrentTurn ?? 0;
        CurrentPlayerIndex = s.CurrentPlayerIndex ?? 0;
        DiceValue          = s.DiceValue;
        SelectedCell       = s.SelectedCell;
        TargetAssets       = s.TargetAssets ?? 0;
        WinnerId           = s.WinnerId;

        SyncCollection(Players,  s.Players);
        SyncCollection(Cells,    s.Cells);
        SyncCollection(Stocks,   s.Stocks);
        SyncCollection(Futures,  s.Futures);

        // 消息清空再追加 (last 50) — 服务端 messages 本身限位 50
        Messages.Clear();
        if (s.Messages is not null)
        {
            foreach (var m in s.Messages)
            {
                var prefix = (m.Type ?? "info") switch
                {
                    "warning" => "⚠ ",
                    "success" => "✓ ",
                    "error"   => "✗ ",
                    _         => "• ",
                };
                Messages.Add($"{prefix}{m.Content}");
            }
        }

        OnPropertyChanged(nameof(CurrentPlayer));
        OnPropertyChanged(nameof(MyPlayer));

        StateApplied?.Invoke();
    }

    private void OnMessage((string Type, string Content) m)
    {
        LastInfo = $"[{m.Type}] {m.Content}";
    }

    private void OnError(string msg)
    {
        LastError = msg;
    }

    private void OnRumor(RumorReportDto r)
    {
        // Phase 2 之后再细化 UI,先存到 LastError 占位便于联调
        LastError = $"[rumor] {r.TargetName} {r.Direction} {r.EventDays}d";
    }

    private static void SyncCollection<T>(ObservableCollection<T> target, IList<T>? src)
    {
        target.Clear();
        if (src is null) return;
        foreach (var item in src) target.Add(item);
    }

    partial void OnCurrentPlayerIndexChanged(int value) => OnPropertyChanged(nameof(CurrentPlayer));
    partial void OnMyPlayerIdChanged(string? value)     => OnPropertyChanged(nameof(MyPlayer));
}
