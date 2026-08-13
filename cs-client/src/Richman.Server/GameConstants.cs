using Richman.Shared;

namespace Richman.Server;

public static class GameConstants
{
    public static readonly string[] PlayerColors = { "#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22" };
    public const decimal InitialCash = 50000;
    public const decimal InitialDeposit = 50000;
    public const int InitialDiamonds = 100;
    public const decimal StartBonus = 1000;
    public const decimal SingleplayerTarget = 100_000_000;
    public const decimal BankFeeRate = 0.01m;
    public const int TotalCells = 64;

    // Stock constants
    public const decimal ShortInitialMarginRate = 0.5m;
    public const decimal ShortMaintenanceRate = 0.3m;

    // Futures constants
    public const decimal FuturesInitialMarginRate = 0.20m;
    public const decimal FuturesMaintenanceMarginRate = 0.15m;
    public const decimal FuturesFeeRate = 0.02m;

    // Loan constants
    public const decimal LoanInterestRate = 0.05m;
    public const int LoanTurnsUntilDue = 30;
    public const decimal LoanFeeRate = 0.02m;

    // Attraction exchange rate: 1 attraction = 2000 cash
    public const decimal AttractionExchangeRate = 2000;

    // Tonghuashun price
    public const decimal TonghuashunPrice = 20_000_000;

    // Seize card cost
    public const int SeizeCardCost = 200;

    public static readonly Dictionary<PropertyUpgrade, Dictionary<string, int>> UpgradeMaterialCost = new()
    {
        { PropertyUpgrade.Normal, new Dictionary<string, int> { { "cement", 5 }, { "steel", 3 }, { "rubber", 1 } } },
        { PropertyUpgrade.Hotel, new Dictionary<string, int> { { "cement", 30 }, { "steel", 20 }, { "rubber", 5 }, { "cash", 5000 } } },
        { PropertyUpgrade.Smelter, new Dictionary<string, int> { { "cement", 25 }, { "steel", 30 }, { "rubber", 5 }, { "preciousMetals", 10 }, { "cash", 8000 } } },
        { PropertyUpgrade.DiamondMine, new Dictionary<string, int> { { "cement", 20 }, { "steel", 40 }, { "rubber", 8 }, { "cash", 15000 } } },
        { PropertyUpgrade.Agency, new Dictionary<string, int> { { "cement", 15 }, { "steel", 10 }, { "rubber", 3 }, { "preciousMetals", 5 }, { "cash", 12000 } } },
        { PropertyUpgrade.Resort, new Dictionary<string, int> { { "cement", 25 }, { "steel", 15 }, { "rubber", 10 }, { "cash", 10000 } } },
        { PropertyUpgrade.Mall, new Dictionary<string, int> { { "cement", 30 }, { "steel", 25 }, { "rubber", 8 }, { "preciousMetals", 5 }, { "cash", 12000 } } },
        { PropertyUpgrade.Monument, new Dictionary<string, int> { { "cement", 40 }, { "steel", 30 }, { "rubber", 15 }, { "preciousMetals", 10 }, { "cash", 20000 } } }
    };

    public static readonly string[] AiNamesEasy = { "小李", "阿强", "小王" };
    public static readonly string[] AiNamesNormal = { "陈总", "Lisa", "Mark" };
    public static readonly string[] AiNamesHard = { "金融大鳄", "巴菲特", "索罗斯" };

    public static readonly string[] GiftCards = { "停留卡", "骰子卡", "均贫卡", "红心卡", "黑心卡", "地皮升级卡", "护盾卡", "谣言卡" };

    public static readonly List<string[]> StockNames = new()
    {
        new[] { "腾讯控股", "阿里巴巴", "百度集团", "美团" },
        new[] { "中国平安", "招商银行", "中国太保", "中信证券" },
        new[] { "中国石油", "中国石化", "中国神华", "长江电力" },
        new[] { "恒瑞医药", "迈瑞医疗", "药明康德", "爱尔眼科" },
        new[] { "贵州茅台", "五粮液", "美的集团", "比亚迪" },
        new[] { "中国中车", "三一重工", "宝钢股份", "海螺水泥" },
        new[] { "万科A", "保利发展", "中国建筑", "中国中铁" },
        new[] { "隆平高科", "登海种业", "北大荒", "新希望" },
        new[] { "中国船舶", "中航沈飞", "航发动力", "中航光电" },
        new[] { "新东方", "好未来", "中公教育", "学而思" },
        new[] { "哔哩哔哩", "网易", "万达电影", "宋城演艺" },
        new[] { "中国国航", "南方航空", "中远海控", "京沪高铁" },
        new[] { "顺丰控股", "京东物流", "圆通速递", "中通快递" },
        new[] { "紫金矿业", "洛阳钼业", "赣锋锂业", "天齐锂业" },
        new[] { "碧水源", "伟明环保", "瀚蓝环境", "上海环境" }
    };

    public static readonly string[] StockSectors = { "TMT", "金融", "能源", "消费", "消费", "周期", "周期", "农业", "防务", "TMT", "消费", "基建", "基建", "周期", "基建" };

    public static readonly List<Dictionary<string, object>> FuturesNames = new()
    {
        new() { { "name", "黄金期货" }, { "type", FuturesType.Gold }, { "category", FuturesCategory.Precious }, { "isMaterial", false } },
        new() { { "name", "白银期货" }, { "type", FuturesType.Silver }, { "category", FuturesCategory.Precious }, { "isMaterial", false } },
        new() { { "name", "钻石期货" }, { "type", FuturesType.Diamond }, { "category", FuturesCategory.Precious }, { "isMaterial", false } },
        new() { { "name", "水泥期货" }, { "type", FuturesType.Cement }, { "category", FuturesCategory.Material }, { "isMaterial", true } },
        new() { { "name", "钢材期货" }, { "type", FuturesType.Steel }, { "category", FuturesCategory.Material }, { "isMaterial", true } },
        new() { { "name", "橡胶期货" }, { "type", FuturesType.Rubber }, { "category", FuturesCategory.Material }, { "isMaterial", true } },
        new() { { "name", "原油期货" }, { "type", FuturesType.Oil }, { "category", FuturesCategory.Energy }, { "isMaterial", false } },
        new() { { "name", "小麦期货" }, { "type", FuturesType.Wheat }, { "category", FuturesCategory.Agriculture }, { "isMaterial", false } }
    };

    public static readonly string[] RegionNames =
    {
        "朝阳", "海淀", "丰台", "石景山", "西城", "东城", "崇文", "宣武", "昌平", "大兴",
        "通州", "顺义", "怀柔", "密云", "平谷", "延庆", "门头沟", "房山", "燕山", "黄村",
        "滨海", "河东", "河西", "南开", "河北", "红桥", "东丽", "西青", "津南", "北辰",
        "武清", "静海", "宝坻", "宁河", "蓟县", "长安", "桥西", "新华", "裕华", "井陉",
        "浦东", "黄浦", "徐汇", "长宁", "静安", "普陀", "虹口", "杨浦", "闵行", "宝山",
        "嘉定", "金山", "松江", "青浦", "奉贤", "崇明", "西湖", "滨江", "上城", "下城",
        "拱墅", "江干", "余杭", "萧山", "富阳", "临安"
    };
}

public static class GameHelper
{
    private static readonly Random _random = new();

    public static string GenerateRoomCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var code = new char[4];
        for (int i = 0; i < 4; i++)
        {
            code[i] = chars[_random.Next(chars.Length)];
        }
        return new string(code);
    }

    public static int RollDice() => _random.Next(1, 7);

    public static string TodayString() => DateTime.UtcNow.ToString("yyyy-MM-dd");

    public static string AddDays(string dateString, int days)
    {
        if (DateTime.TryParse(dateString, out var date))
        {
            return date.AddDays(days).ToString("yyyy-MM-dd");
        }
        return dateString;
    }

    public static bool DeductFunds(Player player, decimal amount, string source = "auto")
    {
        if (amount <= 0) return true;

        if (source == "cash")
        {
            if (player.Cash < amount) return false;
            player.Cash -= amount;
            return true;
        }

        if (source == "deposit")
        {
            if (player.Deposit < amount) return false;
            player.Deposit -= amount;
            return true;
        }

        var totalAvail = player.Cash + player.Deposit;
        if (totalAvail < amount) return false;

        var fromCash = Math.Min(player.Cash, amount);
        player.Cash -= fromCash;
        var remaining = amount - fromCash;
        if (remaining > 0)
        {
            player.Deposit -= remaining;
        }
        return true;
    }

    public static void AddFunds(Player player, decimal amount, string target = "auto")
    {
        if (amount <= 0) return;
        if (target == "cash")
            player.Cash += amount;
        else
            player.Deposit += amount;
    }
}
