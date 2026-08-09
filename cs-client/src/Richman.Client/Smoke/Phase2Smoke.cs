// Phase 2 联调: 创建单人游戏后,把收到的第一个 gameState 的 cells/stocks 数量打印出来
using System;
using System.Threading.Tasks;
using Richman.Client.Net;

namespace Richman.Client.Smoke;

public static class Phase2Smoke
{
    public static async Task RunAsync()
    {
        Console.WriteLine("[phase2] connecting...");
        var client = new GameClient();
        client.SetServerUrl("http://localhost:3002");
        client.Connected += (_, _) => Console.WriteLine("[phase2] CONNECTED");
        client.RoomCreated += (_, p) => Console.WriteLine($"[phase2] ROOM {p.RoomCode}");
        client.MessageStream.Subscribe(m => Console.WriteLine($"[phase2] MSG {m.Item1}: {m.Item2}"));
        client.ErrorStream.Subscribe(e => Console.WriteLine($"[phase2] ERR: {e}"));

        client.StateStream.Subscribe(s =>
        {
            if (s is null) return;
            if (s.GamePhase != "playing") return;
            Console.WriteLine($"[phase2] STATE " +
                $"phase={s.GamePhase} turn={s.CurrentTurn} players={s.Players?.Count ?? 0} " +
                $"cells={s.Cells?.Count ?? 0} stocks={s.Stocks?.Count ?? 0} futures={s.Futures?.Count ?? 0}");
            if (s.Cells is { Count: > 0 })
            {
                var first = s.Cells[0];
                Console.WriteLine($"[phase2]   cell#0 name={first.Name} type={first.Type} level={first.Level} basePrice={first.BasePrice}");
                var anyOwned = s.Cells.FirstOrDefault(c => !string.IsNullOrEmpty(c.Owner));
                if (anyOwned != null)
                {
                    var owner = s.Players?.FirstOrDefault(p => p.Id == anyOwned.Owner);
                    Console.WriteLine($"[phase2]   owned cell #{anyOwned.Id} '{anyOwned.Name}' -> {owner?.Name} ({owner?.Color})");
                }
            }
        });

        await client.ConnectAsync();
        await Task.Delay(800);
        client.CreateSingleplayer("Phase2Smoke", aiCount: 2, difficulty: "easy");
        await Task.Delay(3000);
        client.StartGame();
        await Task.Delay(2500);
        client.RollDice();
        await Task.Delay(2500);
        client.EndTurn();
        await Task.Delay(1500);
        await client.DisconnectAsync();
        Console.WriteLine("[phase2] done.");
    }
}
