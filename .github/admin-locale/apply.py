"""Apply readable, hash-verified admin UI copy edits on the isolated review branch only."""
import hashlib
import json
import os
from pathlib import Path

if os.environ.get('GITHUB_REF_NAME') != 'chatgpt/admin-indonesian':
    raise SystemExit('This preparation script is restricted to the isolated admin review branch.')
root = Path.cwd()
prepare = root / '.github/admin-locale'
new_files = [
    'website/lib/adminLocale.ts',
    'website/lib/adminLocaleMessages.ts',
    'website/tests/adminLocale.test.ts',
    'website/tests/helpers/adminLocaleContracts.ts',
    'website/tests/fixtures/adminLocaleContracts.json',
    'website/tests/adminLocale.browser.mjs',
]
allowed_prefixes = ('website/app/admin/', 'website/components/admin/', 'website/features/payroll/components/')
allowed_files = {
    'website/components/wallet/AdminWalletPayments.tsx',
    'website/features/payroll/lib/labels.ts',
    'website/features/payroll/lib/ai-auditor.ts',
    'website/features/payroll/lib/spreadsheet-export.ts',
}
sha = lambda text: hashlib.sha256(text.encode('utf-8')).hexdigest()
changes = []
seen = set()
chunks = sorted(prepare.glob('changes-*.json'))
if len(chunks) != 8:
    raise SystemExit('Expected eight readable edit files.')
for chunk in chunks:
    for record in json.loads(chunk.read_text()):
        name = record['path']
        if name in seen or '..' in Path(name).parts or not (name.startswith(allowed_prefixes) or name in allowed_files):
            raise SystemExit(f'Invalid or duplicate change path: {name}')
        seen.add(name)
        source_path = root / name
        if source_path.is_symlink():
            raise SystemExit(f'Symlinks are not allowed: {name}')
        source = source_path.read_text()
        if sha(source) != record['sha256']:
            raise SystemExit(f'Baseline hash mismatch: {name}')
        end = 0
        for start, stop, text in record['edits']:
            if not (isinstance(start, int) and isinstance(stop, int) and end <= start <= stop <= len(source) and isinstance(text, str)):
                raise SystemExit(f'Invalid source edit: {name}')
            end = stop
        result = source
        for start, stop, text in reversed(record['edits']):
            result = result[:start] + text + result[stop:]
        if sha(result) != record['result_sha256']:
            raise SystemExit(f'Result hash mismatch: {name}')
        changes.append((source_path, result))
if len(changes) != 66:
    raise SystemExit('Unexpected changed file count.')
messages = ''.join((prepare / f'admin-messages-{i:02d}.txt').read_text() for i in range(3))
# Correct one transcription typo before checking the expected local source hash.
messages = messages.replace('meresponspons', 'merespons')
if sha(messages) != 'ae0687d319c219b8fb66a75f20ad9c5ad8c3e7c7e830f366db25307f4e63fafa':
    raise SystemExit('Admin message source hash mismatch.')
for file, content in changes:
    file.write_text(content)
(root / 'website/lib/adminLocaleMessages.ts').write_text(messages)
# Final copy polish; these are display strings, not enums or persisted properties.
closing = root / 'website/app/admin/payroll/finance/closing/page.tsx'
closing.write_text(closing.read_text().replace('Tutup Buku / Tutup Buku', 'Tutup Buku'))
export_file = root / 'website/features/payroll/lib/spreadsheet-export.ts'
export_file.write_text(export_file.read_text().replace('EVO COMEPLAYERS Operational & Finance Ekspor', 'EVO COMEPLAYERS Ekspor Operasional & Keuangan'))
message_file = root / 'website/lib/adminLocaleMessages.ts'
message_file.write_text(message_file.read_text().replace('"EVO COMEPLAYERS Operational & Finance Ekspor"', '"EVO COMEPLAYERS Ekspor Operasional & Keuangan"').replace('"Tidak ada pesanan yang dapat di-Tutup Buku pada periode ini."', '"Tidak ada pesanan yang dapat dimasukkan ke tutup buku pada periode ini."'))
paths = sorted(seen | set(new_files))
if len(paths) != 72 or not all((root / name).is_file() for name in paths):
    raise SystemExit('Final admin change set is incomplete.')
(prepare / 'changed-paths.json').write_text(json.dumps(paths, indent=2))
print(f'Applied {len(changes)} verified admin UI edits; final change set has {len(paths)} files.')
