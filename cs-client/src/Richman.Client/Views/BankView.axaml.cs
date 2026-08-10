using Avalonia.Controls;
using Avalonia.Interactivity;
using Richman.Client.ViewModels;

namespace Richman.Client.Views;

public partial class BankView : UserControl
{
    public BankView()
    {
        InitializeComponent();
    }

    private BankViewModel? Vm => DataContext as BankViewModel;

    private void OnQuickAmount5k(object sender, RoutedEventArgs e)
    {
        if (Vm is null) return;
        Vm.DepositAmount += 5000;
    }

    private void OnQuickAmount10k(object sender, RoutedEventArgs e)
    {
        if (Vm is null) return;
        Vm.DepositAmount += 10000;
    }

    private void OnMaxAmount(object sender, RoutedEventArgs e)
    {
        if (Vm is null) return;
        Vm.DepositAmount = Vm.Cash;
    }

    private void OnRepayLoanClick(object? sender, RoutedEventArgs e)
    {
        if (Vm is null) return;
        if (sender is Button btn && btn.Tag is string id)
        {
            Vm.SelectedLoanId = id;
        }
        Vm.RepayLoan();
    }
}
