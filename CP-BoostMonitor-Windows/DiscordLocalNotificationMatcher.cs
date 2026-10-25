using System.Text.RegularExpressions;

namespace CPBoostMonitor;

/// <summary>
/// Fail-closed matching of a *user-consented operating system notification*, never
/// a Discord account token, Discord web request, or copied Discord client database.
/// The OS notification reader (packaged / permissioned) is a separate future component.
/// </summary>
public static class DiscordLocalNotificationMatcher
{
    public sealed record Notice(string AppUserModelId, string SenderLabel,
        string? ServerLabel, string? ChannelLabel, string? NotificationId);

    /// <summary>Candidate links must already be authorized, FH3 Telegram-verified current assignments.</summary>
    public sealed record OrderLink(string OrderRef, string BuyerLabel,
        string EmployeeCode, string? ServerLabel, string? ChannelLabel,
        bool IsCurrentAssigned, bool TelegramVerified, bool IsActive);

    private static string Normal(string? value) =>
        (value ?? "").Trim().Normalize(System.Text.NormalizationForm.FormKC);

    public static bool IsInternalEvoLabel(string? sender)
    {
        var label = Normal(sender);
        // Conservative named-account exclusion. This is not an identity/role check.
        return Regex.IsMatch(label, @"(?:^|[^a-z0-9])evo[a-z0-9]*",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    }

    public static IReadOnlyList<OrderLink> Match(Notice notice,
        IEnumerable<OrderLink> currentAuthorizedOrders,
        IEnumerable<string> trustedDiscordAppIds)
    {
        var id = Normal(notice.AppUserModelId);
        var allowed = trustedDiscordAppIds.Any(v =>
            string.Equals(Normal(v), id, StringComparison.Ordinal));
        if (id.Length == 0 || !allowed || string.IsNullOrWhiteSpace(notice.NotificationId)
            || string.IsNullOrWhiteSpace(notice.SenderLabel)
            || IsInternalEvoLabel(notice.SenderLabel))
            return Array.Empty<OrderLink>();

        var sender = Normal(notice.SenderLabel);
        var candidates = currentAuthorizedOrders.Where(order =>
            order.IsActive && order.TelegramVerified && order.IsCurrentAssigned
            && Regex.IsMatch(order.OrderRef, @"^X[0-9]{2,12}$", RegexOptions.CultureInvariant)
            && string.Equals(Normal(order.BuyerLabel), sender, StringComparison.OrdinalIgnoreCase)
            && string.IsNullOrWhiteSpace(order.ServerLabel) == false
            && !string.IsNullOrWhiteSpace(notice.ServerLabel)
            && string.Equals(Normal(order.ServerLabel), Normal(notice.ServerLabel), StringComparison.OrdinalIgnoreCase)
            && (string.IsNullOrWhiteSpace(order.ChannelLabel)
                || (!string.IsNullOrWhiteSpace(notice.ChannelLabel)
                    && string.Equals(Normal(order.ChannelLabel), Normal(notice.ChannelLabel), StringComparison.OrdinalIgnoreCase))))
            .GroupBy(order => order.OrderRef, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .ToList();

        // Do not arbitrarily route identical display names to different workers/orders.
        return candidates.Count == 1 ? candidates : Array.Empty<OrderLink>();
    }
}
