using Avalonia.Controls;
using Avalonia.Interactivity;
using Richman.Client.ViewModels;

namespace Richman.Client.Views;

public partial class BoardView : UserControl
{
    public BoardView()
    {
        InitializeComponent();
    }

    private void OnCellClick(object? sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is int cellId &&
            DataContext is BoardViewModel vm)
        {
            vm.SelectCell(cellId);
        }
    }

    private void OnSpecialUpgradeClick(object? sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string type &&
            DataContext is BoardViewModel vm)
        {
            vm.ApplySpecialUpgrade(type);
        }
    }
}
