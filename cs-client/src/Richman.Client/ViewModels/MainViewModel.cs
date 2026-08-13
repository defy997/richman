using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using Richman.Shared;

namespace Richman.Client.ViewModels;

public partial class MainViewModel : ObservableObject
{
    [ObservableProperty]
    private string _playerName = "玩家";

    [ObservableProperty]
    private string _roomCode = "";

    [ObservableProperty]
    private string _statusMessage = "准备开始";

    [ObservableProperty]
    private bool _isMyTurn;

    [ObservableProperty]
    private GameRoom? _currentRoom;

    [ObservableProperty]
    private Player? _myPlayer;

    [ObservableProperty]
    private int? _diceValue;

    [ObservableProperty]
    private int _selectedCellId = -1;

    [ObservableProperty]
    private string _logMessage = "";

    public ObservableCollection<GameMessage> Messages { get; } = new();

    public MainViewModel()
    {
    }

    public void SelectCell(int cellId)
    {
        SelectedCellId = cellId;
    }

    public void ClearSelection()
    {
        SelectedCellId = -1;
    }
}
