using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows;

namespace CentralBank;

/// <summary>
/// Interaction logic for App.xaml
/// </summary>
public partial class App : Application
{
    public App()
    {
        AppDomain.CurrentDomain.UnhandledException += (s, e) =>
        {
            try
            {
                var logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "centralbank_crash.log");
                File.AppendAllText(logPath, $"[CRASH {DateTime.Now}] {e.ExceptionObject}\n");
            }
            catch { }
        };

        DispatcherUnhandledException += (s, e) =>
        {
            // Evitar que cualquier excepción de interfaz o concurrencia cierre la aplicación del Banco Central
            e.Handled = true;
            try
            {
                var logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "centralbank_crash.log");
                File.AppendAllText(logPath, $"[DISPATCHER RECOVERED {DateTime.Now}] {e.Exception}\n");
            }
            catch { }
        };

        TaskScheduler.UnobservedTaskException += (s, e) =>
        {
            e.SetObserved();
            try
            {
                var logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "centralbank_crash.log");
                File.AppendAllText(logPath, $"[TASK RECOVERED {DateTime.Now}] {e.Exception}\n");
            }
            catch { }
        };
    }

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        try
        {
            var logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "centralbank_crash.log");
            File.AppendAllText(logPath, $"[STARTUP {DateTime.Now}] CentralBank iniciándose...\n");
        }
        catch { }
    }
}



