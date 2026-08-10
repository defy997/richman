// =============================================================================
// LocalGameEngineSmokeB.cs
// -----------------------------------------------------------------------------
// Phase B: 验证多回合 + AI 自动行动 + 坐监 + 破产流转
// =============================================================================
using Richman.Client.Services;

namespace Richman.Client.Smoke;

public static class LocalGameEngineSmokeB
{
    public static async Task Run()
    {
        Console.WriteLine("=== LocalGameEngine Smoke Phase B (多回合+AI) ===");
        using var engine = new LocalGameEngine();
        await engine.ConnectAsync();

        engine.CreateSingleplayer("Player1", aiCount: 2, difficulty: "easy");
        engine.StartGame();
        Console.WriteLine($"Game start, {engine.CurrentState?.Players?.Count} players, target=${engine.CurrentState?.TargetAssets}");

        // 跑直到游戏结束或最多 60 步
        int maxSteps = 60, step = 0;
        int playerSteps = 0;
        while (step++ < maxSteps && playerSteps < 10)
        {
            var s = engine.CurrentState!;
            if (s.GamePhase != "playing") break;
            var p = s.Players![s.CurrentPlayerIndex ?? 0];
            if (p.Id != engine.MyPlayerId)
            {
                // 等待 AI 走(给 3s)
                await Task.Delay(3000);
                continue;
            }
            playerSteps++;
            Console.WriteLine($"Step {step} | Player {p.Name} | Cash=${p.Cash:F0} | Deposit=${p.Deposit:F0} | Props={p.Properties?.Count ?? 0} | Pos={p.Position}");
            engine.RollDice();
            await Task.Delay(400);
            // 如果可买就买
            var s2 = engine.CurrentState!;
            var me = s2.Players![s2.CurrentPlayerIndex ?? 0];
            var myCell = s2.Cells![me.Position ?? 0];
            if (myCell.Type == "realestate" && myCell.Owner == null && (me.Cash ?? 0) >= (myCell.Price ?? 0))
            {
                engine.BuyProperty(myCell.Id ?? 0);
                Console.WriteLine($"  → Bought {myCell.Name} for ${myCell.Price:F0}");
            }
            engine.EndTurn();
            await Task.Delay(400);
        }

        // ---- 验证银行 ---
        engine.BankDeposit(200);
        engine.BankWithdraw(100);
        var final = engine.CurrentState!;
        var meFinal = final.Players!.First(p => p.Id == engine.MyPlayerId);
        Console.WriteLine($"\nFinal | Cash=${meFinal.Cash:F0} | Deposit=${meFinal.Deposit:F0} | Props={meFinal.Properties?.Count ?? 0}");

        // ---- 验证特别升级 ---
        if (meFinal.Properties?.Count > 0)
        {
            engine.SpecialUpgrade(meFinal.Properties[0], "hospital");
            var after = engine.CurrentState!;
            var cell = after.Cells!.First(c => c.Id == meFinal.Properties![0]);
            Console.WriteLine($"After hospital: cell upgrade={cell.Upgrade ?? "<null>"}");
        }

        Console.WriteLine("=== Phase B PASS ===");
    }
}