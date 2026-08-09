// =============================================================================
// BoardViewModel.cs
// -----------------------------------------------------------------------------
// 把 64 格 cells 投影成 17×17 网格 (中央 15×15 留给公园),
// 计算每个 cellId 的 Grid 坐标,并暴露每个 cell 的样式属性 (背景色/边框/角标)
// 给 QML/Avalonia XAML 直接绑定。
//
// Phase 3 新增:每个格子的业务属性 (CanBuy / CanUpgrade / MaterialCost / ...),
// 选中态 + 操作菜单,以及特殊升级弹窗。
// =============================================================================
using System.Collections.ObjectModel;
using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Richman.Client.Models;
using Richman.Client.Net;
using Richman.Client.Services;

namespace Richman.Client.ViewModels;

/// <summary>单格 UI 所需的全部派生属性</summary>
public sealed partial class BoardCellViewModel : ObservableObject
{
    [ObservableProperty] private int _id;
    [ObservableProperty] private string _name = "";
    [ObservableProperty] private string _type = "empty";
    [ObservableProperty] private string? _owner;
    [ObservableProperty] private int _level;
    [ObservableProperty] private double _basePrice;
    [ObservableProperty] private double _price;
    [ObservableProperty] private double? _appreciation;
    [ObservableProperty] private string? _upgrade;
    [ObservableProperty] private bool _fromAuction;
    [ObservableProperty] private bool _auctionActive;
    [ObservableProperty] private bool _selected;
    [ObservableProperty] private string? _playerColor;

    public int Row { get; init; }
    public int Col { get; init; }

    public bool HasOwner => !string.IsNullOrEmpty(Owner);
    public bool IsSpecial => !string.IsNullOrEmpty(Upgrade) && Upgrade != "normal";
    public bool IsEmpty   => Type == "empty";
    public bool HasLevel  => Level > 0;

    public string BackgroundColor
    {
        get
        {
            if (HasOwner) return "transparent";
            return Type switch
            {
                "start"      => "#16a34a",
                "bank"       => "#2563eb",
                "stock"      => "#ca8a04",
                "futures"    => "#0891b2",
                "realestate" => "#7c3aed",
                "chance"     => "#7c3aed",
                "destiny"    => "#ea580c",
                "diamond"    => "#db2777",
                _            => "#374151"
            };
        }
    }
    public string OwnerBorderColor => HasOwner ? (PlayerColor ?? "#6b7280") : "#6b7280";

    public string IconGlyph => Type switch
    {
        "start"      => "🚩",
        "bank"       => "🏦",
        "stock"      => "📈",
        "futures"    => "🛢️",
        "realestate" => "🏛️",
        "chance"     => "❓",
        "destiny"    => "🎯",
        "diamond"    => "💎",
        _            => ""
    };

    public string LevelBadge => Level switch { 1 => "🏚️", 2 => "🏠", 3 => "🏢", 4 => "🏨", _ => "" };
    public string SpecialUpgradeBadge => Upgrade switch
    {
        "hotel"       => "🏨",
        "smelter"     => "🔥",
        "diamondMine" => "⛏️",
        "agency"      => "🏢",
        "resort"      => "🏖️",
        "mall"        => "🛍️",
        "monument"    => "🏛️",
        _             => ""
    };

    public string PureName => (Name ?? $"地{Id}")
        .Replace("🏦", "").Replace("📈", "").Replace("🛢️", "")
        .Replace("❓", "").Replace("🎯", "").Replace("💎", "")
        .Replace("🚩", "").Replace("🏨", "").Replace("🔥", "")
        .Replace("⛏️", "").Replace("🏢", "").Trim();

    public void ApplyFromDto(CellDto dto)
    {
        Id = dto.Id ?? Id;
        Name = dto.Name ?? "";
        Type = dto.Type ?? "empty";
        Owner = dto.Owner;
        Level = dto.Level ?? 0;
        BasePrice = dto.BasePrice ?? 0;
        Price = dto.Price ?? BasePrice;
        Appreciation = dto.Appreciation;
        Upgrade = dto.Upgrade;
        FromAuction = dto.FromAuction ?? false;
        AuctionActive = dto.AuctionActive ?? false;
        OnPropertyChanged(nameof(HasOwner));
        OnPropertyChanged(nameof(BackgroundColor));
        OnPropertyChanged(nameof(OwnerBorderColor));
        OnPropertyChanged(nameof(IconGlyph));
        OnPropertyChanged(nameof(LevelBadge));
        OnPropertyChanged(nameof(SpecialUpgradeBadge));
        OnPropertyChanged(nameof(IsSpecial));
        OnPropertyChanged(nameof(IsEmpty));
        OnPropertyChanged(nameof(HasLevel));
        OnPropertyChanged(nameof(PureName));
    }
}

/// <summary>单次升级所需建材 (与原项目 Board.tsx UPGRADE_MAT 对齐)</summary>
public sealed class MaterialCost
{
    public int Cement { get; init; }
    public int Steel { get; init; }
    public int Rubber { get; init; }
    public string Display => $"🧱水泥×{Cement} 钢材×{Steel} 橡胶×{Rubber}";
    public static MaterialCost? For(int level) => level switch
    {
        1 => new() { Cement = 5, Steel = 3, Rubber = 1 },
        2 => new() { Cement = 10, Steel = 6, Rubber = 2 },
        3 => new() { Cement = 20, Steel = 12, Rubber = 4 },
        _ => null
    };
}

public sealed partial class BoardViewModel : ObservableObject
{
    private readonly GameStore _store;
    private readonly GameClient _client;

    public BoardViewModel(GameStore store, GameClient client)
    {
        _store  = store;
        _client = client;

        for (int i = 0; i < BoardLayout.TotalCells; i++)
        {
            var (row, col) = BoardLayout.GetCellPosition(i);
            Cells.Add(new BoardCellViewModel { Id = i, Row = row, Col = col });
        }

        store.PropertyChanged += OnStoreChanged;
        store.StateApplied += () => SyncState();
    }

    public ObservableCollection<BoardCellViewModel> Cells { get; } = new();
    public BoardCellViewModel? this[int cellId] => Cells.FirstOrDefault(c => c.Id == cellId);

    // ---- 选中态 ----
    [ObservableProperty] private int? _selectedCellId;
    partial void OnSelectedCellIdChanged(int? value)
    {
        foreach (var c in Cells) c.Selected = (c.Id == value);
        UpdateSelectedCellProps();
    }

    [ObservableProperty] private bool _showSpecialUpgradePanel;

    public BoardCellViewModel? SelectedCell =>
        SelectedCellId is int id ? this[id] : null;

    public PlayerDto? CurrentPlayer => _store.CurrentPlayer;
    public PlayerDto? MyPlayer     => _store.MyPlayer;
    public PlayerDto? SelectedCellOwner { get; private set; }
    public int?       DiceValue    => _store.DiceValue;
    public bool       IsMyTurn     => MyPlayer?.IsCurrentTurn == true;

    public IReadOnlyList<PlayerDto> PlayersSortedByAssets =>
        _store.Players.OrderByDescending(p => p.TotalAssets ?? 0).ToList();

    // ---- 选中格业务属性 (XAML 绑定) ----
    public bool   HasSelectedCell   => SelectedCellId.HasValue;
    public bool   IsSelectedCellMine
    {
        get
        {
            var c = SelectedCell;
            return c is not null && !string.IsNullOrEmpty(c.Owner) && c.Owner == MyPlayer?.Id;
        }
    }

    public bool CanBuy => IsMyTurn
        && SelectedCell is { Type: "empty", Owner: null or "" }
        && MyPlayer?.Cash >= (SelectedCell?.Price ?? 0);

    public bool CanSell => IsMyTurn
        && SelectedCell is { HasOwner: true }
        && IsSelectedCellMine;

    public bool CanUpgrade
    {
        get
        {
            var c = SelectedCell;
            if (c is null || !IsMyTurn || !IsSelectedCellMine) return false;
            if (c.Level < 1 || c.Level > 3) return false;
            var mat = MaterialCost.For(c.Level);
            var my = MyPlayer;
            if (my is null || mat is null) return false;
            return my.Cash + my.Deposit >= UpgradeCost
                && my.Materials?.Cement >= mat.Cement
                && my.Materials?.Steel >= mat.Steel
                && my.Materials?.Rubber >= mat.Rubber;
        }
    }

    public bool CanSpecialUpgrade
    {
        get
        {
            var c = SelectedCell;
            if (c is null || !IsMyTurn || !IsSelectedCellMine) return false;
            return c.Level >= 4 && (string.IsNullOrEmpty(c.Upgrade) || c.Upgrade == "normal");
        }
    }

    public int    UpgradeCost => SelectedCell is { Level: >= 1, BasePrice: > 0 }
        ? (int)Math.Floor(SelectedCell.BasePrice * 0.5)
        : 0;

    public MaterialCost? CurrentMaterialCost =>
        SelectedCell is { Level: >= 1 } c ? MaterialCost.For(c.Level) : null;

    /// <summary>升级缺啥(给 UI 红色提示)</summary>
    public string UpgradeShortage
    {
        get
        {
            if (CanUpgrade) return "";
            var c = SelectedCell;
            var my = MyPlayer;
            if (c is null || my is null) return "";
            var parts = new List<string>();
            if (UpgradeCost > 0 && (my.Cash + my.Deposit) < UpgradeCost)
                parts.Add($"💰 {UpgradeCost:N0}");
            var mat = MaterialCost.For(c.Level);
            if (mat is not null)
            {
                if ((my.Materials?.Cement ?? 0) < mat.Cement) parts.Add($"🧱水泥×{mat.Cement}");
                if ((my.Materials?.Steel ?? 0) < mat.Steel)   parts.Add($"🔩钢材×{mat.Steel}");
                if ((my.Materials?.Rubber ?? 0) < mat.Rubber) parts.Add($"🛞橡胶×{mat.Rubber}");
            }
            return parts.Count == 0 ? "" : string.Join(" / ", parts);
        }
    }

    // ---- 特殊升级列表 (7 种) ----
    public IReadOnlyList<SpecialUpgradeOption> SpecialUpgradeOptions { get; } = new[]
    {
        new SpecialUpgradeOption("hotel",       "🏨 酒店",       "每回合按存款5%给利息"),
        new SpecialUpgradeOption("smelter",     "🔥 冶炼场",     "每回合 +2 贵金属"),
        new SpecialUpgradeOption("diamondMine", "⛏️ 钻石矿",     "每回合 +2💎"),
        new SpecialUpgradeOption("agency",      "🏢 房产中介",   "所有房产过路费翻倍"),
        new SpecialUpgradeOption("resort",      "🏖️ 度假区",     "每回合 +$1000 · 消耗 20 吸引力"),
        new SpecialUpgradeOption("mall",        "🛍️ 购物中心",   "每回合 +$500+1💎 · 消耗 15 吸引力"),
        new SpecialUpgradeOption("monument",    "🏛️ 地标建筑",   "每回合 +5 吸引力 · 消耗 30 吸引力"),
    };

    public string? SpecialUpgradeName => SelectedCell?.Upgrade switch
    {
        "hotel"       => "酒店",
        "smelter"     => "冶炼场",
        "diamondMine" => "钻石矿",
        "agency"      => "房产中介",
        "resort"      => "度假区",
        "mall"        => "购物中心",
        "monument"    => "地标建筑",
        _             => null
    };

    private void OnStoreChanged(object? sender, PropertyChangedEventArgs e)
    {
        switch (e.PropertyName)
        {
            case nameof(GameStore.Players):
                OnPropertyChanged(nameof(CurrentPlayer));
                OnPropertyChanged(nameof(MyPlayer));
                OnPropertyChanged(nameof(PlayersSortedByAssets));
                OnPropertyChanged(nameof(IsMyTurn));
                UpdateSelectedCellProps();
                break;
            case nameof(GameStore.CurrentPlayerIndex):
                OnPropertyChanged(nameof(CurrentPlayer));
                OnPropertyChanged(nameof(IsMyTurn));
                UpdateSelectedCellProps();
                break;
            case nameof(GameStore.MyPlayerId):
                OnPropertyChanged(nameof(MyPlayer));
                OnPropertyChanged(nameof(IsMyTurn));
                UpdateSelectedCellProps();
                break;
            case nameof(GameStore.SelectedCell):
                SelectedCellId = _store.SelectedCell;
                break;
            case nameof(GameStore.DiceValue):
                OnPropertyChanged(nameof(DiceValue));
                break;
        }
    }

    public void SyncState()
    {
        var src = _store.CurrentState;
        if (src?.Cells is null) return;
        var players = src.Players ?? new List<PlayerDto>();
        for (int i = 0; i < src.Cells.Count && i < Cells.Count; i++)
        {
            var dto = src.Cells[i];
            Cells[i].ApplyFromDto(dto);
            Cells[i].PlayerColor = !string.IsNullOrEmpty(dto.Owner)
                ? players.FirstOrDefault(x => x.Id == dto.Owner)?.Color
                : null;
        }
        OnPropertyChanged(nameof(PlayersSortedByAssets));
        OnPropertyChanged(nameof(IsMyTurn));
        UpdateSelectedCellProps();
    }

    private void UpdateSelectedCellProps()
    {
        OnPropertyChanged(nameof(HasSelectedCell));
        OnPropertyChanged(nameof(SelectedCell));
        OnPropertyChanged(nameof(IsSelectedCellMine));
        OnPropertyChanged(nameof(CanBuy));
        OnPropertyChanged(nameof(CanSell));
        OnPropertyChanged(nameof(CanUpgrade));
        OnPropertyChanged(nameof(CanSpecialUpgrade));
        OnPropertyChanged(nameof(UpgradeCost));
        OnPropertyChanged(nameof(CurrentMaterialCost));
        OnPropertyChanged(nameof(UpgradeShortage));
        OnPropertyChanged(nameof(SpecialUpgradeName));
        SelectedCellOwner = SelectedCell?.Owner is { } oid
            ? _store.Players.FirstOrDefault(p => p.Id == oid)
            : null;
    }

    // ---- 命令 ----
    [RelayCommand]
    public void SelectCell(int cellId)
    {
        // 切换选中态
        SelectedCellId = (SelectedCellId == cellId) ? null : cellId;
        ShowSpecialUpgradePanel = false;
        _client.EmitRaw("selectCell", new { cellId = SelectedCellId ?? -1 });
    }

    [RelayCommand]
    public void BuyProperty(int cellId) => _client.BuyProperty(cellId);

    [RelayCommand]
    public void UpgradeProperty(int cellId) => _client.UpgradeProperty(cellId);

    [RelayCommand]
    public void SellProperty(int cellId) => _client.SellProperty(cellId);

    [RelayCommand]
    public void ShowSpecialUpgrade()
    {
        if (!CanSpecialUpgrade) return;
        ShowSpecialUpgradePanel = true;
    }

    [RelayCommand]
    public void HideSpecialUpgrade() => ShowSpecialUpgradePanel = false;

    [RelayCommand]
    public void ApplySpecialUpgrade(string type)
    {
        if (SelectedCellId is not int cellId) return;
        _client.SpecialUpgrade(cellId, type);
        ShowSpecialUpgradePanel = false;
    }

    [RelayCommand]
    public void RollDice()  => _client.RollDice();
    [RelayCommand]
    public void EndTurn()   => _client.EndTurn();
}

public sealed record SpecialUpgradeOption(string Type, string Label, string Description);
