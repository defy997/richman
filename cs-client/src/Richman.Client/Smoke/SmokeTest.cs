// Phase 0+1 联调 smoke test
// 跑法: cd /root/richman/cs-client/src/Richman.Client && dotnet run -- smoke
using System;
using System.Threading.Tasks;
using Richman.Client.Net;

namespace Richman.Client.Smoke;

public static class SmokeTest
{
    public static async Task RunAsync()
    {
        Console.WriteLine("[smoke] starting, target = http://localhost:3002");
        var client = new GameClient();
        client.SetServerUrl("http://localhost:3002");

        client.Connected += (_, _) => Console.WriteLine("[smoke] CONNECTED");
        client.Disconnected += (_, _) => Console.WriteLine("[smoke] DISCONNECTED");
        client.RoomCreated += (_, p) => Console.WriteLine($"[smoke] ROOM_CREATED {p.RoomCode} / pid={p.PlayerId}");
        client.RoomJoined  += (_, p) => Console.WriteLine($"[smoke] ROOM_JOINED  {p.RoomCode} / pid={p.PlayerId}");
        client.ErrorStream.Subscribe(e => Console.WriteLine($"[smoke] ERROR: {e}"));
        client.MessageStream.Subscribe(m => Console.WriteLine($"[smoke] MSG {m.Item1}: {m.Item2}"));
        client.StateStream.Subscribe(s =>
        {
            if (s is null) return;
            Console.WriteLine($"[smoke] state phase={s.GamePhase} players={(s.Players?.Count ?? 0)} turn={s.CurrentTurn}");
        });

        await client.ConnectAsync();
        await Task.Delay(800);

        // 1. 创建单人房间
        client.CreateSingleplayer("C#Smoke", aiCount: 2, difficulty: "easy");
        await Task.Delay(2500);

        // 2. 开始游戏
        client.StartGame();
        await Task.Delay(2000);

        // 3. 投骰子
        client.RollDice();
        await Task.Delay(2000);

        // 4. 结束回合
        client.EndTurn();
        await Task.Delay(2000);

        Console.WriteLine("[smoke] done.");
        await client.DisconnectAsync();
    }
}
