import type { Order } from '../types/domain';
import { getOrderAssignments } from './order-workers';
import type { MutationColumnId } from './mutation-table-layout';
import { normalizeDivisionLabel, type MutationViewRow } from './mutation-rows';
import { getOrderRateMinor } from './price-anomaly';

export type MutationSortColumn = Exclude<MutationColumnId, 'actions' | 'day' | 'distribution'>;
export type MutationSortDirection = 'asc' | 'desc';
export type MutationSortState = { column: MutationSortColumn; direction: MutationSortDirection };

export const defaultMutationSort: MutationSortState = { column: 'date', direction: 'desc' };

const collator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' });

function statusText(order: Order) {
  if (order.payrollClosedAt) return 'Selesai sudah digaji';
  if (order.operationalStatus === 'verified') return 'Selesai masuk gaji';
  if (order.operationalStatus === 'on_hold') return 'Bermasalah';
  if (order.operationalStatus === 'completed') return 'Selesai belum masuk gaji';
  if (order.operationalStatus === 'in_progress') return 'Dikerjakan';
  if (order.operationalStatus === 'assigned') return 'Proses';
  if (order.operationalStatus === 'assignment_pending') return 'Belum ada karyawan';
  if (order.operationalStatus === 'cancelled') return 'Dibatalkan';
  return 'Baru';
}

function stringValue(order: Order, column: MutationSortColumn): string {
  switch (column) {
    case 'date': return order.orderedAt ?? '';
    case 'code': return order.externalReference ?? '';
    case 'source': return order.source ?? '';
    case 'type': return order.orderType ?? '';
    case 'buyer': return order.buyerName ?? '';
    case 'order': return order.orderName ?? (order.orderType === 'gold' ? 'Gold' : (order.service ?? ''));
    case 'task': return order.task ?? '';
    case 'workers': return getOrderAssignments(order).map((assignment) => assignment.employeeName).join(' ');
    case 'division': return [...new Set(getOrderAssignments(order).map((assignment) => normalizeDivisionLabel(assignment.team)))].join(' ');
    case 'game': return order.gameName ?? order.game ?? '';
    case 'region': return order.region ?? '';
    case 'server': return order.server ?? '';
    case 'status': return statusText(order);
    case 'quantity':
    case 'rate':
    case 'total':
      return '';
  }
  return '';
}

export function toggleMutationSort(current: MutationSortState, column: MutationSortColumn): MutationSortState {
  if (current.column === column) return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  return { column, direction: 'asc' };
}

export function compareMutationOrders(a: Order, b: Order, sort: MutationSortState) {
  let result = 0;
  if (sort.column === 'quantity') result = a.quantity - b.quantity;
  else if (sort.column === 'rate') {
    const aRate = getOrderRateMinor(a);
    const bRate = getOrderRateMinor(b);
    if (aRate === undefined && bRate !== undefined) return 1;
    if (aRate !== undefined && bRate === undefined) return -1;
    result = (aRate ?? 0) - (bRate ?? 0);
  }
  else if (sort.column === 'total') result = (a.grossMinor ?? 0) - (b.grossMinor ?? 0);
  else result = collator.compare(stringValue(a, sort.column), stringValue(b, sort.column));

  if (!result) result = collator.compare(a.externalReference ?? '', b.externalReference ?? '');
  return sort.direction === 'asc' ? result : -result;
}

export function compareMutationRowRates(a: MutationViewRow, b: MutationViewRow, direction: MutationSortDirection) {
  const aRate = getOrderRateMinor(a.order, a.day);
  const bRate = getOrderRateMinor(b.order, b.day);
  if (aRate === undefined && bRate !== undefined) return 1;
  if (aRate !== undefined && bRate === undefined) return -1;
  const result = (aRate ?? 0) - (bRate ?? 0)
    || collator.compare(a.order.externalReference, b.order.externalReference)
    || (a.day?.sequence ?? 0) - (b.day?.sequence ?? 0);
  return direction === 'asc' ? result : -result;
}

export function mutationSortLabel(sort: MutationSortState) {
  if (sort.column === 'date') return sort.direction === 'asc' ? 'Hari & tanggal: lama → baru' : 'Hari & tanggal: baru → lama';
  if (sort.column === 'quantity' || sort.column === 'rate' || sort.column === 'total') {
    return `${sort.column === 'quantity' ? 'Jumlah' : sort.column === 'rate' ? 'Rate' : 'Total'}: ${sort.direction === 'asc' ? 'kecil → besar' : 'besar → kecil'}`;
  }
  const labels: Record<MutationSortColumn, string> = {
    date: 'Hari & tanggal', code: 'Kode', source: 'Sumber', type: 'Jenis', buyer: 'Pembeli',
    order: 'Nama pesanan', task: 'TASK', workers: 'Karyawan', division: 'Divisi', game: 'GAME', region: 'Wilayah', server: 'Server',
    quantity: 'Jumlah', rate: 'Rate', total: 'Total', status: 'Status',
  };
  return `${labels[sort.column]}: ${sort.direction === 'asc' ? 'A → Z' : 'Z → A'}`;
}
