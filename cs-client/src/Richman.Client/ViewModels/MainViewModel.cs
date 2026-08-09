// =============================================================================
// MainViewModel.cs
// -----------------------------------------------------------------------------
// 顶层导航:根据 GameStore.GamePhase 切换 Lobby / GameBoard。
// 负责连接服务器(默认 http://localhost:3000, 不同环境可改 ServerUrl)。
// =============================================================================
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Richman.Client.Net;
using Richman.Client.Services;

namespace Richman.Client.ViewModels;

public sealed partial class MainViewModel : ObservableObject
{
    private readonly GameClient _client;
    private readonly GameStore _store;
    private readonly LobbyViewModel _lobby;
    private readonly GameBoardViewModel _board;

    [ObservableProperty] private string _serverUrl = "http://localhost:3000";
    [ObservableProperty] private string _status = "未连接";

    public LobbyViewModel     Lobby      => _lobby;
    public GameBoardViewModel GameBoard  => _board;
    public GameStore          Store      => _store;

    public MainViewModel(
        GameClient client,
        GameStore store,
        LobbyViewModel lobby,
        GameBoardViewModel board)
    {
        _client = client;
        _store  = store;
        _lobby  = lobby;
        _board  = board;

        _client.Connected    += (_, _) => Status = $"已连接 {ServerUrl}";
        _client.Disconnected += (_, _) => Status = "已断开";
        _client.StateStream  .Subscribe(_ => Status = $"已加入房间 {_store.RoomCode}");
        _client.ErrorStream  .Subscribe(msg => Status = $"错误: {msg}");
    }

    [RelayCommand]
    public async Task ConnectAsync()
    {
        _client.SetServerUrl(ServerUrl);
        await _client.ConnectAsync();
    }

    [RelayCommand]
    public async Task DisconnectAsync()
    {
        await _client.DisconnectAsync();
    }
}
