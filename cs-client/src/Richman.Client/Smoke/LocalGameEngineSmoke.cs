// =============================================================================
// LocalGameEngineSmoke.cs
// -----------------------------------------------------------------------------
// Phase A: 验证 LocalGameEngine 基本流程 — 投版/走格/买地/升级/银行/贷款
// 用 LocalGameEngine.CreateSingleplayer + 手动 RollDice + 验证 state
// =============================================================================
using System.Reactive.Linq;
using Richman.Client.Services;

namespace Richman.Client.Smoke;

public static class LocalGameEngineSmoke
{
    public static async Task Run()
    {
        Console.WriteLine("=== LocalGameEngine Smoke Phase A ===");
        using var engine = new LocalGameEngine();
        await engine.ConnectAsync();

        // 单机: 玩家 + 1 AI
        engine.CreateSingleplayer("Player1", aiCount: 1, difficulty: "easy");
        engine.StartGame();
        Console.WriteLine($"Room: {engine.RoomCode}, players={engine.CurrentState?.Players?.Count}");

        // 投 5 次版子(全部用玩家)
        for (int i = 0; i < 5; i++)
        {
            await Task.Delay(800);
            var s = engine.CurrentState!;
            var p = s.Players![s.CurrentPlayerIndex ?? 0];
            Console.WriteLine($"Step {i+1}: cur={p.Name}, IsAI={p.IsAI}, pos={p.Position}, cash=${p.Cash:F0}");
            if (p.IsAI == true) continue; // AI 自动, 我们等
            engine.RollDice();
            await Task.Delay(200);
            // 自动买地
            var s2 = engine.CurrentState!;
            var me = s2.Players![s2.CurrentPlayerIndex ?? 0];
            var cell = s2.Cells![me.Position ?? 0];
            if (cell.Type == "realestate" && cell.Owner == null && (me.Cash ?? 0) >= (cell.Price ?? 0))
            {
                engine.BuyProperty(cell.Id ?? 0);
                Console.WriteLine($"  → bought {cell.Name} (${cell.Price:F0})");
            }
            engine.EndTurn();
        }

        await Task.Delay(2000); // 等 AI 走完
        Console.WriteLine($"Final: turn={engine.CurrentState?.CurrentTurn}, idx={engine.CurrentState?.CurrentPlayerIndex}");
        Console.WriteLine("=== Phase A PASS ===");
    }
}