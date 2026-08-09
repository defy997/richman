// =============================================================================
// AppHost.cs
// -----------------------------------------------------------------------------
// 简单的 DI 容器,持有 GameClient (单例) 和 GameStore (单例),
// 后续 SettingsViewModel 等都从这取实例。
// =============================================================================
using Microsoft.Extensions.DependencyInjection;
using Richman.Client.Net;
using Richman.Client.Services;

namespace Richman.Client;

public static class AppHost
{
    public static IServiceProvider Build()
    {
        var services = new ServiceCollection();

        services.AddSingleton<GameClient>();
        services.AddSingleton<GameStore>();

        services.AddSingleton<ViewModels.MainViewModel>();
        services.AddSingleton<ViewModels.LobbyViewModel>();
        services.AddSingleton<ViewModels.BoardViewModel>();
        services.AddSingleton<ViewModels.BankViewModel>();
        services.AddSingleton<ViewModels.StockViewModel>();
        services.AddSingleton<ViewModels.FuturesViewModel>();
        services.AddSingleton<ViewModels.CardViewModel>();
        services.AddTransient<ViewModels.GameBoardViewModel>();

        return services.BuildServiceProvider();
    }
}
