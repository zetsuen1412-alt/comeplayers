namespace CPBoostMonitor;

/// <summary>Pure, case-insensitive client-side search. Does not change Payroll orders.</summary>
public static class OrderFilters
{
    public static bool ContainsAny(string query, params string?[] fields)
    {
        var words = query.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (words.Length == 0) return true;
        return words.All(word => fields.Any(field =>
            !string.IsNullOrWhiteSpace(field) &&
            field.Contains(word, StringComparison.OrdinalIgnoreCase)));
    }

    public static IEnumerable<PayrollOrder> Pending(IEnumerable<PayrollOrder> orders, string search) =>
        orders.Where(o => ContainsAny(search, o.OrderRef, o.OrderName, o.Game, o.Buyer,
            o.Task, o.OrderType, o.Discord, o.DisplayDuration));

    public static IEnumerable<PayrollOrder> Active(
        IEnumerable<PayrollOrder> orders, string search, string status)
    {
        return orders.Where(o => (status == "Semua Status" || string.Equals(o.Status,
                   status, StringComparison.OrdinalIgnoreCase)) &&
               ContainsAny(search, o.OrderRef, o.OrderName, o.Game, o.Buyer,
                   o.Task, o.EmployeeName, o.EmployeeCode, o.Status, o.Discord, o.DisplayDuration));
    }

    public static IEnumerable<Employee> Employees(IEnumerable<Employee> employees, string search) =>
        employees.Where(e => ContainsAny(search, e.Name, e.Code, e.WorkforceStatus,
            e.Team, e.DisplayLocalStatus));
}
