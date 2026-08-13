using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Richman.Shared;

namespace Richman.Client.Modals;

public partial class BankModal : Window
{
    public event Action<decimal>? OnDeposit;
    public event Action<decimal>? OnWithdraw;
    public event Action<decimal>? OnTakeLoan;

    private Player? _player;
    private GameRoom? _room;

    public BankModal()
    {
        InitializeComponent();
    }

    public void Update(Player? player, GameRoom? room)
    {
        _player = player;
        _room = room;

        if (player == null) return;

        CashText.Text = $"${player.Cash:N0}";
        DepositText.Text = $"${player.Deposit:N0}";

        var totalLoan = player.Loans.Sum(l => l.Amount * (1 + l.InterestRate));
        LoanText.Text = $"${totalLoan:N0}";

        // Check if at bank
        var atBank = player.Position == 2; // 银行在地块2
        if (atBank)
        {
            BankStatusBadge.Background = new SolidColorBrush(Color.FromRgb(34, 197, 94));
            BankStatusText.Text = "在银行";
        }
        else
        {
            BankStatusBadge.Background = new SolidColorBrush(Color.FromRgb(239, 68, 68));
            BankStatusText.Text = "需到银行地块";
        }

        // Calculate max loan
        if (player.Properties.Count > 0 && room != null)
        {
            var propertyValue = player.Properties.Sum(propId =>
            {
                var cell = room.Cells.FirstOrDefault(c => c.Id == propId);
                return cell?.BasePrice * (1 + cell.Level * 0.5m) ?? 0;
            });
            var maxLoan = propertyValue * 10;
            MaxLoanText.Text = $"${maxLoan:N0}";
        }
        else
        {
            MaxLoanText.Text = "$0 (需地皮)";
        }
    }

    private void QuickAmount_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string amountStr && decimal.TryParse(amountStr, out var amount))
        {
            AmountBox.Text = amount.ToString();
        }
    }

    private void Deposit_Click(object sender, RoutedEventArgs e)
    {
        if (decimal.TryParse(AmountBox.Text, out var amount) && amount > 0)
        {
            OnDeposit?.Invoke(amount);
            AmountBox.Text = "";
        }
    }

    private void Withdraw_Click(object sender, RoutedEventArgs e)
    {
        if (decimal.TryParse(AmountBox.Text, out var amount) && amount > 0)
        {
            OnWithdraw?.Invoke(amount);
            AmountBox.Text = "";
        }
    }

    private void TakeLoan_Click(object sender, RoutedEventArgs e)
    {
        if (decimal.TryParse(AmountBox.Text, out var amount) && amount > 0)
        {
            OnTakeLoan?.Invoke(amount);
            AmountBox.Text = "";
        }
    }
}
