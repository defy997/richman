// Phase 6 smoke: tradeFutures long/short/close
using System;
using System.Threading.Tasks;
using Richman.Client.Net;

namespace Richman.Client.Smoke;

public static class Phase6Smoke
{
    public static async Task RunAsync()
    {
        Console.WriteLine("[p6] connecting...");
        var client = new GameClient();
        client.SetServerUrl("http://localhost:3002");
        client.Connected += (_, _) => Console.WriteLine("[p6] CONNECTED");
        client.MessageStream.Subscribe(m => Console.WriteLine($"[p6] MSG {m.Item1}: {m.Item2}"));
        client.ErrorStream.Subscribe(e => Console.WriteLine($"[p6] ERR: {e}"));

        await client.ConnectAsync();
        await Task.Delay(800);
        client.CreateSingleplayer("P6", aiCount: 1, difficulty: "easy");
        await Task.Delay(2500);
        client.StartGame();
        await Task.Delay(2000);

        // 用服务端代码中已知的 symbol (FT01 ~ FT07)
        const string sym = "FT01";
        Console.WriteLine($"[p6] -> buy {sym} 1 手 3x (做多)");
        client.TradeFutures(sym, "buy", 1, 3);
        await Task.Delay(1500);
        Console.WriteLine($"[p6] -> sell {sym} 1 手 3x (做空)");
        client.TradeFutures(sym, "sell", 1, 3);
        await Task.Delay(1500);
        Console.WriteLine($"[p6] -> close {sym} 2 手");
        client.TradeFutures(sym, "close", 2, 1);
        await Task.Delay(1500);

        Console.WriteLine("[p6] -> 测试不存在的期货");
        client.TradeFutures("FAKE", "buy", 1, 1);
        await Task.Delay(1500);

        await client.DisconnectAsync();
        Console.WriteLine("[p6] done.");
    }
}
