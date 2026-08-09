// Phase 4 smoke: 创建单人 -> 反复投骰直到站在银行 -> 存款 -> 买地 -> 贷款 -> 还款
using System;
using System.Threading.Tasks;
using Richman.Client.Net;

namespace Richman.Client.Smoke;

public static class Phase4Smoke
{
    public static async Task RunAsync()
    {
        Console.WriteLine("[phase4] connecting...");
        var client = new GameClient();
        client.SetServerUrl("http://localhost:3002");
        client.Connected += (_, _) => Console.WriteLine("[phase4] CONNECTED");
        client.RoomCreated += (_, p) => Console.WriteLine($"[phase4] ROOM {p.RoomCode}");
        client.MessageStream.Subscribe(m => Console.WriteLine($"[phase4] MSG {m.Item1}: {m.Item2}"));
        client.ErrorStream.Subscribe(e => Console.WriteLine($"[phase4] ERR: {e}"));

        GameStateDto? lastState = null;
        client.StateStream.Subscribe(s =>
        {
            if (s is null) return;
            lastState = s;
            if (s.GamePhase != "playing") return;
            if (s.CurrentPlayerIndex is int cpi && s.Players is { } ps && cpi >= 0 && cpi < ps.Count)
            {
                var p = ps[cpi];
                Console.WriteLine($"[phase4] STATE turn={s.CurrentTurn} cur={p.Name} pos={p.Position} cash={p.Cash} dep={p.Deposit} passedBank={p.PassedBank} properties={(p.Properties?.Count ?? 0)} loans={(p.Loans?.Count ?? 0)}");
            }
        });

        await client.ConnectAsync();
        await Task.Delay(800);
        client.CreateSingleplayer("Phase4Smoke", aiCount: 1, difficulty: "easy");
        await Task.Delay(2500);
        client.StartGame();
        await Task.Delay(1500);

        // 反复投骰直到 passedBank == true (我的回合且我在银行地块上)
        for (int round = 0; round < 30; round++)
        {
            var me = CurrentPlayer(lastState);
            if (me is null) { await Task.Delay(800); continue; }
            if (me.PassedBank == true)
            {
                Console.WriteLine($"[phase4] -> 我到达银行了! pos={me.Position}");
                break;
            }
            // 不是我的回合或者还没投骰
            if (me.IsCurrentTurn != true)
            {
                await Task.Delay(1000);
                continue;
            }
            // 投骰子
            Console.WriteLine($"[phase4] -> 投骰子 (round={round})");
            client.RollDice();
            await Task.Delay(1500);
        }

        // 走到了银行: 存款 1000
        await Task.Delay(1000);
        Console.WriteLine("[phase4] -> 存款 1000");
        client.BankDeposit(1000);
        await Task.Delay(1500);

        // 取款 500
        Console.WriteLine("[phase4] -> 取款 500");
        client.BankWithdraw(500);
        await Task.Delay(1500);

        // 试贷款 500(应该错误: 至少需要 1 块地皮)
        Console.WriteLine("[phase4] -> 贷款 500 (预期失败: 无房产)");
        client.TakeLoan(500);
        await Task.Delay(1500);

        // 结束回合
        client.EndTurn();
        await Task.Delay(1500);

        // 反复投骰直到我又回到银行(多次投骰,直到我的回合且 passedBank)
        for (int round = 0; round < 30; round++)
        {
            var me = CurrentPlayer(lastState);
            if (me is null) { await Task.Delay(800); continue; }
            if (me.IsCurrentTurn == true && me.PassedBank == true)
            {
                Console.WriteLine($"[phase4] -> 又到银行, 此时 pos={me.Position} properties={(me.Properties?.Count ?? 0)}");
                break;
            }
            if (me.IsCurrentTurn == true)
            {
                Console.WriteLine($"[phase4] -> 投骰子 (round={round})");
                client.RollDice();
            }
            await Task.Delay(1500);
        }

        // 走到银行 → 走到一块空地 -> 买
        await Task.Delay(800);
        var me2 = CurrentPlayer(lastState);
        if (me2 is not null && me2.IsCurrentTurn == true && me2.PassedBank == true)
        {
            // 投一次骰子找空地买
            client.RollDice();
            await Task.Delay(1500);
            var me3 = CurrentPlayer(lastState);
            if (me3?.Position is int pos && lastState?.Cells is { } cells && pos < cells.Count)
            {
                var c = cells[pos];
                if (string.IsNullOrEmpty(c.Owner) && c.Type == "empty" && c.Id is int cid)
                {
                    Console.WriteLine($"[phase4] -> 买地 {c.Id} {c.Name} ${c.Price}");
                    client.BuyProperty(cid);
                    await Task.Delay(1500);
                }
            }
        }

        // 再走回银行
        for (int round = 0; round < 40; round++)
        {
            var me = CurrentPlayer(lastState);
            if (me is null) { await Task.Delay(800); continue; }
            if (me.IsCurrentTurn == true && me.PassedBank == true && (me.Properties?.Count ?? 0) > 0)
            {
                Console.WriteLine($"[phase4] -> 再次到银行 (有房产)");
                break;
            }
            if (me.IsCurrentTurn == true)
            {
                client.RollDice();
            }
            await Task.Delay(1500);
        }

        // 贷款 1000
        await Task.Delay(800);
        Console.WriteLine("[phase4] -> 贷款 1000");
        client.TakeLoan(1000);
        await Task.Delay(1500);

        // 取最新 loans
        var myLoans = CurrentPlayer(lastState)?.Loans;
        if (myLoans is { Count: > 0 })
        {
            var firstId = myLoans[0].Id;
            Console.WriteLine($"[phase4] -> 还款 loanId={firstId}");
            client.RepayLoan(firstId!);
            await Task.Delay(1500);
        }

        await client.DisconnectAsync();
        Console.WriteLine("[phase4] done.");
    }

    private static PlayerDto? CurrentPlayer(GameStateDto? s)
    {
        if (s is null || s.CurrentPlayerIndex is not int cpi || s.Players is null) return null;
        if (cpi < 0 || cpi >= s.Players.Count) return null;
        return s.Players[cpi];
    }
}
