using System;
using System.Threading.Tasks;
using Avalonia;

namespace Richman.Client;

sealed class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        // 当首个参数是 "smoke" 时跑联调脚本,否则启动 Avalonia UI
        if (args.Length > 0 && args[0] == "smoke")
        {
            Task.Run(async () => await Smoke.SmokeTest.RunAsync())
                .GetAwaiter().GetResult();
            return;
        }
        if (args.Length > 0 && args[0] == "phase2")
        {
            Task.Run(async () => await Smoke.Phase2Smoke.RunAsync())
                .GetAwaiter().GetResult();
            return;
        }
        if (args.Length > 0 && args[0] == "phase3")
        {
            Task.Run(async () => await Smoke.Phase3Smoke.RunAsync())
                .GetAwaiter().GetResult();
            return;
        }
        if (args.Length > 0 && args[0] == "phase4")
        {
            Task.Run(async () => await Smoke.Phase4Smoke.RunAsync())
                .GetAwaiter().GetResult();
            return;
        }
        if (args.Length > 0 && args[0] == "phase4s")
        {
            Task.Run(async () => await Smoke.Phase4ShortSmoke.RunAsync())
                .GetAwaiter().GetResult();
            return;
        }
        if (args.Length > 0 && args[0] == "phase5")
        {
            Task.Run(async () => await Smoke.Phase5Smoke.RunAsync())
                .GetAwaiter().GetResult();
            return;
        }
        if (args.Length > 0 && args[0] == "phase6")
        {
            Task.Run(async () => await Smoke.Phase6Smoke.RunAsync())
                .GetAwaiter().GetResult();
            return;
        }
        if (args.Length > 0 && args[0] == "phase7")
        {
            Task.Run(async () => await Smoke.Phase7Smoke.RunAsync())
                .GetAwaiter().GetResult();
            return;
        }

        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
    }

    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
