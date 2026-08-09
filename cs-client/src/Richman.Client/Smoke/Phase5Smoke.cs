// Phase 5 smoke: 验证股票列表 + 交易 buy/sell
using System;
using System.Threading.Tasks;
using Richman.Client.Net;

namespace Richman.Client.Smoke;

public static class Phase5Smoke
{
    public static async Task RunAsync()
    {
        Console.WriteLine("[p5] connecting...");
        var client = new GameClient();
        client.SetServerUrl("http://localhost:3002");
        client.Connected += (_, _) => Console.WriteLine("[p5] CONNECTED");
        client.MessageStream.Subscribe(m => Console.WriteLine($"[p5] MSG {m.Item1}: {m.Item2}"));
        client.ErrorStream.Subscribe(e => Console.WriteLine($"[p5] ERR: {e}"));

        GameStateDto? last = null;
        client.StateStream.Subscribe(s =>
        {
            if (s is null) return;
            last = s;
            if (s.GamePhase != "playing") return;
            if (s.Stocks is { Count: > 0 })
            {
                var first = s.Stocks[0];
                Console.WriteLine($"[p5] tick stocks={s.Stocks.Count} futures={s.Futures?.Count ?? 0} | first {first.Symbol} '{first.Name}' price={first.Price} hist={first.History?.Count ?? 0} sectors={s.Stocks.Select(x => x.Sector).Distinct().Count()}");
            }
        });

        await client.ConnectAsync();
        await Task.Delay(800);
        client.CreateSingleplayer("P5", aiCount: 1, difficulty: "easy");
        await Task.Delay(2500);
        client.StartGame();
        await Task.Delay(1500);

        // 1. 买第一只股票
        var st = last?.Stocks?.FirstOrDefault();
        if (st is { Symbol: { } sym })
        {
            Console.WriteLine($"[p5] -> buy {sym} 10 股");
            client.TradeStock(sym, "buy", 10, 1);
            await Task.Delay(1500);

            // 2. 卖出 5 股
            Console.WriteLine($"[p5] -> sell {sym} 5 股");
            client.TradeStock(sym, "sell", 5, 1);
            await Task.Delay(1500);

            // 3. 做空 5 股
            Console.WriteLine($"[p5] -> short {sym} 5 股");
            client.TradeStock(sym, "short", 5, 1);
            await Task.Delay(1500);

            // 4. 平仓 5 股
            Console.WriteLine($"[p5] -> cover {sym} 5 股");
            client.TradeStock(sym, "cover", 5, 1);
            await Task.Delay(1500);
        }

        // 5. 测试一个不存在的股票(Expected error)
        Console.WriteLine("[p5] -> 买不存在的股票 FAKE");
        client.TradeStock("FAKE", "buy", 1, 1);
        await Task.Delay(1500);

        await client.DisconnectAsync();
        Console.WriteLine("[p5] done.");
    }
}
