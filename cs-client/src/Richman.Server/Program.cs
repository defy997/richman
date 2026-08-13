using Microsoft.AspNetCore.SignalR;
using Richman.Server;
using Richman.Shared;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddSignalR();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

builder.Services.AddHostedService<HubContextInitializer>();

var app = builder.Build();

app.UseCors();

app.MapHub<GameHub>("/gamehub");

// API endpoints
app.MapGet("/api/rooms", () => GameHubManager.GetGlobalRoomList());
app.MapGet("/api/rooms/{code}", (string code) => GameHubManager.GetGlobalRoom(code));
app.MapPost("/api/rooms/{mode}/{maxPlayers}", (string mode, int maxPlayers) => GameHubManager.CreateGlobalRoom(mode, maxPlayers));

var port = Environment.GetEnvironmentVariable("PORT") ?? "3007";
app.Urls.Add($"http://0.0.0.0:{port}");

Console.WriteLine($"Richman Server running on http://0.0.0.0:{port}");
app.Run();

// Initialize hub context after app starts
public class HubContextInitializer : IHostedService
{
    private readonly IHubContext<GameHub> _hubContext;

    public HubContextInitializer(IHubContext<GameHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        GameHubManager.SetHubContext(_hubContext);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
