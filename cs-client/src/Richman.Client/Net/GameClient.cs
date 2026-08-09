// =============================================================================
// GameClient.cs
// -----------------------------------------------------------------------------
// 封装 SocketIOClient (doghappy/socket.io-client-csharp) v3.1.2,
// 对外暴露:
//   - Connect / Disconnect / CreateRoom / JoinRoom / ...
//   - Reactive 属性: IsConnected / ServerUrl / MyPlayerId / RoomCode / CurrentState
//   - 事件: Connected / Disconnected / GameStateReceived / ErrorReceived /
//           MessageReceived / RumorReportReceived / RoomCreated / RoomJoined
// =============================================================================
using System.Reactive.Linq;
using System.Reactive.Subjects;
using SocketIOClient;
using SocketIOClient.Transport;
using SioSocket = SocketIOClient.SocketIO;

namespace Richman.Client.Net;

public sealed class GameClient : IDisposable
{
    private SioSocket? _socket;
    private readonly Subject<GameStateDto?> _state = new();
    private readonly Subject<(string Type, string Content)> _message = new();
    private readonly Subject<string> _error = new();
    private readonly Subject<RumorReportDto> _rumor = new();
    private bool _disposed;

    // ---------- Reactive State ----------
    public IObservable<GameStateDto?>   StateStream   => _state.AsObservable();
    public IObservable<(string,string)> MessageStream => _message.AsObservable();
    public IObservable<string>          ErrorStream   => _error.AsObservable();
    public IObservable<RumorReportDto>  RumorStream   => _rumor.AsObservable();

    public bool   IsConnected  { get; private set; }
    public string ServerUrl    { get; private set; } = "http://localhost:3000";
    public string? MyPlayerId  { get; private set; }
    public string? RoomCode    { get; private set; }
    public GameStateDto? CurrentState { get; private set; }

    public event EventHandler? Connected;
    public event EventHandler? Disconnected;
    public event EventHandler<RoomPayload>? RoomCreated;
    public event EventHandler<RoomPayload>? RoomJoined;

    public void SetServerUrl(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return;
        ServerUrl = url.TrimEnd('/');
    }

    // ------------------------------------------------------------------
    // 连接
    // ------------------------------------------------------------------
    public Task ConnectAsync()
    {
        if (_socket is { Connected: true }) return Task.CompletedTask;

        _socket = new SioSocket(ServerUrl, new SocketIOOptions
        {
            Transport = TransportProtocol.WebSocket,
            Reconnection = true,
            ReconnectionAttempts = int.MaxValue,
            ReconnectionDelay = 1000,
        });

        HookSocketEvents(_socket);
        return _socket.ConnectAsync();
    }

    public async Task DisconnectAsync()
    {
        if (_socket is null) return;
        await _socket.DisconnectAsync();
    }

    private void HookSocketEvents(SioSocket s)
    {
        s.OnConnected += (_, _) =>
        {
            IsConnected = true;
            Connected?.Invoke(this, EventArgs.Empty);
        };

        s.OnDisconnected += (_, _) =>
        {
            IsConnected = false;
            Disconnected?.Invoke(this, EventArgs.Empty);
        };

        s.OnError += (_, e) =>
            _error.OnNext(string.IsNullOrWhiteSpace(e) ? "socket error" : e);

        // ---- 服务端事件 ----
        s.On(Protocol.RoomCreated, response =>
        {
            try
            {
                var payload = response.GetValue<RoomPayload>();
                if (payload is not null)
                {
                    RoomCode = payload.RoomCode;
                    MyPlayerId = payload.PlayerId;
                    RoomCreated?.Invoke(this, payload);
                }
            }
            catch (Exception ex)
            {
                _error.OnNext($"RoomCreated 解析失败: {ex.Message}");
            }
        });

        s.On(Protocol.RoomJoined, response =>
        {
            try
            {
                var payload = response.GetValue<RoomPayload>();
                if (payload is not null)
                {
                    RoomCode = payload.RoomCode;
                    MyPlayerId = payload.PlayerId;
                    RoomJoined?.Invoke(this, payload);
                }
            }
            catch (Exception ex)
            {
                _error.OnNext($"RoomJoined 解析失败: {ex.Message}");
            }
        });

        s.On(Protocol.GameState, response =>
        {
            try
            {
                var state = response.GetValue<GameStateDto>();
                CurrentState = state;
                _state.OnNext(state);
            }
            catch (Exception ex)
            {
                _error.OnNext($"gameState 解析失败: {ex.Message}");
            }
        });

        s.On(Protocol.Error, response =>
        {
            try
            {
                var err = response.GetValue<ErrorPayload>();
                _error.OnNext(err?.Message ?? "未知错误");
            }
            catch
            {
                _error.OnNext("收到不识别的 error");
            }
        });

        s.On(Protocol.Message, response =>
        {
            try
            {
                var msg = response.GetValue<MessagePayload>();
                _message.OnNext((msg?.Type ?? "info", msg?.Content ?? ""));
            }
            catch
            {
                _message.OnNext(("info", ""));
            }
        });

        s.On(Protocol.RumorReport, response =>
        {
            try
            {
                var r = response.GetValue<RumorReportDto>();
                if (r is not null) _rumor.OnNext(r);
            }
            catch (Exception ex)
            {
                _error.OnNext($"rumorReport 解析失败: {ex.Message}");
            }
        });
    }

    // ------------------------------------------------------------------
    // 强类型 Emit (与服务端字段名保持一致)
    // ------------------------------------------------------------------
    private void Emit(string eventName, object? payload)
    {
        if (_socket is null || !IsConnected)
        {
            _error.OnNext("尚未连接服务器");
            return;
        }
        if (payload is null) _socket.EmitAsync(eventName);
        else                _socket.EmitAsync(eventName, payload);
    }

    // ---- 房间 ----
    public void CreateRoom(string playerName, int maxPlayers = 4)
        => Emit(Protocol.CreateRoom, new { playerName, maxPlayers });

    public void CreateSingleplayer(string playerName, int aiCount = 3, string difficulty = "normal")
        => Emit(Protocol.CreateSingleplayer, new { playerName, aiCount, difficulty });

    public void JoinRoom(string playerName, string roomCode)
        => Emit(Protocol.JoinRoom, new { playerName, roomCode });

    public void StartGame() => Emit(Protocol.StartGame, null);

    // ---- 回合 ----
    public void RollDice() => Emit(Protocol.RollDice, null);
    public void EndTurn()  => Emit(Protocol.EndTurn, null);

    // ---- 地皮 ----
    public void BuyProperty(int cellId)        => Emit(Protocol.BuyProperty, new { cellId });
    public void SellProperty(int cellId)       => Emit(Protocol.SellProperty, new { cellId });
    public void UpgradeProperty(int cellId)    => Emit(Protocol.UpgradeProperty, new { cellId });
    public void SpecialUpgrade(int cellId, string type)
        => Emit(Protocol.SpecialUpgrade, new { cellId, type });

    // ---- 银行 ----
    public void BankDeposit(double amount)  => Emit(Protocol.BankDeposit, new { amount });
    public void BankWithdraw(double amount) => Emit(Protocol.BankWithdraw, new { amount });
    public void BankConvert(string action, double amount)
        => Emit(Protocol.BankConvert, new { action, amount });

    // ---- 贷款 ----
    public void TakeLoan(double amount)          => Emit(Protocol.TakeLoan, new { amount });
    public void RepayLoan(string loanId)         => Emit(Protocol.RepayLoan, new { loanId });

    // ---- 卡片 ----
    public void BuyCard(string cardName)                        => Emit(Protocol.BuyCard, new { cardName });
    public void UseCard(string cardName, string? target = null) => Emit(Protocol.UseCard, new { cardName, target });
    public void UseCard(string cardName, int? target)
        => Emit(Protocol.UseCard, new { cardName, target });

    // ---- 股票 / 期货 ----
    public void TradeStock(string symbol, string action, int quantity, int leverage = 1)
        => Emit(Protocol.TradeStock, new { symbol, action, quantity, leverage });

    public void TradeFutures(string symbol, string action, int quantity, int leverage = 1)
        => Emit(Protocol.TradeFutures, new { symbol, action, quantity, leverage });

    // ---- 其它 ----
    public void BuyTonghuashun()                      => Emit(Protocol.BuyTonghuashun, null);
    public void ExchangeAttraction(double amount)     => Emit(Protocol.ExchangeAttraction, new { amount });
    public void BuyAuction(int cellId, double bid)    => Emit(Protocol.BuyAuction, new { cellId, bid });
    public void TradeProperty(int cellId, string targetPlayerId, double price)
        => Emit(Protocol.TradeProperty, new { cellId, targetPlayerId, price });
    public void UseSeizeCard(string cardName, int cellId)
        => Emit(Protocol.UseSeizeCard, new { cardName, cellId });

    // ---- 通用调试 ----
    public void EmitRaw(string eventName, object payload) => Emit(eventName, payload);

    public void EmitRawString(string eventName, string rawJson)
    {
        if (_socket is null || !IsConnected) { _error.OnNext("尚未连接服务器"); return; }
        // 使用底层 socket 直接 emit raw string
        try
        {
            // SocketIOClient 3.1.2 允许通过动态参数
            // 这里采用 EmitAsync with raw json object
            var obj = System.Text.Json.JsonSerializer.Deserialize<object>(rawJson);
            _socket.EmitAsync(eventName, obj!);
        }
        catch (Exception ex)
        {
            _error.OnNext($"EmitRawString failed: {ex.Message}");
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        try { _socket?.Dispose(); } catch { /* ignore */ }
        _state.OnCompleted();
        _message.OnCompleted();
        _error.OnCompleted();
        _rumor.OnCompleted();
    }
}
