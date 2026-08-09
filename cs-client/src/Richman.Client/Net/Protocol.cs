// =============================================================================
// Protocol.cs
// -----------------------------------------------------------------------------
// 集中声明与 Node.js 服务端 (server/src/index.ts) 通信用到的所有事件名,
// 避免裸字符串散落各处导致拼写错误。
// =============================================================================
namespace Richman.Client.Net;

public static class Protocol
{
    // ---------- 客户端 -> 服务端 (Emit) ----------
    public const string CreateRoom         = "createRoom";
    public const string CreateSingleplayer = "createSingleplayer";
    public const string JoinRoom          = "joinRoom";
    public const string StartGame         = "startGame";
    public const string RollDice          = "rollDice";
    public const string EndTurn           = "endTurn";
    public const string BuyProperty       = "buyProperty";
    public const string SellProperty      = "sellProperty";
    public const string UpgradeProperty   = "upgradeProperty";
    public const string SpecialUpgrade    = "specialUpgrade";
    public const string BankDeposit       = "bankDeposit";
    public const string BankWithdraw      = "bankWithdraw";
    public const string BankConvert       = "bankConvert";
    public const string TakeLoan          = "takeLoan";
    public const string RepayLoan         = "repayLoan";
    public const string BuyCard           = "buyCard";
    public const string UseCard           = "useCard";
    public const string TradeStock        = "tradeStock";
    public const string TradeFutures      = "tradeFutures";
    public const string BuyTonghuashun    = "buyTonghuashun";
    public const string ExchangeAttraction= "exchangeAttraction";
    public const string BuyAuction        = "buyAuction";
    public const string TradeProperty     = "tradeProperty";
    public const string UseSeizeCard      = "useSeizeCard";

    // ---------- 服务端 -> 客户端 (On) ----------
    public const string RoomCreated = "roomCreated";
    public const string RoomJoined  = "roomJoined";
    public const string GameState   = "gameState";
    public const string Error       = "error";
    public const string Message     = "message";
    public const string RumorReport = "rumorReport";
}
