using Avalonia.Controls;
using Avalonia.Interactivity;
using Richman.Client.ViewModels;

namespace Richman.Client.Views;

public partial class CardView : UserControl
{
    public CardView()
    {
        InitializeComponent();
    }

    private CardViewModel? Vm => DataContext as CardViewModel;

    private void OnBuyClick(object sender, RoutedEventArgs e)
    {
        if (Vm is null || sender is not Button b) return;
        if (b.Tag is string name) Vm.BuyCard(name);
    }

    private void OnUseClick(object sender, RoutedEventArgs e)
    {
        if (Vm is null || sender is not Button b) return;
        if (b.Tag is string name) Vm.UseCard(name);
    }
}