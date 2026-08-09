// =============================================================================
// Dtos.cs
// -----------------------------------------------------------------------------
// 原样承载服务端 JSON 的可空模型。Phase 0+1 只覆盖 Lobby 必需字段,
// 后续 Phase 按需扩展。所有数字字段都允许 null,避免服务端遗漏字段时崩溃。
// =============================================================================
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Richman.Client.Net;

public static class JsonOptions
{
    public static readonly JsonSerializerOptions Default = new()
    {
        PropertyNameCaseInsensitive = true,
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}

// ---------- 通用包装 ----------
public sealed class ErrorPayload
{
    [JsonPropertyName("message")] public string? Message { get; set; }
}

public sealed class MessagePayload
{
    [JsonPropertyName("type")]    public string? Type { get; set; }
    [JsonPropertyName("content")] public string? Content { get; set; }
}

public sealed class RoomPayload
{
    [JsonPropertyName("roomCode")] public string? RoomCode { get; set; }
    [JsonPropertyName("playerId")] public string? PlayerId { get; set; }
}

// ---------- 玩家 ----------
public sealed class PlayerDto
{
    [JsonPropertyName("id")]              public string? Id { get; set; }
    [JsonPropertyName("name")]            public string? Name { get; set; }
    [JsonPropertyName("color")]           public string? Color { get; set; }
    [JsonPropertyName("cash")]            public double? Cash { get; set; }
    [JsonPropertyName("deposit")]         public double? Deposit { get; set; }
    [JsonPropertyName("diamonds")]        public int?    Diamonds { get; set; }
    [JsonPropertyName("position")]        public int?    Position { get; set; }
    [JsonPropertyName("isBankrupt")]      public bool?   IsBankrupt { get; set; }
    [JsonPropertyName("isCurrentTurn")]   public bool?   IsCurrentTurn { get; set; }
    [JsonPropertyName("isAI")]            public bool?   IsAI { get; set; }
    [JsonPropertyName("aiDifficulty")]    public string? AiDifficulty { get; set; }
    [JsonPropertyName("totalAssets")]     public double? TotalAssets { get; set; }
    [JsonPropertyName("attraction")]      public int?    Attraction { get; set; }
    [JsonPropertyName("passedBank")]      public bool?   PassedBank { get; set; }
    // 建材库存
    [JsonPropertyName("cards")]            public List<string>?  Cards { get; set; }
    [JsonPropertyName("stocks")]           public List<StockHoldingDto>? Stocks { get; set; }
    [JsonPropertyName("materials")]       public MaterialsDto? Materials { get; set; }
    [JsonPropertyName("properties")]      public List<int>? Properties { get; set; }
    [JsonPropertyName("hasTonghuashun")]  public bool?   HasTonghuashun { get; set; }
    [JsonPropertyName("loans")]           public List<LoanDto>? Loans { get; set; }
    [JsonPropertyName("stayTurns")]       public int? StayTurns { get; set; }
    [JsonPropertyName("atStockExchange")] public bool? AtStockExchange { get; set; }
    [JsonPropertyName("atFuturesExchange")] public bool? AtFuturesExchange { get; set; }
}

public sealed class LoanDto
{
    [JsonPropertyName("id")]              public string? Id { get; set; }
    [JsonPropertyName("amount")]          public double? Amount { get; set; }
    [JsonPropertyName("interestRate")]    public double? InterestRate { get; set; }
    [JsonPropertyName("turnsRemaining")]  public int?    TurnsRemaining { get; set; }
    [JsonPropertyName("createdAt")]       public long?   CreatedAt { get; set; }
}

public sealed class StockHoldingDto
{
    [JsonPropertyName("symbol")]            public string?  Symbol { get; set; }
    [JsonPropertyName("quantity")]          public int?     Quantity { get; set; }
    [JsonPropertyName("avgCost")]           public double?  AvgCost { get; set; }
    [JsonPropertyName("shortQuantity")]     public int?     ShortQuantity { get; set; }
    [JsonPropertyName("shortAvgCost")]      public double?  ShortAvgCost { get; set; }
    [JsonPropertyName("shortMarginFrozen")] public double?  ShortMarginFrozen { get; set; }
    [JsonPropertyName("shortCashReceived")] public double?  ShortCashReceived { get; set; }
}

public sealed class MaterialsDto
{
    [JsonPropertyName("cement")]         public int? Cement { get; set; }
    [JsonPropertyName("steel")]          public int? Steel { get; set; }
    [JsonPropertyName("rubber")]         public int? Rubber { get; set; }
    [JsonPropertyName("preciousMetals")] public int? PreciousMetals { get; set; }
    [JsonPropertyName("diamonds")]       public int? Diamonds { get; set; }
}

// ---------- 格子 ----------
public sealed class CellDto
{
    [JsonPropertyName("id")]        public int?    Id { get; set; }
    [JsonPropertyName("type")]      public string? Type { get; set; }
    [JsonPropertyName("name")]      public string? Name { get; set; }
    [JsonPropertyName("price")]     public double? Price { get; set; }
    [JsonPropertyName("owner")]     public string? Owner { get; set; }
    [JsonPropertyName("level")]     public int?    Level { get; set; }
    [JsonPropertyName("basePrice")] public double? BasePrice { get; set; }
    [JsonPropertyName("visitCount")] public int?   VisitCount { get; set; }
    // 普通升级类型: normal | hotel | smelter | diamondMine | agency | resort | mall | monument
    [JsonPropertyName("upgrade")]   public string? Upgrade { get; set; }
    [JsonPropertyName("fromAuction")] public bool?   FromAuction { get; set; }
    [JsonPropertyName("auctionActive")]      public bool?   AuctionActive { get; set; }
    [JsonPropertyName("auctionReservedPrice")] public double? AuctionReservedPrice { get; set; }
    [JsonPropertyName("auctionHighestBid")]    public double? AuctionHighestBid { get; set; }
    [JsonPropertyName("auctionHighestBidder")] public string? AuctionHighestBidder { get; set; }
    [JsonPropertyName("appreciation")] public double? Appreciation { get; set; }
}

// ---------- 股票 / 期货 (Phase 2+ 详细字段) ----------
public sealed class KLineDto
{
    [JsonPropertyName("open")]   public double? Open { get; set; }
    [JsonPropertyName("high")]   public double? High { get; set; }
    [JsonPropertyName("low")]    public double? Low { get; set; }
    [JsonPropertyName("close")]  public double? Close { get; set; }
    [JsonPropertyName("volume")] public double? Volume { get; set; }
}

public sealed class StockDto
{
    [JsonPropertyName("symbol")]  public string? Symbol { get; set; }
    [JsonPropertyName("name")]    public string? Name { get; set; }
    [JsonPropertyName("sector")]  public string? Sector { get; set; }
    [JsonPropertyName("price")]   public double? Price { get; set; }
    [JsonPropertyName("change")]  public double? Change { get; set; }
    [JsonPropertyName("trend")]   public string? Trend { get; set; }
    [JsonPropertyName("limitUp")] public bool?   LimitUp { get; set; }
    [JsonPropertyName("limitDown")] public bool? LimitDown { get; set; }
    [JsonPropertyName("history")] public List<KLineDto>? History { get; set; }
}

public sealed class FuturesDto
{
    [JsonPropertyName("symbol")]      public string? Symbol { get; set; }
    [JsonPropertyName("name")]        public string? Name { get; set; }
    [JsonPropertyName("price")]       public double? Price { get; set; }
    [JsonPropertyName("change")]      public double? Change { get; set; }
    [JsonPropertyName("type")]        public string? Type { get; set; }
    [JsonPropertyName("category")]    public string? Category { get; set; }
    [JsonPropertyName("expiresOnDay")] public int?   ExpiresOnDay { get; set; }
}

// ---------- 聊天消息 ----------
public sealed class ChatMessageDto
{
    [JsonPropertyName("id")]        public string?  Id { get; set; }
    [JsonPropertyName("type")]      public string?  Type { get; set; }
    [JsonPropertyName("content")]   public string?  Content { get; set; }
    [JsonPropertyName("timestamp")] public long?    Timestamp { get; set; }
}

// ---------- 游戏状态本体 ----------
public sealed class GameStateDto
{
    [JsonPropertyName("roomCode")]           public string?  RoomCode { get; set; }
    [JsonPropertyName("mode")]               public string?  Mode { get; set; }
    [JsonPropertyName("targetAssets")]       public double?  TargetAssets { get; set; }
    [JsonPropertyName("maxPlayers")]         public int?     MaxPlayers { get; set; }
    [JsonPropertyName("winnerId")]           public string?  WinnerId { get; set; }

    [JsonPropertyName("players")]            public List<PlayerDto>?     Players { get; set; }
    [JsonPropertyName("cells")]              public List<CellDto>?       Cells { get; set; }
    [JsonPropertyName("stocks")]             public List<StockDto>?      Stocks { get; set; }
    [JsonPropertyName("futures")]            public List<FuturesDto>?    Futures { get; set; }
    [JsonPropertyName("messages")]           public List<ChatMessageDto>? Messages { get; set; }

    [JsonPropertyName("gameDate")]           public string?  GameDate { get; set; }
    [JsonPropertyName("currentPlayerIndex")] public int?     CurrentPlayerIndex { get; set; }
    [JsonPropertyName("currentTurn")]        public int?     CurrentTurn { get; set; }
    [JsonPropertyName("gamePhase")]          public string?  GamePhase { get; set; }   // lobby / playing / ended
    [JsonPropertyName("selectedCell")]       public int?     SelectedCell { get; set; }
    [JsonPropertyName("diceValue")]          public int?     DiceValue { get; set; }
    [JsonPropertyName("forcedDice")]         public int?     ForcedDice { get; set; }
}

// ---------- 谣言报告 ----------
public sealed class RumorReportDto
{
    [JsonPropertyName("targetSymbol")] public string? TargetSymbol { get; set; }
    [JsonPropertyName("targetName")]   public string? TargetName { get; set; }
    [JsonPropertyName("targetType")]   public string? TargetType { get; set; }
    [JsonPropertyName("direction")]    public string? Direction { get; set; }
    [JsonPropertyName("eventDays")]    public int?    EventDays { get; set; }
    [JsonPropertyName("newsContent")]  public string? NewsContent { get; set; }
    [JsonPropertyName("hint")]         public string? Hint { get; set; }
}
