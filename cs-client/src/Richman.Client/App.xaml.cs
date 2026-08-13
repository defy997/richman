using System.Configuration;
using System.Data;
using System.IO;
using System.Windows;
using System.Windows.Threading;

namespace Richman.Client;

/// <summary>
/// Interaction logic for App.xaml
/// </summary>
public partial class App : Application
{
    public App()
    {
        // UI 线程异常（XAML 绑定、Dispatcher 回调）
        DispatcherUnhandledException += OnDispatcherUnhandledException;

        // 任意后台线程上的未观察异常（Task.Run / Task.Delay().ContinueWith）
        AppDomain.CurrentDomain.UnhandledException += OnDomainUnhandledException;

        // Task 未观察异常
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;
    }

    private void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        LogException("DispatcherUnhandled", e.Exception);
        MessageBox.Show(
            $"发生未处理异常：\n{e.Exception.Message}\n\n详细已写入 crash.log",
            "错误", MessageBoxButton.OK, MessageBoxImage.Error);
        e.Handled = true; // 阻止进程崩溃
    }

    private void OnDomainUnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception ex)
            LogException("AppDomain.Unhandled", ex);
        else
            LogException("AppDomain.Unhandled", new Exception(e.ExceptionObject?.ToString() ?? "unknown"));
    }

    private void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        LogException("TaskScheduler.Unobserved", e.Exception);
        e.SetObserved(); // 阻止进程崩溃
    }

    private static void LogException(string source, Exception ex)
    {
        try
        {
            var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {source}\n{ex}\n\n";
            File.AppendAllText("crash.log", line);
        }
        catch { /* 日志失败也不能再抛 */ }
    }
}
