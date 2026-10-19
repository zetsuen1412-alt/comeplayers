using CPBoostMonitor;

static void Assert(bool check, string name)
{
    if (!check) throw new Exception("FAIL: " + name);
    Console.WriteLine("PASS: " + name);
}

var orders = new List<PayrollOrder>
{
    new() { OrderRef = "X4671", Game = "AION 2", OrderName = "Boost Level",
        Buyer = "Admin Test", Task = "Level 50", EmployeeName = "Mulyana",
        EmployeeCode = "FH301", Status = "assigned" },
    new() { OrderRef = "X9001", Game = "Mobile Legends", OrderName = "Rank",
        Buyer = "Buyer Dua", Task = "Mythic", EmployeeName = "Budi",
        EmployeeCode = "FH302", Status = "in_progress" },
};

Assert(OrderFilters.Pending(orders, "").Count() == 2, "empty pending search does not hide data");
Assert(OrderFilters.Pending(orders, "x4671").Single().OrderRef == "X4671", "reference lookup ignores case");
Assert(OrderFilters.Pending(orders, "AION 50").Single().OrderRef == "X4671", "search spans game + task");
Assert(!OrderFilters.Pending(orders, "AION mobile").Any(), "all query terms must match");
Assert(OrderFilters.Active(orders, "", "assigned").Single().EmployeeName == "Mulyana", "status assigned filter");
Assert(OrderFilters.Active(orders, "BUDI", "Semua Status").Single().OrderRef == "X9001", "search employee in tasks");
Assert(!OrderFilters.Active(orders, "X4671", "in_progress").Any(), "status + text filter combined");
Assert(OrderFilters.Active(orders, "", "Semua Status").Count() == 2, "all active tasks visible");

var employees = new List<Employee>
{
    new() { Code = "FH301", Name = "Mulyana", Team = "FH3", LocalStatus = "WORK" },
    new() { Code = "FH302", Name = "Budi", Team = "FH3", LocalStatus = "SLEEP" },
};
Assert(OrderFilters.Employees(employees, "Mulyana").Single().Code == "FH301", "employee name search");
Assert(OrderFilters.Employees(employees, "Tidur").Single().Name == "Budi", "local status search");
Assert(OrderFilters.Employees(employees, "fh3 FH302").Single().Name == "Budi", "employee team and code search");

Console.WriteLine("All CP Boost Monitor Windows search/filter checks passed.");
