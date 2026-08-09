// =============================================================================
// BankViewModel.cs
// -----------------------------------------------------------------------------
// 银行 + 贷款面板。
// 服务端规则:
//   - 必须站在银行地块 (passedBank) 才能操作
//   - 存/取/转换各收 1% 手续费
//   - 贷款需要至少 1 块地,可贷额度 = Σ(basePrice × (1 + level × 0.5)) × 10
//   - 还款 loanId,利息按经过回合数计
// =============================================================================
using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Richman.Client.Net;
using Richman.Client.Services;

namespace Richman.Client.ViewModels;

public sealed partial class BankViewModel : ObservableObject
{
    private readonly GameClient _client;
    private readonly GameStore _store;

    public BankViewModel(GameClient client, GameStore store)
    {
        _client = client;
        _store  = store;
        store.PropertyChanged += (_, _) => RefreshAll();
        store.StateApplied    += () => RefreshAll();
    }

    // ---- 输入 ----
    [ObservableProperty] private double _depositAmount = 1000;
    [ObservableProperty] private double _withdrawAmount = 1000;
    [ObservableProperty] private double _loanAmount = 1000;
    [ObservableProperty] private string? _statusMessage;
    [ObservableProperty] private string? _selectedLoanId;

    public GameStore Store => _store;
    public PlayerDto? CurrentPlayer => _store.CurrentPlayer;
    public PlayerDto? MyPlayer     => _store.MyPlayer;

    public bool AtBank => MyPlayer?.PassedBank == true;
    public bool IsMyTurn => MyPlayer?.IsCurrentTurn == true;

    public double Cash => MyPlayer?.Cash ?? 0;
    public double Deposit => MyPlayer?.Deposit ?? 0;

    /// <summary>可贷额度 = Σ(basePrice × (1 + level × 0.5)) × 10</summary>
    public double MaxLoan
    {
        get
        {
            var me = MyPlayer;
            var cells = _store.CurrentState?.Cells;
            if (me?.Properties is null || cells is null) return 0;
            double sum = 0;
            foreach (var id in me.Properties)
            {
                if (id < 0 || id >= cells.Count) continue;
                var c = cells[id];
                sum += (c.BasePrice ?? 0) * (1 + (c.Level ?? 0) * 0.5);
            }
            return Math.Floor(sum * 10);
        }
    }

    public double BankFee => 0.01; // 1%

    public bool CanDeposit
        => AtBank && IsMyTurn && MyPlayer is { Cash: > 0 } && DepositAmount > 0
           && MyPlayer.Cash >= DepositAmount;

    public bool CanWithdraw
        => AtBank && IsMyTurn && MyPlayer is { Deposit: > 0 } && WithdrawAmount > 0
           && MyPlayer.Deposit >= WithdrawAmount;

    public bool CanConvertCashToDeposit
        => AtBank && IsMyTurn && MyPlayer is { Cash: > 0 } && DepositAmount > 0
           && MyPlayer.Cash >= DepositAmount;

    public bool CanConvertDepositToCash
        => AtBank && IsMyTurn && MyPlayer is { Deposit: > 0 } && WithdrawAmount > 0
           && MyPlayer.Deposit >= WithdrawAmount;

    public bool CanTakeLoan
        => AtBank && IsMyTurn && MaxLoan > 0 && LoanAmount > 0 && LoanAmount <= MaxLoan;

    public bool CanRepayLoan
        => AtBank && IsMyTurn
           && !string.IsNullOrEmpty(SelectedLoanId);

    public ObservableCollection<LoanDto> Loans { get; } = new();

    public void RefreshAll()
    {
        Loans.Clear();
        if (MyPlayer?.Loans is { } ls)
        {
            foreach (var l in ls) Loans.Add(l);
        }
        OnPropertyChanged(nameof(CurrentPlayer));
        OnPropertyChanged(nameof(MyPlayer));
        OnPropertyChanged(nameof(AtBank));
        OnPropertyChanged(nameof(IsMyTurn));
        OnPropertyChanged(nameof(Cash));
        OnPropertyChanged(nameof(Deposit));
        OnPropertyChanged(nameof(MaxLoan));
        OnPropertyChanged(nameof(CanDeposit));
        OnPropertyChanged(nameof(CanWithdraw));
        OnPropertyChanged(nameof(CanConvertCashToDeposit));
        OnPropertyChanged(nameof(CanConvertDepositToCash));
        OnPropertyChanged(nameof(CanTakeLoan));
        OnPropertyChanged(nameof(CanRepayLoan));
    }

    [RelayCommand]
    public void DoDeposit() => _client.BankDeposit(DepositAmount);

    [RelayCommand]
    public void DoWithdraw() => _client.BankWithdraw(WithdrawAmount);

    [RelayCommand]
    public void ConvertCashToDeposit() => _client.BankConvert("cashToDeposit", DepositAmount);

    [RelayCommand]
    public void ConvertDepositToCash() => _client.BankConvert("depositToCash", WithdrawAmount);

    [RelayCommand]
    public void TakeLoan() => _client.TakeLoan(LoanAmount);

    [RelayCommand]
    public void RepayLoan()
    {
        if (string.IsNullOrEmpty(SelectedLoanId)) return;
        _client.RepayLoan(SelectedLoanId);
    }
}
