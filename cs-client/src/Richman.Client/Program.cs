// =============================================================================
// Program.cs (GUI 入口 + Smoke 模式)
// =============================================================================
using Avalonia;
using Richman.Client.Smoke;

namespace Richman.Client;

internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "smoke-local")
        {
            await LocalGameEngineSmoke.Run();
            return 0;
        }
        if (args.Length > 0 && args[0] == "smoke-local-b")
        {
            await LocalGameEngineSmokeB.Run();
            return 0;
        }

        // GUI
        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
        return 0;
    }

    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}