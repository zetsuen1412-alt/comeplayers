import type { Order } from '../types/domain';
import { getOrderAssignments } from './order-workers';
import type { MutationColumnId } from './mutation-table-layout';

export type MutationSortColumn = Exclude<MutationColumnId, 'actions'>;
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

function stringValue(order: Order, column: MutationSortColumn) {
  switch (column) {
    case 'date': return order.orderedAt;
    case 'code': return order.externalReference;
    case 'source': return order.source;
    case 'type': return order.orderType;
    case 'buyer': return order.buyerName ?? '';
    case 'order': return order.orderName ?? (order.orderType === 'gold' ? 'Gold' : (order.service ?? ''));
    case 'workers': return getOrderAssignments(order).map((assignment) => `${assignment.employeeName} ${assignment.team}`).join(' ');
    case 'game': return order.gameName ?? order.game;
    case 'region': return order.region ?? '';
    case 'server': return order.server ?? '';
    case 'status': return statusText(order);
    case 'quantity':
    case 'total':
      return '';
  }
}

export function toggleMutationSort(current: MutationSortState, column: MutationSortColumn): MutationSortState {
  if (current.column === column) return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  return { column, direction: 'asc' };
}

export function compareMutationOrders(a: Order, b: Order, sort: MutationSortState) {
  let result = 0;
  if (sort.column === 'quantity') result = a.quantity - b.quantity;
  else if (sort.column === 'total') result = a.grossMinor - b.grossMinor;
  else result = collator.compare(stringValue(a, sort.column), stringValue(b, sort.column));

  if (!result) result = collator.compare(a.externalReference, b.externalReference);
  return sort.direction === 'asc' ? result : -result;
}

export function mutationSortLabel(sort: MutationSortState) {
  if (sort.column === 'date') return sort.direction === 'asc' ? 'Hari & tanggal: lama → baru' : 'Hari & tanggal: baru → lama';
  if (sort.column === 'quantity' || sort.column === 'total') {
    return `${sort.column === 'quantity' ? 'Jumlah' : 'Total'}: ${sort.direction === 'asc' ? 'kecil → besar' : 'besar → kecil'}`;
  }
  const labels: Record<MutationSortColumn, string> = {
    date: 'Hari & tanggal', code: 'Kode', source: 'Sumber', type: 'Jenis', buyer: 'Pembeli',
    order: 'Nama pesanan', workers: 'Karyawan', game: 'Gim', region: 'Wilayah', server: 'Server',
    quantity: 'Jumlah', total: 'Total', status: 'Status',
  };
  return `${labels[sort.column]}: ${sort.direction === 'asc' ? 'A → Z' : 'Z → A'}`;
}
