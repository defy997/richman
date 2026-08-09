// =============================================================================
// BoardLayout.cs
// -----------------------------------------------------------------------------
// 64 格方形地图的固定布局:
//   17 列 × 17 行网格
//   顶排  (id 0 ~ 15)   row=1,    col=1..16
//   右列  (id 16 ~ 31)  row=2..16, col=17
//   底排  (id 32 ~ 47)  row=17,   col=16..1   (倒序)
//   左列  (id 48 ~ 63)  row=16..2, col=1
//   中央 RICH PARK 占 row 2..16, col 2..16
// =============================================================================
namespace Richman.Client.Models;

public static class BoardLayout
{
    public const int TotalCells = 64;
    public const int Rows = 17;
    public const int Cols = 17;

    /// <summary>给定 cellId,返回 Grid 的 (row, col) (1-indexed)</summary>
    public static (int Row, int Col) GetCellPosition(int cellId)
    {
        // 顶排
        if (cellId is >= 0 and <= 15)  return (1, cellId + 1);
        // 右列
        if (cellId is >= 16 and <= 31) return (cellId - 16 + 2, 17);
        // 底排 (倒序)
        if (cellId is >= 32 and <= 47) return (17, 17 - (cellId - 32));
        // 左列 (倒序)
        if (cellId is >= 48 and <= 63) return (17 - (cellId - 48), 1);
        return (1, 1);
    }

    /// <summary>地图 4 条边上每个 cellId 在该边的索引(0-indexed)</summary>
    public static string EdgeName(int cellId) => cellId switch
    {
        <= 15                          => "top",
        <= 31                          => "right",
        <= 47                          => "bottom",
        _                              => "left"
    };
}
