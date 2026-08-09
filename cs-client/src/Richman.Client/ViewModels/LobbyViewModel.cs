// =============================================================================
// LobbyViewModel.cs
// -----------------------------------------------------------------------------
// 房间流程: 创建 / 加入 / 单人模式 / 开始游戏
// =============================================================================
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Richman.Client.Net;
using Richman.Client.Services;

namespace Richman.Client.ViewModels;

public sealed partial class LobbyViewModel : ObservableObject
{
    private readonly GameClient _client;
    private readonly GameStore _store;

    [ObservableProperty] private string _playerName = "Player";
    [ObservableProperty] private string _roomCode   = "";
    [ObservableProperty] private int    _maxPlayers = 4;
    [ObservableProperty] private int    _aiCount = 3;
    [ObservableProperty] private string _difficulty = "normal";   // easy / normal / hard
    [ObservableProperty] private string _joinRoomCode = "";

    public GameStore Store => _store;
    public bool IsMultiplayer => _store.GamePhase == "lobby" && _store.Players.Count < 2;
    public bool CanStart      => _store.Players.Count >= 2 && _store.GamePhase == "lobby";

    public LobbyViewModel(GameClient client, GameStore store)
    {
        _client = client;
        _store  = store;
        _store.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName is nameof(GameStore.Players) or nameof(GameStore.GamePhase))
            {
                OnPropertyChanged(nameof(IsMultiplayer));
                OnPropertyChanged(nameof(CanStart));
                StartGameCommand.NotifyCanExecuteChanged();
            }
        };
    }

    [RelayCommand]
    public void CreateRoom()
    {
        _client.CreateRoom(PlayerName, MaxPlayers);
    }

    [RelayCommand]
    public void CreateSingleplayer()
    {
        _client.CreateSingleplayer(PlayerName, AiCount, Difficulty);
    }

    [RelayCommand]
    public void JoinRoom()
    {
        if (string.IsNullOrWhiteSpace(JoinRoomCode)) return;
        _client.JoinRoom(PlayerName, JoinRoomCode.Trim().ToUpperInvariant());
    }

    [RelayCommand(CanExecute = nameof(CanStart))]
    public void StartGame()
    {
        _client.StartGame();
    }
}
