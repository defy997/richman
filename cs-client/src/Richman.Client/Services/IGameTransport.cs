// =============================================================================
// IGameTransport.cs
// -----------------------------------------------------------------------------
// 抽象: 联网 (Socket.IO) / 本地 (LocalGameEngine) 共用接口
//   - GameClient (联网): 实现 IGameTransport, 走 Socket.IO
//   - LocalGameEngine (本地): 实现 IGameTransport, 进程内引擎
// GameStore 订阅这个接口, 切换实现无需改 UI / VM 代码。
// =============================================================================
using Richman.Client.Net;

namespace Richman.Client.Services;

public interface IGameTransport
{
    // ---------- 状态流 ----------
    IObservable<GameStateDto?>  StateStream    { get; }
    IObservable<(string,string)> MessageStream { get; }
    IObservable<string>         ErrorStream    { get; }
    IObservable<RumorReportDto> RumorStream    { get; }

    // ---------- 状态属性 ----------
    bool   IsConnected  { get; }
    string ServerUrl    { get; set; }
    string? MyPlayerId  { get; }
    string? RoomCode    { get; }
    GameStateDto? CurrentState { get; }

    // ---------- 事件 ----------
    event EventHandler? Connected;
    event EventHandler? Disconnected;
    event EventHandler<RoomPayload>? RoomCreated;
    event EventHandler<RoomPayload>? RoomJoined;

    // ---------- 连接 ----------
    Task ConnectAsync();
    Task DisconnectAsync();

    // ---------- 房间 ----------
    void CreateRoom(string playerName, int maxPlayers = 4);
    void CreateSingleplayer(string playerName, int aiCount = 3, string difficulty = "normal");
    void JoinRoom(string playerName, string roomCode);
    void StartGame();

    // ---------- 回合 ----------
    void RollDice();
    void EndTurn();

    // ---------- 地皮 ----------
    void BuyProperty(int cellId);
    void SellProperty(int cellId);
    void UpgradeProperty(int cellId);
    void SpecialUpgrade(int cellId, string type);

    // ---------- 银行 / 贷款 ----------
    void BankDeposit(double amount);
    void BankWithdraw(double amount);
    void BankConvert(string action, double amount);
    void TakeLoan(double amount);
    void RepayLoan(string loanId);

    // ---------- 卡片 ----------
    void BuyCard(string cardName);
    void UseCard(string cardName, string? target = null);
    void UseCard(string cardName, int? target);

    // ---------- 股票 / 期货 ----------
    void TradeStock(string symbol, string action, int quantity, int leverage = 1);
    void TradeFutures(string symbol, string action, int quantity, int leverage = 1);

    // ---------- 其它 ----------
    void BuyTonghuashun();
    void ExchangeAttraction(double amount);
    void BuyAuction(int cellId, double bid);
    void TradeProperty(int cellId, string targetPlayerId, double price);
    void UseSeizeCard(string cardName, int cellId);
}