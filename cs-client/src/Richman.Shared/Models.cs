namespace Richman.Shared;

public class Loan
{
    public string Id { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public decimal InterestRate { get; set; }
    public int TurnsRemaining { get; set; }
    public long CreatedAt { get; set; }
}

public class Materials
{
    public int Cement { get; set; }
    public int Steel { get; set; }
    public int Rubber { get; set; }
    public int PreciousMetals { get; set; }
    public int Diamonds { get; set; }
}

public enum PropertyUpgrade
{
    None,
    Normal,
    Hotel,
    Smelter,
    DiamondMine,
    Agency,
    Resort,
    Mall,
    Monument,
    Brokerage  // 🏦 房产中介（新）：自己拥有所有地块价格 +5%，可叠加
}

public static class PropertyUpgradeInfo
{
    public static string GetName(PropertyUpgrade upgrade) => upgrade switch
    {
        PropertyUpgrade.None => "空地",
        PropertyUpgrade.Normal => "普通",
        PropertyUpgrade.Hotel => "🏨 酒店",
        PropertyUpgrade.Smelter => "⚒️ 冶炼厂",
        PropertyUpgrade.DiamondMine => "💎 钻石矿",
        PropertyUpgrade.Agency => "🏢 代理公司",
        PropertyUpgrade.Resort => "🏝️ 度假村",
        PropertyUpgrade.Mall => "🛒 购物中心",
        PropertyUpgrade.Monument => "🗿 纪念碑",
        PropertyUpgrade.Brokerage => "🏦 房产中介",
        _ => "未知"
    };

    // 建材消耗需求 [水泥, 钢材, 橡胶, 贵金属, 钻石]
    public static int[] GetMaterialCost(PropertyUpgrade upgrade) => upgrade switch
    {
        PropertyUpgrade.Hotel => new[] { 5, 3, 2, 0, 0 },
        PropertyUpgrade.Smelter => new[] { 8, 10, 0, 5, 0 },
        PropertyUpgrade.DiamondMine => new[] { 3, 5, 2, 0, 10 },
        PropertyUpgrade.Agency => new[] { 4, 4, 3, 0, 0 },
        PropertyUpgrade.Resort => new[] { 6, 4, 5, 0, 0 },
        PropertyUpgrade.Mall => new[] { 5, 5, 4, 0, 0 },
        PropertyUpgrade.Monument => new[] { 0, 8, 0, 8, 5 },
        PropertyUpgrade.Brokerage => new[] { 6, 6, 3, 4, 0 },
        _ => new[] { 0, 0, 0, 0, 0 }
    };

    // 每回合产出 [现金, 钻石]
    public static (decimal Cash, int Diamonds) GetProduction(PropertyUpgrade upgrade) => upgrade switch
    {
        PropertyUpgrade.Hotel => (5000, 0),
        PropertyUpgrade.Smelter => (3000, 0),
        PropertyUpgrade.DiamondMine => (0, 3),
        PropertyUpgrade.Agency => (8000, 0),
        PropertyUpgrade.Resort => (4000, 0),
        PropertyUpgrade.Mall => (6000, 0),
        PropertyUpgrade.Monument => (10000, 1),
        PropertyUpgrade.Brokerage => (3000, 0),  // 自身有 +5% 全部过路费已是大头，现金少一点平衡
        _ => (0, 0)
    };

    // 是否可用顶级升级
    public static bool IsTopLevel(PropertyUpgrade upgrade) =>
        upgrade != PropertyUpgrade.None && upgrade != PropertyUpgrade.Normal;
}

public class Player
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = string.Empty;
    public decimal Cash { get; set; }
    public decimal Deposit { get; set; }
    public int Diamonds { get; set; }
    public int Position { get; set; }
    public List<int> Properties { get; set; } = new();
    public bool IsBankrupt { get; set; }
    public List<string> Cards { get; set; } = new();
    public List<StockHolding> Stocks { get; set; } = new();
    public List<FuturesHolding>? FuturesHoldings { get; set; }
    public List<Loan> Loans { get; set; } = new();
    public bool PassedBank { get; set; }
    public int StayTurns { get; set; }
    public bool IsAI { get; set; }
    public string? AiDifficulty { get; set; }
    public decimal TotalAssets { get; set; }
    public Materials Materials { get; set; } = new();
    public bool HasTonghuashun { get; set; }
    public bool AtStockExchange { get; set; }
    public bool AtFuturesExchange { get; set; }
    public bool AtMarket { get; set; }
    public int Attraction { get; set; }
}

public class StockHolding
{
    public string Symbol { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal AvgCost { get; set; }
    public int LongLeverage { get; set; } = 1;
    public int ShortQuantity { get; set; }
    public decimal ShortAvgCost { get; set; }
    public int ShortLeverage { get; set; } = 1;
    public decimal ShortMarginFrozen { get; set; }
    public decimal ShortCashReceived { get; set; }
}

public enum CellType
{
    Empty,
    Chance,
    Destiny,
    Diamond,
    Start,
    Bank,
    Stock,
    Futures,
    RealEstate,
    Tax,
    Jail,
    FreeParking,
    GoToJail,
    Material,
    Insurance,
    Museum,
    Hospital,
    Park,
    Market
}

public class Cell
{
    public int Id { get; set; }
    public CellType Type { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string? Owner { get; set; }

    /// <summary>
    /// 升级链名称：Lv.1→Lv.2→Lv.3→Lv.4→Lv.5(顶级建筑)
    /// 对应 IntermediateTier
    /// </summary>
    public IntermediateTier IntermediateTier { get; set; } = IntermediateTier.Residential;

    public int Level { get; set; }  // 0-5 普通升级等级
    public decimal BasePrice { get; set; }

    /// <summary>是否曾停留过（用于判断可否升级）</summary>
    public bool HasStopped { get; set; }

    public int? VisitCount { get; set; }
    public PropertyUpgrade Upgrade { get; set; } = PropertyUpgrade.None;  // 顶级升级类型
    public bool FromAuction { get; set; }
    public decimal? AuctionReservedPrice { get; set; }
    public decimal? AuctionHighestBid { get; set; }
    public string? AuctionHighestBidder { get; set; }
    public bool AuctionActive { get; set; }
    public decimal? Appreciation { get; set; }

    // 顶级升级后的建材消耗记录
    public int CementUsed { get; set; }
    public int SteelUsed { get; set; }
    public int RubberUsed { get; set; }
    public int PreciousMetalsUsed { get; set; }
    public int DiamondsUsed { get; set; }
}

/// <summary>中间升级链，每条链Lv.5对应一个顶级建筑</summary>
public enum IntermediateTier
{
    Residential,    // 住宅：闵行→Lv.2→Lv.3→Lv.4→Lv.5 顶级可用酒店
    Commercial,     // 商业：徐汇→Lv.2→Lv.3→Lv.4→Lv.5 顶级可用科技园
    Industrial,     // 工业：宝山→Lv.2→Lv.3→Lv.4→Lv.5 顶级可用冶炼厂
    Office,         // 办公：陆家嘴→Lv.2→Lv.3→Lv.4→Lv.5 顶级可用写字楼
    Landmark        // 地标：外滩→Lv.2→Lv.3→Lv.4→Lv.5 顶级可用纪念碑
}

public class KLine
{
    public decimal Open { get; set; }
    public decimal High { get; set; }
    public decimal Low { get; set; }
    public decimal Close { get; set; }
    public decimal Volume { get; set; }
}

public class Stock
{
    public string Symbol { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Sector { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public decimal Change { get; set; }
    public string? Trend { get; set; }
    public int TrendDays { get; set; }
    public decimal CardBias { get; set; }
    public int CardBiasDays { get; set; }
    public int CardBiasLastUsedTurn { get; set; }
    public bool CardBiasShield { get; set; }
    public string? News { get; set; }
    public bool LimitUp { get; set; }
    public bool LimitDown { get; set; }
    public List<decimal>? KLine { get; set; }
    public List<KLine> History { get; set; } = new();
    public decimal Base { get; set; }
    public decimal EventEffect { get; set; }
    public int EventDays { get; set; }
    public string EventDesc { get; set; } = string.Empty;
    public bool NewsTriggered { get; set; }
    public int ConsolidateDays { get; set; }
    public bool IsConsolidating { get; set; }
    public bool IsNoManipulator { get; set; }
    public int NoManipulatorDays { get; set; }
    public List<decimal> Volumes { get; set; } = new();
    public decimal Open { get; set; }
    public decimal High { get; set; }
    public decimal Low { get; set; }
    public List<decimal?>? Ma5 { get; set; }
    public List<decimal?>? Ma10 { get; set; }
    public List<decimal?>? Ma20 { get; set; }
    public List<decimal?>? Rsi { get; set; }
    public List<decimal>? Macd { get; set; }
    public List<decimal>? Dif { get; set; }
    public List<decimal>? Dea { get; set; }

    // === 市场参与者模拟 ===
    // 散户：跟随MA趋势，反应迟钝
    public decimal RetailBias { get; set; }
    // 机构：价值投资，关注基本面
    public decimal InstitutionBias { get; set; }
    // 大户：跟随机构，但有一定延迟
    public decimal WhaleBias { get; set; }
    // 主力/游资：主动拉升或砸盘，影响最大
    public decimal ManipulatorBias { get; set; }
    // 量化：高频交易，追涨杀跌
    public decimal QuantBias { get; set; }

    // 综合倾向（加权平均）：散户5% 大户10% 机构15% 量化15% 游资30% 主力40%
    public decimal TotalBias => RetailBias * 0.05m + WhaleBias * 0.10m + InstitutionBias * 0.15m + QuantBias * 0.15m + ManipulatorBias * 0.40m;

    // 反操盘标记
    public bool IsAntiManipulation { get; set; }
}

public class FuturesHolding
{
    public string Symbol { get; set; } = string.Empty;
    public int LongQuantity { get; set; }
    public decimal LongAvgCost { get; set; }
    public int ShortQuantity { get; set; }
    public decimal ShortAvgCost { get; set; }
    public decimal ShortInitialMargin { get; set; }
    public decimal ShortMaintenanceMargin { get; set; }
    public decimal LongLeverage { get; set; }
    public decimal ShortLeverage { get; set; }
    public decimal LongFrozenCost { get; set; }
    public int LongOpenedOnDay { get; set; }
    public int ShortOpenedOnDay { get; set; }
}

public enum FuturesType
{
    Gold,
    Silver,
    Diamond,
    Cement,
    Steel,
    Rubber,
    Oil,
    Wheat
}

public enum MaterialKind
{
    Cement,
    Steel,
    Rubber,
    PreciousMetals,
    Diamond
}

public enum FuturesCategory
{
    Precious,
    Material,
    Energy,
    Agriculture
}

public class FuturesContract
{
    public string Symbol { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public decimal Change { get; set; }
    public int Unit { get; set; }
    public decimal Base { get; set; }
    public decimal Volatility { get; set; }
    public List<KLine> History { get; set; } = new();
    public List<decimal> Volumes { get; set; } = new();
    public decimal EventEffect { get; set; }
    public int EventDays { get; set; }
    public string EventDesc { get; set; } = string.Empty;
    public bool NewsTriggered { get; set; }
    public int ConsolidateDays { get; set; }
    public bool IsConsolidating { get; set; }
    public bool IsNoManipulator { get; set; }
    public int NoManipulatorDays { get; set; }
    public decimal CardBias { get; set; }
    public int CardBiasDays { get; set; }
    public int CardBiasLastUsedTurn { get; set; }
    public bool CardBiasShield { get; set; }
    public decimal Open { get; set; }
    public decimal High { get; set; }
    public decimal Low { get; set; }
    public List<decimal>? KLine { get; set; }
    public List<decimal?>? Ma5 { get; set; }
    public List<decimal?>? Ma10 { get; set; }
    public List<decimal?>? Ma20 { get; set; }
    public string? News { get; set; }
    public FuturesType Type { get; set; }
    public FuturesCategory Category { get; set; }
    public bool IsMaterial { get; set; }
    public decimal LimitThreshold { get; set; }
    public bool LimitUp { get; set; }
    public bool LimitDown { get; set; }
    public int ExpiresInDays { get; set; }
    public int ExpiresOnDay { get; set; }

    // === 市场参与者模拟 ===
    public decimal RetailBias { get; set; }
    public decimal InstitutionBias { get; set; }
    public decimal WhaleBias { get; set; }
    public decimal ManipulatorBias { get; set; }
    public decimal QuantBias { get; set; }
    public decimal TotalBias => RetailBias * 0.05m + WhaleBias * 0.10m + InstitutionBias * 0.15m + QuantBias * 0.15m + ManipulatorBias * 0.40m;
    public bool IsAntiManipulation { get; set; }
}

public enum GamePhase
{
    Lobby,
    Playing,
    Ended
}

public enum GameMode
{
    Multiplayer,
    Singleplayer
}

public class GameRoom
{
    public string Code { get; set; } = string.Empty;
    public GameMode Mode { get; set; }
    public List<Player> Players { get; set; } = new();
    public List<Cell> Cells { get; set; } = new();
    public List<Stock> Stocks { get; set; } = new();
    public List<FuturesContract> Futures { get; set; } = new();
    public int CurrentPlayerIndex { get; set; }
    public int CurrentTurn { get; set; }
    public GamePhase Phase { get; set; }
    public int? DiceValue { get; set; }
    public int? ForcedDice { get; set; }
    public decimal TargetAssets { get; set; }
    public int MaxPlayers { get; set; }
    public string? WinnerId { get; set; }
    public long TurnStartedAt { get; set; }
    public string GameDate { get; set; } = string.Empty;

    // 通货膨胀系统
    public decimal InflationRate { get; set; } = 0.02m;  // 每月2%
    public decimal InflationMultiplier { get; set; } = 1.0m;  // 当前通胀倍数
    public int CurrentMonth { get; set; } = 1;  // 当前月份

    // 建材价格（随通胀浮动）
    public decimal CementPrice { get; set; } = 100;
    public decimal SteelPrice { get; set; } = 200;
    public decimal RubberPrice { get; set; } = 150;
    public decimal PreciousMetalsPrice { get; set; } = 500;
    public decimal DiamondsPrice { get; set; } = 1000;

    // 宏观经济因子（每日更新，范围 -1 ~ +1）
    public decimal MacroEconomicCycle { get; set; } = 0;     // 经济周期：+繁荣/-衰退
    public decimal MacroInflation { get; set; } = 0;          // 通胀压力
    public decimal MacroRiskAppetite { get; set; } = 0;       // 风险偏好：+投机/-避险

    // 市场价格历史（用于市场格）
    public List<MarketPriceTick> MarketPriceHistory { get; set; } = new();

    // 当前拍卖中的商业用地（地图中央显示）
    public CommercialProperty? ActiveAuction { get; set; }

    // 历史已拍出商业用地
    public List<CommercialProperty> AuctionedProperties { get; set; } = new();

    // 玩家在当前拍卖提交的出价（key=playerId, value=出价金额）
    public Dictionary<string, decimal> AuctionBids { get; set; } = new();
}

public enum CommercialType
{
    RealEstate,    // 商业地产
    TechPark,      // 科技园
    ShoppingMall,  // 购物中心
    OfficeTower,   // 写字楼
    HotelResort    // 酒店度假村
}

public class CommercialProperty
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = string.Empty;       // 例如"静安商业中心"
    public CommercialType Type { get; set; }
    public decimal ReservePrice { get; set; }             // 底价
    public decimal FinalPrice { get; set; }               // 成交价
    public string? WinnerId { get; set; }                 // 中标玩家
    public int Day { get; set; }                          // 拍卖所在的天数
    public bool Closed { get; set; }                      // 是否已成交
    public int Level { get; set; }                        // 升级等级（拍下后可即时半价升级）
}

public class MarketPriceTick
{
    public int Day { get; set; }
    public decimal CementPrice { get; set; }
    public decimal SteelPrice { get; set; }
    public decimal RubberPrice { get; set; }
    public decimal PreciousMetalsPrice { get; set; }
    public decimal DiamondsPrice { get; set; }
}

public enum MessageType
{
    Info,
    Warning,
    Success,
    Error
}

public class GameMessage
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public MessageType Type { get; set; }
    public string Content { get; set; } = string.Empty;
    public long Timestamp { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}

public enum GameAction
{
    RollDice,
    BuyProperty,
    SellProperty,
    UpgradeProperty,
    UseCard,
    EndTurn,
    TradeStock,
    TradeFutures,
    BankDeposit,
    BankWithdraw,
    BankLoan,
    BankRepay,
    AuctionBid,
    StartGame,
    JoinRoom,
    LeaveRoom,
    CreateRoom
}
