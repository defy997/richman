// =============================================================================
// GameBoardViewModel.cs
// -----------------------------------------------------------------------------
// Phase 2: 顶层棋盘视图模型 (含 BoardViewModel)
// =============================================================================
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Richman.Client.Net;
using Richman.Client.Services;

namespace Richman.Client.ViewModels;

public sealed partial class GameBoardViewModel : ObservableObject
{
    private readonly GameClient _client;
    private readonly GameStore _store;
    private readonly BoardViewModel _board;
    private readonly BankViewModel _bank;
    private readonly StockViewModel _stock;
    private readonly FuturesViewModel _futures;
    private readonly CardViewModel _cards;

    public GameStore Store       => _store;
    public BoardViewModel Board  => _board;
    public BankViewModel Bank     => _bank;
    public StockViewModel Stock  => _stock;
    public FuturesViewModel Futures => _futures;
    public CardViewModel Cards => _cards;

    public GameBoardViewModel(GameClient client, GameStore store, BoardViewModel board, BankViewModel bank, StockViewModel stock, FuturesViewModel futures, CardViewModel cards)
    {
        _client = client;
        _store  = store;
        _board  = board;
        _bank   = bank;
        _stock  = stock;
        _futures = futures;
        _cards = cards;
    }

    [RelayCommand]
    public void RollDice()  => _client.RollDice();
    [RelayCommand]
    public void EndTurn()   => _client.EndTurn();
}
