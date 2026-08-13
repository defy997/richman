using Microsoft.AspNetCore.SignalR;
using Richman.Shared;

namespace Richman.Server;

public class GameHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        await base.OnConnectedAsync();
    }

    public async Task<GameRoom> CreateRoom(string mode, int maxPlayers = 6)
    {
        var room = GameHubManager.CreateRoom(mode, maxPlayers);
        await Groups.AddToGroupAsync(Context.ConnectionId, room.Code);

        // In singleplayer mode, auto-add the human player
        if (mode == "singleplayer")
        {
            var playerName = $"玩家";
            var player = GameHubManager.JoinRoom(room.Code, playerName, Context.ConnectionId);
            if (player != null)
            {
                // Add AI players for singleplayer
                GameHubManager.AddAiPlayers(room.Code, "normal", maxPlayers - 1);
            }
        }

        GameHubManager.BroadcastState(room.Code);
        return room;
    }

    public async Task<(bool success, GameRoom? room, Player? player)> JoinRoom(string roomCode, string playerName)
    {
        var player = GameHubManager.JoinRoom(roomCode, playerName, Context.ConnectionId);
        if (player == null)
        {
            return (false, null, null);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
        GameHubManager.BroadcastState(roomCode);

        var room = GameHubManager.GetRoom(roomCode);
        return (true, room, player);
    }

    public async Task<bool> StartGame()
    {
        var (roomCode, _) = GameHubManager.GetConnection(Context.ConnectionId);
        if (roomCode == null) return false;

        GameHubManager.StartGame(roomCode);
        GameHubManager.BroadcastState(roomCode);
        return true;
    }

    public async Task RollDice()
    {
        var (roomCode, player) = GameHubManager.GetConnection(Context.ConnectionId);
        if (roomCode == null || player == null) return;

        GameHubManager.RollDice(roomCode, player);
        GameHubManager.BroadcastState(roomCode);
    }

    public async Task EndTurn()
    {
        var (roomCode, _) = GameHubManager.GetConnection(Context.ConnectionId);
        if (roomCode == null) return;

        GameHubManager.EndTurn(roomCode);
    }

    public async Task<bool> BuyProperty(int cellId)
    {
        var (roomCode, player) = GameHubManager.GetConnection(Context.ConnectionId);
        if (roomCode == null || player == null) return false;

        var result = GameHubManager.BuyProperty(roomCode, player, cellId);
        if (result) GameHubManager.BroadcastState(roomCode);
        return result;
    }

    public async Task<bool> UpgradeProperty(int cellId)
    {
        var (roomCode, player) = GameHubManager.GetConnection(Context.ConnectionId);
        if (roomCode == null || player == null) return false;

        var result = GameHubManager.UpgradeProperty(roomCode, player, cellId);
        if (result) GameHubManager.BroadcastState(roomCode);
        return result;
    }

    public async Task<bool> BankDeposit(decimal amount)
    {
        var (roomCode, player) = GameHubManager.GetConnection(Context.ConnectionId);
        if (roomCode == null || player == null) return false;

        var result = GameHubManager.BankDeposit(roomCode, player, amount);
        if (result) GameHubManager.BroadcastState(roomCode);
        return result;
    }

    public async Task<bool> BankWithdraw(decimal amount)
    {
        var (roomCode, player) = GameHubManager.GetConnection(Context.ConnectionId);
        if (roomCode == null || player == null) return false;

        var result = GameHubManager.BankWithdraw(roomCode, player, amount);
        if (result) GameHubManager.BroadcastState(roomCode);
        return result;
    }

    public async Task<(bool success, string message)> BankLoan(decimal amount)
    {
        var (roomCode, player) = GameHubManager.GetConnection(Context.ConnectionId);
        if (roomCode == null || player == null) return (false, "未加入房间");

        var result = GameHubManager.BankLoan(roomCode, player, amount);
        GameHubManager.BroadcastState(roomCode);
        return result;
    }

    public async Task<(bool success, string message)> BuyStock(string symbol, int quantity, bool isShort = false)
    {
        var (roomCode, player) = GameHubManager.GetConnection(Context.ConnectionId);
        if (roomCode == null || player == null) return (false, "未加入房间");

        var result = GameHubManager.BuyStock(roomCode, player, symbol, quantity, isShort);
        GameHubManager.BroadcastState(roomCode);
        return result;
    }

    public async Task<(bool success, string message)> SellStock(string symbol, int quantity)
    {
        var (roomCode, player) = GameHubManager.GetConnection(Context.ConnectionId);
        if (roomCode == null || player == null) return (false, "未加入房间");

        var result = GameHubManager.SellStock(roomCode, player, symbol, quantity);
        GameHubManager.BroadcastState(roomCode);
        return result;
    }

    public async Task<decimal> GetTotalAssets()
    {
        var (roomCode, player) = GameHubManager.GetConnection(Context.ConnectionId);
        if (roomCode == null || player == null) return 0;

        return GameHubManager.CalculateAssets(roomCode, player);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        GameHubManager.HandleDisconnect(Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }
}
