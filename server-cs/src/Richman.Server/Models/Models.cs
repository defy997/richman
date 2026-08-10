// =============================================================================
// Models.cs
// -----------------------------------------------------------------------------
// 服务端游戏状态核心模型 — 与原 Node server/src/index.ts 接口严格对齐
// =============================================================================
using System.Text.Json.Serialization;

namespace Richman.Server.Models;

public enum CellType { Empty, Chance, Destiny, Diamond, Start, Bank, Stock, Futures, Realestate }
public enum Trend { Up, Down, None }
public enum Difficulty { Easy, Normal, Hard }
public enum GamePhase { Lobby, Playing, Ended }

// ---------- 玩家 ----------
public sealed class Player
{
    [JsonPropertyName("id")]            public string Id { get; set; } = "";
    [JsonPropertyName("socketId")]      public string SocketId { get; set; } = "";
    [JsonPropertyName("name")]          public string Name { get; set; } = "";
    [JsonPropertyName("color")]         public string Color { get; set; } = "#3498db";
    [JsonPropertyName("cash")]          public double Cash { get; set; }
    [JsonPropertyName("deposit")]       public double Deposit { get; set; }
    [JsonPropertyName("diamonds")]      public int Diamonds { get; set; }
    [JsonPropertyName("position")]      public int Position { get; set; }
    [JsonPropertyName("properties")]    public List<int> Properties { get; set; } = new();
    [JsonPropertyName("isBankrupt")]    public bool IsBankrupt { get; set; }
    [JsonPropertyName("cards")]         public List<string> Cards { get; set; } = new();
    [JsonPropertyName("stocks")]        public List<StockHolding> Stocks { get; set; } = new();
    [JsonPropertyName("futuresHoldings")] public List<FuturesHolding>? FuturesHoldings { get; set; } = new();
    [JsonPropertyName("loans")]         public List<Loan> Loans { get; set; } = new();
    [JsonPropertyName("passedBank")]    public bool PassedBank { get; set; }
    [JsonPropertyName("stayTurns")]     public int StayTurns { get; set; }
    [JsonPropertyName("isAI")]          public bool IsAI { get; set; }
    [JsonPropertyName("aiDifficulty")]  public Difficulty? AiDifficulty { get; set; }
    [JsonPropertyName("totalAssets")]   public double? TotalAssets { get; set; }
    [JsonPropertyName("materials")]     public Materials Materials { get; set; } = new();
    [JsonPropertyName("hasTonghuashun")] public bool HasTonghuashun { get; set; }
    [JsonPropertyName("atStockExchange")] public bool AtStockExchange { get; set; }
    [JsonPropertyName("atFuturesExchange")] public bool AtFuturesExchange { get; set; }
    [JsonPropertyName("attraction")]    public int Attraction { get; set; }
}

public sealed class Materials
{
    [JsonPropertyName("cement")] public int Cement { get; set; }
    [JsonPropertyName("steel")]  public int Steel { get; set; }
    [JsonPropertyName("glass")]  public int Glass { get; set; }
}

public sealed class StockHolding
{
    [JsonPropertyName("symbol")]             public string Symbol { get; set; } = "";
    [JsonPropertyName("quantity")]           public int Quantity { get; set; }
    [JsonPropertyName("avgCost")]            public double AvgCost { get; set; }
    [JsonPropertyName("shortQuantity")]      public int ShortQuantity { get; set; }
    [JsonPropertyName("shortAvgCost")]       public double ShortAvgCost { get; set; }
    [JsonPropertyName("shortMarginFrozen")]  public double ShortMarginFrozen { get; set; }
    [JsonPropertyName("shortCashReceived")]  public double ShortCashReceived { get; set; }
}

public sealed class FuturesHolding
{
    [JsonPropertyName("symbol")]               public string Symbol { get; set; } = "";
    [JsonPropertyName("longQuantity")]         public int LongQuantity { get; set; }
    [JsonPropertyName("longAvgCost")]          public double LongAvgCost { get; set; }
    [JsonPropertyName("shortQuantity")]        public int ShortQuantity { get; set; }
    [JsonPropertyName("shortAvgCost")]         public double ShortAvgCost { get; set; }
    [JsonPropertyName("shortInitialMargin")]   public double ShortInitialMargin { get; set; }
    [JsonPropertyName("shortMaintenanceMargin")] public double ShortMaintenanceMargin { get; set; }
    [JsonPropertyName("longLeverage")]         public int LongLeverage { get; set; }
    [JsonPropertyName("shortLeverage")]        public int ShortLeverage { get; set; }
    [JsonPropertyName("longFrozenCost")]       public double LongFrozenCost { get; set; }
    [JsonPropertyName("longOpenedOnDay")]      public int LongOpenedOnDay { get; set; }
    [JsonPropertyName("shortOpenedOnDay")]     public int ShortOpenedOnDay { get; set; }
}

public sealed class Loan
{
    [JsonPropertyName("id")]             public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    [JsonPropertyName("amount")]         public double Amount { get; set; }
    [JsonPropertyName("interestRate")]   public double InterestRate { get; set; }
    [JsonPropertyName("turnsRemaining")] public int TurnsRemaining { get; set; }
    [JsonPropertyName("createdAt")]      public long CreatedAt { get; set; }
}

// ---------- 地块 ----------
public sealed class Cell
{
    [JsonPropertyName("id")]               public int Id { get; set; }
    [JsonPropertyName("type")]             public CellType Type { get; set; }
    [JsonPropertyName("name")]             public string Name { get; set; } = "";
    [JsonPropertyName("price")]            public double Price { get; set; }
    [JsonPropertyName("owner")]            public string? Owner { get; set; }
    [JsonPropertyName("level")]            public int Level { get; set; }
    [JsonPropertyName("basePrice")]        public double BasePrice { get; set; }
    [JsonPropertyName("visitCount")]       public int? VisitCount { get; set; }
    [JsonPropertyName("upgrade")]          public PropertyUpgrade? Upgrade { get; set; }
    [JsonPropertyName("fromAuction")]      public bool? FromAuction { get; set; }
    [JsonPropertyName("auctionReservedPrice")] public double? AuctionReservedPrice { get; set; }
    [JsonPropertyName("auctionHighestBid")] public double? AuctionHighestBid { get; set; }
    [JsonPropertyName("auctionHighestBidder")] public string? AuctionHighestBidder { get; set; }
    [JsonPropertyName("auctionActive")]    public bool? AuctionActive { get; set; }
    [JsonPropertyName("appreciation")]     public double? Appreciation { get; set; }
}

public sealed class PropertyUpgrade
{
    [JsonPropertyName("type")] public string Type { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("value")] public double Value { get; set; }
}

// ---------- 股票 / 期货 ----------
public sealed class Stock
{
    [JsonPropertyName("symbol")]              public string Symbol { get; set; } = "";
    [JsonPropertyName("name")]                public string Name { get; set; } = "";
    [JsonPropertyName("sector")]              public string Sector { get; set; } = "";
    [JsonPropertyName("price")]               public double Price { get; set; }
    [JsonPropertyName("change")]              public double Change { get; set; }
    [JsonPropertyName("trend")]               public string? Trend { get; set; }
    [JsonPropertyName("trendDays")]           public int TrendDays { get; set; }
    [JsonPropertyName("cardBias")]            public int CardBias { get; set; }
    [JsonPropertyName("cardBiasDays")]        public int CardBiasDays { get; set; }
    [JsonPropertyName("cardBiasLastUsedTurn")] public int CardBiasLastUsedTurn { get; set; }
    [JsonPropertyName("cardBiasShield")]      public bool CardBiasShield { get; set; }
    [JsonPropertyName("news")]                public string? News { get; set; }
    [JsonPropertyName("limitUp")]             public bool? LimitUp { get; set; }
    [JsonPropertyName("limitDown")]           public bool? LimitDown { get; set; }
    [JsonPropertyName("history")]             public List<Ohlc> History { get; set; } = new();
    [JsonPropertyName("base")]                public double Base { get; set; }
    [JsonPropertyName("eventEffect")]         public double EventEffect { get; set; } = 1.0;
    [JsonPropertyName("eventDays")]           public int EventDays { get; set; }
    [JsonPropertyName("eventDesc")]           public string EventDesc { get; set; } = "";
    [JsonPropertyName("consolidateDays")]     public int ConsolidateDays { get; set; }
    [JsonPropertyName("isConsolidating")]     public bool IsConsolidating { get; set; }
    [JsonPropertyName("isNoManipulator")]     public bool IsNoManipulator { get; set; }
    [JsonPropertyName("noManipulatorDays")]   public int NoManipulatorDays { get; set; }
    [JsonPropertyName("volumes")]             public List<int> Volumes { get; set; } = new();
    [JsonPropertyName("open")]                public double Open { get; set; }
    [JsonPropertyName("high")]                public double High { get; set; }
    [JsonPropertyName("low")]                 public double Low { get; set; }
    [JsonPropertyName("kline")]               public double[]? Kline { get; set; }
    [JsonPropertyName("ma5")]                 public double?[]? Ma5 { get; set; }
    [JsonPropertyName("ma10")]                public double?[]? Ma10 { get; set; }
    [JsonPropertyName("ma20")]                public double?[]? Ma20 { get; set; }
    [JsonPropertyName("rsi")]                 public double?[]? Rsi { get; set; }
    [JsonPropertyName("macd")]                public double[]? Macd { get; set; }
    [JsonPropertyName("dif")]                 public double[]? Dif { get; set; }
    [JsonPropertyName("dea")]                 public double[]? Dea { get; set; }
}

public sealed class Ohlc
{
    [JsonPropertyName("open")]   public double Open { get; set; }
    [JsonPropertyName("high")]   public double High { get; set; }
    [JsonPropertyName("low")]    public double Low { get; set; }
    [JsonPropertyName("close")]  public double Close { get; set; }
    [JsonPropertyName("volume")] public int Volume { get; set; }
}

public sealed class Futures
{
    [JsonPropertyName("symbol")]              public string Symbol { get; set; } = "";
    [JsonPropertyName("name")]                public string Name { get; set; } = "";
    [JsonPropertyName("price")]               public double Price { get; set; }
    [JsonPropertyName("change")]              public double Change { get; set; }
    [JsonPropertyName("unit")]                public int Unit { get; set; }
    [JsonPropertyName("base")]                public double Base { get; set; }
    [JsonPropertyName("volatility")]          public double Volatility { get; set; }
    [JsonPropertyName("history")]             public List<Ohlc> History { get; set; } = new();
    [JsonPropertyName("volumes")]             public List<int> Volumes { get; set; } = new();
    [JsonPropertyName("eventEffect")]         public double EventEffect { get; set; } = 1.0;
    [JsonPropertyName("eventDays")]           public int EventDays { get; set; }
    [JsonPropertyName("eventDesc")]           public string EventDesc { get; set; } = "";
    [JsonPropertyName("ma5")]                 public double?[]? Ma5 { get; set; }
    [JsonPropertyName("ma10")]                public double?[]? Ma10 { get; set; }
    [JsonPropertyName("ma20")]                public double?[]? Ma20 { get; set; }
    [JsonPropertyName("open")]                public double Open { get; set; }
    [JsonPropertyName("high")]                public double High { get; set; }
    [JsonPropertyName("low")]                 public double Low { get; set; }
    [JsonPropertyName("kline")]               public double[]? Kline { get; set; }
    [JsonPropertyName("consolidateDays")]     public int ConsolidateDays { get; set; }
    [JsonPropertyName("isConsolidating")]     public bool IsConsolidating { get; set; }
    [JsonPropertyName("isNoManipulator")]     public bool IsNoManipulator { get; set; }
    [JsonPropertyName("noManipulatorDays")]   public int NoManipulatorDays { get; set; }
    [JsonPropertyName("cardBias")]            public int CardBias { get; set; }
    [JsonPropertyName("cardBiasDays")]        public int CardBiasDays { get; set; }
    [JsonPropertyName("cardBiasLastUsedTurn")] public int CardBiasLastUsedTurn { get; set; }
    [JsonPropertyName("cardBiasShield")]      public bool CardBiasShield { get; set; }
    [JsonPropertyName("news")]                public string? News { get; set; }
    [JsonPropertyName("type")]                public string Type { get; set; } = "";
    [JsonPropertyName("category")]            public string Category { get; set; } = "";
    [JsonPropertyName("isMaterial")]          public bool IsMaterial { get; set; }
    [JsonPropertyName("limitThreshold")]      public double LimitThreshold { get; set; }
}

// ---------- 房间 ----------
public sealed class GameRoom
{
    [JsonPropertyName("code")]                public string Code { get; set; } = "";
    [JsonPropertyName("hostId")]              public string HostId { get; set; } = "";
    [JsonPropertyName("players")]             public List<Player> Players { get; set; } = new();
    [JsonPropertyName("cells")]               public List<Cell> Cells { get; set; } = new();
    [JsonPropertyName("stocks")]              public List<Stock> Stocks { get; set; } = new();
    [JsonPropertyName("futures")]             public List<Futures> Futures { get; set; } = new();
    [JsonPropertyName("gamePhase")]           public GamePhase GamePhase { get; set; } = GamePhase.Lobby;
    [JsonPropertyName("gameDate")]            public string? GameDate { get; set; }
    [JsonPropertyName("currentTurn")]         public int CurrentTurn { get; set; }
    [JsonPropertyName("currentPlayerIndex")]  public int CurrentPlayerIndex { get; set; }
    [JsonPropertyName("diceValue")]           public int? DiceValue { get; set; }
    [JsonPropertyName("selectedCell")]        public int? SelectedCell { get; set; }
    [JsonPropertyName("targetAssets")]        public double TargetAssets { get; set; }
    [JsonPropertyName("winnerId")]            public string? WinnerId { get; set; }
    [JsonPropertyName("messages")]            public List<GameMessage> Messages { get; set; } = new();
    [JsonPropertyName("logs")]                public List<string> Logs { get; set; } = new();
    [JsonPropertyName("cards")]               public List<Card> Cards { get; set; } = new();
    [JsonPropertyName("isSingleplayer")]      public bool IsSingleplayer { get; set; }
    [JsonPropertyName("createdAt")]           public long CreatedAt { get; set; }
    [JsonPropertyName("maxPlayers")]          public int MaxPlayers { get; set; } = 4;
    [JsonPropertyName("gameDay")]             public int GameDay { get; set; }
    [JsonPropertyName("currentEvent")]        public string? CurrentEvent { get; set; }
    [JsonPropertyName("attractions")]         public List<Attraction> Attractions { get; set; } = new();
    [JsonPropertyName("lastRumorReport")]     public RumorReport? LastRumorReport { get; set; }
}

public sealed class Card
{
    [JsonPropertyName("id")]     public string Id { get; set; } = "";
    [JsonPropertyName("name")]   public string Name { get; set; } = "";
    [JsonPropertyName("price")]  public double Price { get; set; }
    [JsonPropertyName("desc")]   public string Desc { get; set; } = "";
    [JsonPropertyName("category")] public string Category { get; set; } = "";
}

public sealed class GameMessage
{
    [JsonPropertyName("type")]    public string Type { get; set; } = "info";
    [JsonPropertyName("content")] public string Content { get; set; } = "";
    [JsonPropertyName("turn")]    public int Turn { get; set; }
}

public sealed class Attraction
{
    [JsonPropertyName("id")]     public string Id { get; set; } = "";
    [JsonPropertyName("name")]   public string Name { get; set; } = "";
    [JsonPropertyName("cost")]   public double Cost { get; set; }
    [JsonPropertyName("revenue")] public int Revenue { get; set; }
}

public sealed class RumorReport
{
    [JsonPropertyName("targetType")]   public string TargetType { get; set; } = "";
    [JsonPropertyName("targetName")]   public string TargetName { get; set; } = "";
    [JsonPropertyName("symbol")]       public string Symbol { get; set; } = "";
    [JsonPropertyName("direction")]    public string Direction { get; set; } = "";
    [JsonPropertyName("eventDays")]    public int EventDays { get; set; }
    [JsonPropertyName("timestamp")]    public long Timestamp { get; set; }
}