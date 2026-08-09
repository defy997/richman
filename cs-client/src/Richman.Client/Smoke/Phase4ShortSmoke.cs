// Phase 4 smoke (短版): 反复 [投骰 -> 结束回合] 直到经过银行
using System;
using System.Threading.Tasks;
using Richman.Client.Net;

namespace Richman.Client.Smoke;

public static class Phase4ShortSmoke
{
    public static async Task RunAsync()
    {
        Console.WriteLine("[p4s] connecting...");
        var client = new GameClient();
        client.SetServerUrl("http://localhost:3002");
        client.Connected += (_, _) => Console.WriteLine("[p4s] CONNECTED");
        client.MessageStream.Subscribe(m => Console.WriteLine($"[p4s] MSG {m.Item1}: {m.Item2}"));
        client.ErrorStream.Subscribe(e => Console.WriteLine($"[p4s] ERR: {e}"));

        GameStateDto? last = null;
        client.StateStream.Subscribe(s =>
        {
            if (s is null) return;
            last = s;
        });

        await client.ConnectAsync();
        await Task.Delay(800);
        client.CreateSingleplayer("P4S", aiCount: 1, difficulty: "easy");
        await Task.Delay(2500);
        client.StartGame();
        await Task.Delay(1500);

        Console.WriteLine("[p4s] -> 存款 1000 (应失败: 不在银行)");
        client.BankDeposit(1000);
        await Task.Delay(1000);

        // 反复走直到 passedBank
        for (int round = 0; round < 50; round++)
        {
            var me = GetMe(last);
            if (me is null) { await Task.Delay(800); continue; }
            if (me.PassedBank == true) { Console.WriteLine($"[p4s] -> ✓ 到达银行 pos={me.Position}"); break; }

            // 等到我的回合
            while (GetMe(last)?.IsCurrentTurn != true)
            {
                await Task.Delay(500);
            }

            Console.WriteLine($"[p4s] -> 投骰子 (round={round}, pos={GetMe(last)?.Position})");
            client.RollDice();
            await Task.Delay(1500);

            // 结束我的回合
            Console.WriteLine($"[p4s] -> endTurn");
            client.EndTurn();
            await Task.Delay(1200);
        }

        var myFinal = GetMe(last);
        if (myFinal?.PassedBank != true)
        {
            Console.WriteLine("[p4s] -> 失败: 没在 50 轮内走到银行");
            await client.DisconnectAsync();
            return;
        }

        Console.WriteLine("[p4s] -> 存款 1000");
        client.BankDeposit(1000);
        await Task.Delay(1500);

        Console.WriteLine("[p4s] -> 取款 500");
        client.BankWithdraw(500);
        await Task.Delay(1500);

        Console.WriteLine("[p4s] -> 现金->存款 2000");
        client.BankConvert("cashToDeposit", 2000);
        await Task.Delay(1500);

        Console.WriteLine("[p4s] -> 贷款 500 (应失败: 无房产)");
        client.TakeLoan(500);
        await Task.Delay(1500);

        var finalMe = GetMe(last);
        if (finalMe is not null)
            Console.WriteLine($"[p4s] final cash={finalMe.Cash} dep={finalMe.Deposit} loans={finalMe.Loans?.Count ?? 0}");

        await client.DisconnectAsync();
        Console.WriteLine("[p4s] done.");
    }

    private static PlayerDto? GetMe(GameStateDto? s)
    {
        if (s?.Players is null) return null;
        foreach (var p in s.Players)
            if (p.IsAI != true) return p;
        return null;
    }
}
