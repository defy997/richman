// Phase 3 smoke: 创建单人 -> 投骰 -> 模拟点到选中的格子 -> 购买
using System;
using System.Threading.Tasks;
using Richman.Client.Net;

namespace Richman.Client.Smoke;

public static class Phase3Smoke
{
    public static async Task RunAsync()
    {
        Console.WriteLine("[phase3] connecting...");
        var client = new GameClient();
        client.SetServerUrl("http://localhost:3002");
        client.Connected += (_, _) => Console.WriteLine("[phase3] CONNECTED");
        client.RoomCreated += (_, p) => Console.WriteLine($"[phase3] ROOM {p.RoomCode}");
        client.MessageStream.Subscribe(m => Console.WriteLine($"[phase3] MSG {m.Item1}: {m.Item2}"));
        client.ErrorStream.Subscribe(e => Console.WriteLine($"[phase3] ERR: {e}"));

        GameStateDto? lastState = null;
        client.StateStream.Subscribe(s =>
        {
            if (s is null) return;
            if (s.GamePhase != "playing") return;
            lastState = s;
            Console.WriteLine($"[phase3] STATE turn={s.CurrentTurn} idx={s.CurrentPlayerIndex} dice={s.DiceValue} selected={s.SelectedCell}");

            if (s.CurrentPlayerIndex is int cpi
                && s.Players is { } players
                && cpi >= 0 && cpi < players.Count)
            {
                var p = players[cpi];
                Console.WriteLine($"[phase3]   currentPlayer={p.Name} pos={p.Position} cash={p.Cash}");
                if (p.Position is int pos && pos < (s.Cells?.Count ?? 0))
                {
                    var c = s.Cells![pos];
                    Console.WriteLine($"[phase3]   -> cell#{c.Id} '{c.Name}' type={c.Type} price={c.Price} basePrice={c.BasePrice} owner={(c.Owner ?? "-")}");
                }
            }
        });

        await client.ConnectAsync();
        await Task.Delay(800);
        client.CreateSingleplayer("Phase3Smoke", aiCount: 2, difficulty: "easy");
        await Task.Delay(2500);
        client.StartGame();
        await Task.Delay(1500);

        client.RollDice();
        await Task.Delay(2000);

        // 拿到当前玩家位置
        if (lastState?.CurrentPlayerIndex is int idx
            && lastState.Players is { } ps
            && idx >= 0 && idx < ps.Count)
        {
            var p = ps[idx];
            if (p.Position is int pos)
            {
                Console.WriteLine($"[phase3] -> selectCell {pos}");
                client.EmitRaw("selectCell", new { cellId = pos });
                await Task.Delay(1000);

                if (lastState.Cells is { } cells && pos < cells.Count)
                {
                    var c = cells[pos];
                    if (string.IsNullOrEmpty(c.Owner) && c.Type == "empty")
                    {
                        Console.WriteLine($"[phase3] -> buyProperty {c.Id}");
                        if (c.Id is int cid) client.BuyProperty(cid);
                        await Task.Delay(2000);
                    }
                    else
                    {
                        Console.WriteLine($"[phase3] cell not buyable (owner={c.Owner} type={c.Type})");
                    }
                }
            }
        }

        await Task.Delay(1000);
        if (lastState?.CurrentPlayerIndex is int idx2
            && lastState.Players is { } ps2
            && idx2 < ps2.Count)
        {
            var p = ps2[idx2];
            if (p.Position is int pos)
            {
                Console.WriteLine($"[phase3] -> try upgradeProperty at pos {pos}");
                client.UpgradeProperty(pos);
                await Task.Delay(2000);
            }
        }

        client.EndTurn();
        await Task.Delay(1500);

        await client.DisconnectAsync();
        Console.WriteLine("[phase3] done.");
    }
}
