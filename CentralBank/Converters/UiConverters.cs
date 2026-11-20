using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using CentralBank.Models;

namespace CentralBank.Converters;

public class TicketTierToBrushConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var cls = value as string ?? "card-tier-100";
        return cls switch
        {
            "card-tier-50" => CreateGradient("#007AFF", "#0051D5", "#002B7F"),
            "card-tier-100" => CreateGradient("#7C3AED", "#4F46E5", "#24195E"),
            "card-tier-200" => CreateGradient("#F59E0B", "#EA580C", "#9A1B1B"),
            "card-tier-500" => CreateGradient("#3A3A3C", "#1C1C1E", "#070708"),
            _ => CreateGradient("#007AFF", "#0051D5", "#002B7F")
        };
    }

    private static LinearGradientBrush CreateGradient(string c1, string c2, string c3)
    {
        var brush = new LinearGradientBrush
        {
            StartPoint = new Point(0, 0),
            EndPoint = new Point(1, 1)
        };
        brush.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString(c1), 0.0));
        brush.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString(c2), 0.52));
        brush.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString(c3), 1.0));
        brush.Freeze();
        return brush;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

public class HexToBrushConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var hex = value as string ?? "#007AFF";
        try
        {
            var color = (Color)ColorConverter.ConvertFromString(hex);
            if (parameter is string alphaStr && byte.TryParse(alphaStr, out var alpha))
            {
                color = Color.FromArgb(alpha, color.R, color.G, color.B);
            }
            var brush = new SolidColorBrush(color);
            brush.Freeze();
            return brush;
        }
        catch
        {
            return Brushes.DodgerBlue;
        }
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

public class BoolToVisConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var flag = value is bool b && b;
        if (parameter is string s && s.Equals("Invert", StringComparison.OrdinalIgnoreCase))
            flag = !flag;
        return flag ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

public class TicketStatusToBgConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is TicketStatus status && status == TicketStatus.Active)
        {
            return new SolidColorBrush(Color.FromArgb(38, 52, 199, 89)); // Verde Apple #34C759 al 15%
        }
        return new SolidColorBrush(Color.FromArgb(36, 142, 142, 147)); // Gris iOS para ticket ya usado
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

public class TicketStatusToFgConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is TicketStatus status && status == TicketStatus.Active)
        {
            return new SolidColorBrush((Color)ColorConverter.ConvertFromString("#248A3D"));
        }
        return new SolidColorBrush((Color)ColorConverter.ConvertFromString("#6C6C70"));
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

public class TxTypeToBgConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is TransactionType type && type == TransactionType.Purchase)
        {
            return new SolidColorBrush(Color.FromArgb(38, 52, 199, 89)); // Verde compra
        }
        return new SolidColorBrush(Color.FromArgb(38, 0, 122, 255)); // Azul canje
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

public class TxTypeToFgConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is TransactionType type && type == TransactionType.Purchase)
        {
            return new SolidColorBrush((Color)ColorConverter.ConvertFromString("#28B44B"));
        }
        return new SolidColorBrush((Color)ColorConverter.ConvertFromString("#007AFF"));
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

