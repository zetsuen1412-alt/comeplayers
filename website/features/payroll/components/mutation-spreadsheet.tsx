'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { clampMutationWidth, defaultMutationWidths, mutationColumns, mutationWidthsStorageKey, readMutationWidths, type MutationColumnId, type MutationColumnWidths } from '../lib/mutation-table-layout';
import type { MutationSortColumn, MutationSortDirection } from '../lib/mutation-table-sort';
import './mutation-spreadsheet.css';

type Selection = {
  totalCount: number;
  selectedCount: number;
  hiddenCount: number;
  disabled?: boolean;
  onToggleAll: (checked: boolean) => void;
  onClear: () => void;
  actions?: ReactNode;
};
type Props = { children: ReactNode; rowCount: number; filterLabel: string; readOnly?: boolean; selection?: Selection; overlay?: ReactNode; onOverlayClose?: () => void; sortColumn?: MutationSortColumn; sortDirection?: MutationSortDirection; onSort?: (column: MutationSortColumn) => void };
type Drag = { id: MutationColumnId; pointer: number; startX: number; width: number; target: HTMLButtonElement };
const selectionWidth = 64;

function SelectAllCheckbox({ selection, label }: { selection: Selection; label: string }) {
  const checkbox = useRef<HTMLInputElement>(null);
  const checked = selection.totalCount > 0 && selection.selectedCount === selection.totalCount;
  const mixed = selection.selectedCount > 0 && !checked;
  useEffect(() => { if (checkbox.current) checkbox.current.indeterminate = mixed; }, [mixed]);
  return <input ref={checkbox} type="checkbox" className="mutation-sheet-checkbox" aria-label={label} checked={checked}
    disabled={selection.disabled || !selection.totalCount} onChange={event => selection.onToggleAll(event.target.checked)} />;
}

function syncHorizontal(source: HTMLDivElement, target: HTMLDivElement | null) {
  if (!target) return;
  const sourceMax = Math.max(0, source.scrollWidth - source.clientWidth);
  const targetMax = Math.max(0, target.scrollWidth - target.clientWidth);
  const ratio = sourceMax > 0 ? source.scrollLeft / sourceMax : 0;
  const next = ratio * targetMax;
  if (Math.abs(target.scrollLeft - next) > 0.5) target.scrollLeft = next;
}

/** Layout preferences are local-only. This component never writes payroll data. */
export function MutationSpreadsheet({ children, rowCount, filterLabel, readOnly = false, selection, overlay, onOverlayClose, sortColumn, sortDirection, onSort }: Props) {
  const [widths, setWidths] = useState(defaultMutationWidths);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<MutationColumnId>('order');
  const [draftWidth, setDraftWidth] = useState(String(defaultMutationWidths().order));
  const [expanded, setExpanded] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [gutter, setGutter] = useState(0);
  const [message, setMessage] = useState('');
  const table = useRef<HTMLTableElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const topScroll = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<Drag | null>(null);
  const position = useRef({ left: 0, top: 0 });
  const uid = useId();
  const tableId = `${uid}-table`, helpId = `${uid}-help`, headingId = `${uid}-heading`;
  const selectedColumn = mutationColumns.find(column => column.id === selected)!;
  const totalWidth = mutationColumns.reduce((total, column) => total + widths[column.id], 0) + (selection ? selectionWidth : 0);

  useEffect(() => {
    try { setWidths(readMutationWidths(localStorage.getItem(mutationWidthsStorageKey))); }
    catch { /* Browser storage is optional. */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(mutationWidthsStorageKey, JSON.stringify({ version: 1, widths })); }
      catch { /* Keep working when storage is blocked or full. */ }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [widths, loaded]);
  useEffect(() => { setDraftWidth(String(widths[selected])); }, [selected, widths]);
  useEffect(() => { if (readOnly) setExpanded(false); }, [readOnly]);
  useEffect(() => {
    if (!expanded || !dialog.current) return;
    const modal = dialog.current;
    const previousOverflow = document.body.style.overflow;
    modal.showModal();
    document.body.style.overflow = 'hidden';
    return () => { modal.close(); document.body.style.overflow = previousOverflow; };
  }, [expanded]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (scroll.current) { scroll.current.scrollLeft = position.current.left; scroll.current.scrollTop = position.current.top; }
      if (topScroll.current) topScroll.current.scrollLeft = position.current.left;
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded]);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setGutter(Math.max(0, (topScroll.current?.clientWidth ?? element.clientWidth) - element.clientWidth)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, rowCount]);

  function resize(id: MutationColumnId, value: number) {
    setWidths(current => {
      const width = clampMutationWidth(id, value);
      return width === current[id] ? current : { ...current, [id]: width };
    });
  }
  function endDrag(cancel = false) {
    const current = drag.current;
    drag.current = null; setResizing(false);
    if (!current) return;
    if (cancel) resize(current.id, current.width);
    if (current.target.hasPointerCapture(current.pointer)) current.target.releasePointerCapture(current.pointer);
  }
  function startDrag(event: PointerEvent<HTMLButtonElement>, id: MutationColumnId) {
    if (readOnly || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, pointer: event.pointerId, startX: event.clientX, width: widths[id], target: event.currentTarget };
    setSelected(id); setResizing(true);
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointer || readOnly) return;
    resize(current.id, current.width + event.clientX - current.startX);
  }
  function fitColumns(id?: MutationColumnId) {
    if (!table.current || readOnly) return;
    // One isolated browser layout measures all currently filtered rows, not just
    // the viewport. No per-pointer-move measurement or payroll content storage.
    const holder = document.createElement('div');
    holder.className = 'mutation-sheet-measure'; holder.inert = true;
    holder.setAttribute('aria-hidden', 'true');
    const clone = table.current.cloneNode(true) as HTMLTableElement;
    clone.removeAttribute('id'); clone.removeAttribute('style');
    clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    clone.querySelector('colgroup')?.remove();
    holder.appendChild(clone);
    table.current.parentElement?.appendChild(holder);
    try {
      const headers = clone.tHead?.rows[0]?.cells;
      if (!headers) return;
      const measured: Partial<MutationColumnWidths> = {};
      mutationColumns.forEach(column => {
        const header = clone.querySelector<HTMLTableCellElement>(`th[data-column="${column.id}"]`);
        if (header && (!id || column.id === id)) measured[column.id] = clampMutationWidth(column.id, Math.ceil(header.getBoundingClientRect().width) + 4);
      });
      setWidths(current => ({ ...current, ...measured }));
      setMessage(id ? `Lebar ${mutationColumns.find(column => column.id === id)!.label} disesuaikan dengan isi.` : 'Semua kolom disesuaikan dengan isi baris pada filter ini.');
    } finally { holder.remove(); }
  }
  function keyboardResize(event: KeyboardEvent<HTMLButtonElement>, id: MutationColumnId) {
    if (readOnly) return;
    const step = event.shiftKey ? 64 : 16;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', 'Escape'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); setSelected(id);
    if (event.key === 'ArrowLeft') resize(id, widths[id] - step);
    if (event.key === 'ArrowRight') resize(id, widths[id] + step);
    if (event.key === 'Home') resize(id, defaultMutationWidths()[id]);
    if (event.key === 'End') resize(id, mutationColumns.find(column => column.id === id)!.max);
    if (event.key === 'Enter') fitColumns(id);
    if (event.key === 'Escape') { if (drag.current) endDrag(true); else if (expanded) closeExpanded(); }
  }
  function commitWidth() {
    if (readOnly) return;
    if (!draftWidth.trim() || !Number.isFinite(Number(draftWidth))) { setDraftWidth(String(widths[selected])); return; }
    const value = clampMutationWidth(selected, Number(draftWidth));
    resize(selected, value); setDraftWidth(String(value));
  }
  function closeExpanded() {
    endDrag(); setExpanded(false);
    requestAnimationFrame(() => expandButton.current?.focus({ preventScroll: true }));
  }
  const content = <div className="mutation-sheet-content" data-resizing={resizing}>
      <div className="mutation-sheet-toolbar">
        <div className="mutation-sheet-heading"><h2 id={headingId}>Tabel Mutasi</h2><p id={helpId}>Klik judul kolom untuk mengurutkan. Klik lagi untuk membalik urutan. Tarik batas kanan judul untuk mengubah lebar, atau klik dua kali batas untuk menyesuaikan isi.</p></div>
        <button type="button" className="mutation-sheet-action" onClick={() => fitColumns()} disabled={readOnly}>Rapikan semua kolom</button>
        <button type="button" className="mutation-sheet-action" onClick={() => { setWidths(defaultMutationWidths()); setMessage('Lebar kolom kembali ke ukuran awal.'); }} disabled={readOnly}>Atur ulang lebar</button>
        <button type="button" ref={expanded ? undefined : expandButton} className="mutation-sheet-action mutation-sheet-primary" onClick={() => expanded ? closeExpanded() : setExpanded(true)} disabled={readOnly}>{expanded ? 'Kecilkan tabel' : 'Perbesar tabel'}</button>
      </div>
      {selection ? <div className="mutation-sheet-selection" aria-label="Pilihan pesanan Mutasi">
        <label><SelectAllCheckbox selection={selection} label="Pilih semua pesanan pada filter" />Pilih semua</label>
        <span role="status" aria-live="polite">{selection.selectedCount.toLocaleString('id-ID')} dari {selection.totalCount.toLocaleString('id-ID')} pesanan pada filter dipilih{selection.hiddenCount ? ` · ${selection.hiddenCount.toLocaleString('id-ID')} pilihan di luar filter` : ''}</span>
        <button type="button" className="mutation-sheet-action" disabled={selection.disabled || !(selection.selectedCount + selection.hiddenCount)} onClick={selection.onClear}>Batal pilih</button>
        <small>Paket harian dipilih sebagai satu pesanan.</small>
        {selection.actions}
      </div> : null}
      <div className="mutation-sheet-controls">
        <label htmlFor={`${uid}-column`}>Pilih kolom<select id={`${uid}-column`} aria-label="Pilih kolom" className="mutation-sheet-control" value={selected} disabled={readOnly} onChange={event => setSelected(event.target.value as MutationColumnId)}>{mutationColumns.map(column => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label>
        <label htmlFor={`${uid}-width`}>Lebar (px)<input id={`${uid}-width`} aria-label="Lebar (px)" className="mutation-sheet-control" type="number" min={selectedColumn.min} max={selectedColumn.max} step={1} value={draftWidth} disabled={readOnly} onChange={event => setDraftWidth(event.target.value)} onBlur={commitWidth} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitWidth(); } }} /></label>
        <button type="button" className="mutation-sheet-action" onClick={commitWidth} disabled={readOnly}>Terapkan lebar</button>
        <button type="button" className="mutation-sheet-action" onClick={() => fitColumns(selected)} disabled={readOnly}>Sesuaikan isi kolom</button>
      </div>
      <div ref={topScroll} className="mutation-sheet-top-scroll" aria-hidden="true" onScroll={event => syncHorizontal(event.currentTarget, scroll.current)}><div style={{ width: totalWidth + gutter, height: 1 }} /></div>
      <div ref={scroll} className="mutation-sheet-scroll" role="region" aria-label="Gulir tabel Mutasi" aria-describedby={helpId} tabIndex={0} onScroll={event => {
        position.current = { left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
        syncHorizontal(event.currentTarget, topScroll.current);
      }}>
        <table id={tableId} ref={table} className="cp-table mutation-sheet-table" aria-label="Daftar Mutasi" style={{ width: totalWidth, minWidth: totalWidth, tableLayout: 'fixed' }}>
          <colgroup>{selection ? <col style={{ width: selectionWidth }} /> : null}{mutationColumns.map(column => <col key={column.id} style={{ width: widths[column.id] }} />)}</colgroup>
          <thead><tr>{selection ? <th scope="col" data-column="selection"><SelectAllCheckbox selection={selection} label="Pilih semua pesanan di tabel" /></th> : null}{mutationColumns.map(column => {
            const sortable = column.id !== 'actions' && column.id !== 'day' && column.id !== 'distribution' && Boolean(onSort);
            const activeSort = sortable && sortColumn === column.id;
            return <th scope="col" key={column.id} data-column={column.id} data-selected={selected === column.id}
              aria-sort={activeSort ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}>
              <button type="button" className="mutation-sheet-header" onClick={() => {
                setSelected(column.id);
                if (sortable) onSort?.(column.id as MutationSortColumn);
              }} title={sortable ? `Urutkan ${column.label}; klik lagi untuk membalik urutan` : `Pilih kolom ${column.label} untuk mengatur lebarnya`}>
                <span>{column.label}</span>
                {sortable ? <span className="mutation-sheet-sort-indicator" data-active={activeSort} aria-hidden="true">{activeSort ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span> : null}
              </button>
              <button type="button" className="mutation-sheet-resizer" role="separator" aria-orientation="vertical" aria-label={`Lebar kolom ${column.label}`} aria-valuemin={column.min} aria-valuemax={column.max} aria-valuenow={widths[column.id]} aria-valuetext={`${widths[column.id]} piksel`} aria-controls={tableId} disabled={readOnly}
                title="Tarik untuk mengubah lebar; klik dua kali / Enter untuk sesuaikan isi. Panah kiri/kanan juga dapat digunakan."
                onPointerDown={event => startDrag(event, column.id)} onPointerMove={moveDrag}
                onPointerUp={event => { moveDrag(event); endDrag(); }} onPointerCancel={() => endDrag(true)} onLostPointerCapture={() => endDrag()}
                onDoubleClick={() => fitColumns(column.id)} onKeyDown={event => keyboardResize(event, column.id)} />
            </th>;
          })}</tr></thead>
          {children}
        </table>
        {!rowCount && <p style={{ padding: 20 }}>Tidak ada Mutasi sesuai filter.</p>}
      </div>
      <div className="mutation-sheet-footer"><span>{rowCount.toLocaleString('id-ID')} baris mutasi · {mutationColumns.length + (selection ? 1 : 0)} kolom · {filterLabel}</span><div role="status" aria-live="polite">{message || 'Pengaturan lebar disimpan di browser ini. Data pesanan dan hasil ekspor tidak berubah.'}</div></div>
      {overlay}
    </div>;
  return <>
    <section className="mutation-sheet" hidden={expanded} aria-label="Pengaturan tabel Mutasi">{!expanded && content}</section>
    <dialog ref={dialog} className="mutation-sheet-dialog" aria-labelledby={headingId} onCancel={event => { event.preventDefault(); if (overlay) onOverlayClose?.(); else closeExpanded(); }}>{expanded && content}</dialog>
  </>;
}
