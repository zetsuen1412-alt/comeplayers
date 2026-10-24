namespace CPBoostMonitor;

internal sealed class MonitorWorkspacePanel : UserControl
{
    private readonly PayrollApi _api;
    private readonly bool _admin;
    private readonly LuxuryGrid _orders = new(), _books = new();
    private readonly Label _status = new() { Dock = DockStyle.Top, Height = 52, AutoEllipsis = true };
    private readonly TextBox _search = new() { Width = 270, PlaceholderText = "Cari order / karyawan" };
    private readonly TextBox _reason = new() { Width = 350, PlaceholderText = "Alasan perubahan (wajib)" };
    private readonly ComboBox _worker = new() { Width = 180, DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly NumericUpDown _wage = new() { Width = 150, Maximum = 1000000000, ThousandsSeparator = true };
    private ManagementSnapshot _data = new();
    private BookSnapshot _bookData = new();
    private Guid _closingId = Guid.NewGuid();
    private bool _busy;
    private int _generation;
    public MonitorWorkspacePanel(PayrollApi api, bool admin)
    {
        _api = api; _admin = admin; Dock = DockStyle.Fill; Padding = new Padding(22); BackColor = LuxuryPalette.Background;
        var actions = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, WrapContents = true, Padding = new Padding(0, 8, 0, 8) };
        actions.Controls.Add(_search); AddButton(actions,"↻ Perbarui",RefreshAsync);
        if (admin) AddButton(actions,"Akun Karyawan",AccountsAsync);
        var edits = new FlowLayoutPanel { Dock = DockStyle.Bottom, AutoSize = true, WrapContents = true, Padding = new Padding(0,10,0,0) };
        if (admin) {
            edits.Controls.Add(new Label {Text="Alasan:",AutoSize=true,Margin=new Padding(0,8,4,0)});
            edits.Controls.Add(_reason);
            edits.Controls.Add(new Label {Text="Upah Rp:",AutoSize=true,Margin=new Padding(6,8,4,0)}); edits.Controls.Add(_wage);
            AddButton(edits,"Simpan Upah",()=>ChangeAsync("price",wage:(long)_wage.Value));
            edits.Controls.Add(_worker); AddButton(edits,"Pindahkan",()=>ChangeAsync("transfer"));
            AddButton(edits,"Refund",()=>ChangeAsync("status","refund"));
            AddButton(edits,"Bermasalah",()=>ChangeAsync("status","problem"));
            AddButton(edits,"Normal",()=>ChangeAsync("status","normal"));
            AddButton(edits,"Hapus / Arsip",()=>ChangeAsync("archive"));
            AddButton(edits,"Pulihkan",()=>ChangeAsync("restore"));
            AddButton(edits,"Tutup Buku",CloseBookAsync);
        }
        _orders.Dock=DockStyle.Fill;
        Column(_orders,"ORDER","OrderRef",90); Column(_orders,"KARYAWAN","EmployeeName",150);
        Column(_orders,"GAME","Game",110); Column(_orders,"UPAH BERSIH","WageDisplay",140);
        if (admin) Column(_orders,"STATUS","StateDisplay",170);
        else { Column(_orders,"SELESAI","CompletedDisplay",150);Column(_orders,"STATUS","BookStatus",130); }
        _books.Dock=DockStyle.Top; _books.Height=190; _books.Visible=!admin;
        Column(_books,"DATA TUTUP BUKU","Title",260); Column(_books,"TANGGAL","DateDisplay",180);
        Column(_books,"ORDER","OrderCount",75); Column(_books,"PENGHASILAN","TotalDisplay",160);
        Controls.Add(_orders); Controls.Add(_books); Controls.Add(_status); Controls.Add(actions); Controls.Add(edits);
        _status.Text=admin ? "Kelola order Telegram. Hapus menyimpan arsip; upah Tutup Buku dikunci." : "Pilih Data Tutup Buku untuk melihat penghasilan dan daftar order.";
        _search.TextChanged+=(_,_)=>Bind();
        _books.SelectionChanged+=(_,_)=>{ if(!_admin && _books.CurrentRow?.DataBoundItem is MonitorBook book) {
            _orders.DataSource=book.Work; _status.Text=$"{book.Title} • {book.OrderCount} order • {book.TotalDisplay}. Arsip penghasilan, bukan bukti pembayaran.";
        }};
        _orders.SelectionChanged+=(_,_)=>{if(_admin && _orders.CurrentRow?.DataBoundItem is ManagedOrder row) _wage.Value=row.WageRupiah ?? 0;};
    }
    private static void Column(DataGridView grid,string title,string property,int width) => grid.Columns.Add(new DataGridViewTextBoxColumn {
        HeaderText=title,DataPropertyName=property,Width=width,MinimumWidth=75,AutoSizeMode=DataGridViewAutoSizeColumnMode.Fill });
    private void AddButton(Control parent,string title,Func<Task> action) {
        var b=new LuxuryButton { Text=title,AutoSize=true,MinimumSize=new Size(120,36),Height=36 };
        b.Click+=async(_,_)=>{if(_busy)return;_busy=true;int generation=_generation;try{await action();}
            catch(Exception e){if(generation==_generation)_status.Text=e.Message;}finally{_busy=false;}};parent.Controls.Add(b);
    }
    public async Task RefreshAsync()
    {
        if (!_api.LoggedIn || IsDisposed) return;
        int generation=_generation;
        if(_admin) {
            if(!_api.IsAdmin) { Clear(); return; }
            var data=await _api.ManagementAsync(); var workers=await _api.RosterAsync();
            if(generation!=_generation || !_api.LoggedIn)return;
            _data=data; _worker.DataSource=workers; _worker.DisplayMember="Name";
            _status.Text=$"{_data.Eligible.Count} order siap Tutup Buku • Rp {_data.TotalRupiah:N0}. Periksa upah sebelum menutup.";
        } else {
            var books=await _api.BooksAsync();if(generation!=_generation || !_api.LoggedIn)return;
            _bookData=books; _status.Text=books.Notice;
        }
        Bind();
    }
    internal void ApplyPreview(ManagementSnapshot management, BookSnapshot books, List<Employee> workers)
    {
        _data=management;_bookData=books;_worker.DataSource=workers;_worker.DisplayMember="Name";
        _status.Text=_admin?$"{management.Eligible.Count} order siap Tutup Buku • Rp {management.TotalRupiah:N0}. Hanya data contoh.":"Pilih arsip untuk melihat penghasilan. Hanya data contoh.";Bind();
    }
    private void Bind() {
        if(_admin) _orders.DataSource=_data.Orders.Where(o=>OrderFilters.ContainsAny(_search.Text,o.OrderRef,o.EmployeeName)).ToList();
        else { _books.DataSource=_bookData.Closings.Where(b=>OrderFilters.ContainsAny(_search.Text,b.Title)).ToList();
            if(_books.CurrentRow?.DataBoundItem is not MonitorBook) _orders.DataSource=_bookData.Open; }
    }
    private async Task ChangeAsync(string action,string? state=null,long? wage=null)
    {
        if(!_api.IsAdmin || _orders.CurrentRow?.DataBoundItem is not ManagedOrder row) return;
        if(_reason.Text.Trim().Length<3) throw new InvalidOperationException("Isi alasan perubahan minimal 3 karakter.");
        string? code=(_worker.SelectedItem as Employee)?.Code;
        string detail=action=="price"?$"Upah bersih Rp {wage:N0}":action=="transfer"?$"Pekerja: {(_worker.SelectedItem as Employee)?.Name}. Order aktif memulai ulang TAKE/START untuk pekerja baru.":action=="archive"?"Order disembunyikan; riwayat dan Tutup Buku tetap disimpan.":state ?? action;
        if(MessageBox.Show(this,$"{row.OrderRef}\n{detail}\n\n{_reason.Text}","Konfirmasi perubahan admin",MessageBoxButtons.OKCancel,MessageBoxIcon.Question)!=DialogResult.OK)return;
        await _api.MutateAsync("management",new {orderRef=row.OrderRef,version=row.Version,action,reason=_reason.Text.Trim(),state,wageRupiah=wage,employeeCode=code});
        _reason.Clear();await RefreshAsync();
    }
    private async Task CloseBookAsync()
    {
        await RefreshAsync();
        if(_data.Eligible.Count==0) throw new InvalidOperationException("Belum ada order selesai yang sudah dihargai.");
        var title=Prompt("Judul Tutup Buku",$"Tutup Buku {DateTime.Now:dd MMM yyyy}");if(title is null)return;
        var list=string.Join("\n",_data.Eligible.Select(e=>$"{e.OrderRef}: Rp {e.WageRupiah:N0}"));
        if(MessageBox.Show(this,$"{title}\n{_data.Eligible.Count} order • Rp {_data.TotalRupiah:N0}\n\n{list}\n\nUpah dan penerima akan dikunci. Simpan?","Tutup Buku",MessageBoxButtons.OKCancel)!=DialogResult.OK)return;
        await _api.MutateAsync("books",new {id=_closingId,title,expected=_data.Eligible.OrderBy(e=>e.OrderRef,StringComparer.Ordinal).ToList()});
        _closingId=Guid.NewGuid(); await RefreshAsync();
    }
    private async Task AccountsAsync()
    {
        using var form=new Form { Text="Akun Karyawan",Width=570,Height=510,StartPosition=FormStartPosition.CenterParent,BackColor=LuxuryPalette.Background };
        var panel=new FlowLayoutPanel {Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,Padding=new Padding(20),WrapContents=false};form.Controls.Add(panel);
        panel.Controls.Add(new Label {Text="Hubungkan username ke satu karyawan. Admin memakai akun admin ComePlayers.",Width=500,Height=44});
        var username=new TextBox {Width=490,PlaceholderText="Username"};panel.Controls.Add(username);
        var employee=new ComboBox {Width=490,DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="Name",DataSource=await _api.RosterAsync()};panel.Controls.Add(employee);
        var create=new CheckBox {Text="Buat akun baru (email + password)",AutoSize=true};panel.Controls.Add(create);
        var email=new TextBox {Width=490,PlaceholderText="Email pemilik akun baru",Enabled=false};panel.Controls.Add(email);
        var password=new TextBox {Width=490,PlaceholderText="Password minimal 12 karakter",UseSystemPasswordChar=true,Enabled=false};panel.Controls.Add(password);
        create.CheckedChanged+=(_,_)=>{email.Enabled=password.Enabled=create.Checked;};
        var active=new CheckBox {Text="Akun aktif",Checked=true,AutoSize=true};panel.Controls.Add(active);
        var note=new Label {Width=490,Height=60,Text="Untuk mencabut akses: isi username dan karyawan yang sama, lalu hilangkan centang Akun aktif."};
        var save=new LuxuryButton {Text="Simpan akun",Width=490,Height=42};panel.Controls.Add(save);panel.Controls.Add(note);
        save.Click+=async(_,_)=>{save.Enabled=false;try {
            await _api.MutateAsync("accounts",new {username=username.Text.Trim(),employeeCode=(employee.SelectedItem as Employee)?.Code,active=active.Checked,create=create.Checked,email=email.Text.Trim(),password=password.Text});
            password.Clear();note.Text="Akun tersimpan. Karyawan dapat login dengan username.";
        }catch(Exception e){note.Text=e.Message;}finally{password.Clear();save.Enabled=true;}};
        form.ShowDialog(this);
    }
    private string? Prompt(string title,string value) {
        using var f=new Form {Text=title,Width=470,Height=180,StartPosition=FormStartPosition.CenterParent};
        var t=new TextBox {Left=20,Top=20,Width=410,Text=value};var ok=new Button {Text="Lanjut",Left=310,Top=65,Width=120,DialogResult=DialogResult.OK};
        f.Controls.Add(t);f.Controls.Add(ok);f.AcceptButton=ok;return f.ShowDialog(this)==DialogResult.OK?t.Text.Trim():null;
    }
    public void Clear() { _generation++;_data=new();_bookData=new();_orders.DataSource=null;_books.DataSource=null;_closingId=Guid.NewGuid(); }
}
