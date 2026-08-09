// Phase 7 smoke: 买卡 + 用卡 + 谣言
using System;
using System.Threading.Tasks;
using Richman.Client.Net;

namespace Richman.Client.Smoke;

public static class Phase7Smoke
{
    public static async Task RunAsync()
    {
        Console.WriteLine("[p7] connecting...");
        var client = new GameClient();
        client.SetServerUrl("http://localhost:3002");
        client.Connected += (_, _) => Console.WriteLine("[p7] CONNECTED");
        client.MessageStream.Subscribe(m => Console.WriteLine($"[p7] MSG {m.Item1}: {m.Item2}"));
        client.ErrorStream.Subscribe(e => Console.WriteLine($"[p7] ERR: {e}"));
        client.RumorStream.Subscribe(r =>
        {
            Console.WriteLine($"[p7] RUMOR target={r.TargetSymbol} '{r.TargetName}' dir={r.Direction} days={r.EventDays}");
            Console.WriteLine($"[p7]    news: {r.NewsContent}");
        });

        await client.ConnectAsync();
        await Task.Delay(800);
        client.CreateSingleplayer("P7", aiCount: 1, difficulty: "easy");
        await Task.Delay(2500);
        client.StartGame();
        await Task.Delay(2000);

        // 1. 谣言卡 (50💎) — 先买以验证谣言卡购买路径
        Console.WriteLine("[p7] -> 买谣言卡 (50💎)");
        client.BuyCard("谣言卡");
        await Task.Delay(1500);

        // 2. 骰子卡 (30💎) — 最便宜
        Console.WriteLine("[p7] -> 买骰子卡 (30💎)");
        client.BuyCard("骰子卡");
        await Task.Delay(1500);

        // 3. 停留卡 (40💎)
        Console.WriteLine("[p7] -> 买停留卡 (40💎)");
        client.BuyCard("停留卡");
        await Task.Delay(1500);

        // 4. 错误: 买不存在的卡
        Console.WriteLine("[p7] -> 买幻影卡 (预期失败)");
        client.BuyCard("幻影卡");
        await Task.Delay(1500);

        // 5. 用骰子卡 (int 参数 -> JSON number)
        Console.WriteLine("[p7] -> 使用骰子卡, 强制投 6");
        client.UseCard("骰子卡", 6);
        await Task.Delay(1500);

        // 6. 投骰子 (验证是否被强制 6)
        Console.WriteLine("[p7] -> 投骰子");
        client.RollDice();
        await Task.Delay(1500);

        // 7. 使用谣言卡 (string 参数)
        Console.WriteLine("[p7] -> 使用谣言卡 STK01:good (预期失败: 不在交易所)");
        client.UseCard("谣言卡", "STK01:good");
        await Task.Delay(1500);

        // 8. 使用停留卡
        Console.WriteLine("[p7] -> 使用停留卡");
        client.UseCard("停留卡", (string?)null);
        await Task.Delay(1500);

        await client.DisconnectAsync();
        Console.WriteLine("[p7] done.");
    }
}
