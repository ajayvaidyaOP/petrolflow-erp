import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { Plus, Trash2 } from 'lucide-react';
import { apiGet, apiList, apiPost } from '../lib/api';
import { useAuth, useStations } from '../lib/auth';
import { useIdempotencyTracker } from '../lib/idempotency';
import { todayIst, formatINR, formatLitres } from '../lib/format';
import { Button, Card, EmptyState, ErrorState, Field, Input, Select, Textarea, Modal, PageHeader, Pagination, LoadingBlock, Badge } from '../components/ui';

type Invoice = { id: string; supplierId: string; revision: number; documentType: 'ORDER' | 'INVOICE'; sourceOrderId?: string; convertedInvoiceId?: string; invoiceNumber: string; supplierName: string; invoiceDate: string; dueDate: string; status: string; subtotal: string; discountAmount: string; freightAmount: string; taxAmount: string; totalAmount: string; vehicleNumber: string; transporter: string; notes: string; returnReason: string; events: { id: string; kind: string; amount: string; occurredAt: string; note: string }[]; lines: Line[] };
type Line = { id?: string; receivedLitres?: string; returnedLitres?: string; tankId: string; tankCode?: string; productName?: string; quantityLitres: string; ratePerLitre: string; amount?: string };
type Tank = { id: string; code: string; name: string; productId: string; productName?: string; status: string };
const blankLine = (): Line => ({ tankId: '', quantityLitres: '', ratePerLitre: '' });
const money = (value: string) => { try { const d = new Decimal(value || '0'); return d.isFinite() ? d : new Decimal(0); } catch { return new Decimal(0); } };

export default function Purchases() {
  const { stationId } = useStations();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [documentType, setDocumentType] = useState<'INVOICE' | 'ORDER'>('INVOICE');
  const [converting, setConverting] = useState(false);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Invoice | undefined>();
  const [selected, setSelected] = useState('');
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState('');
  const [quantityKind, setQuantityKind] = useState<'receive' | 'return' | null>(null);
  const keys = useIdempotencyTracker('purchase-action');
  const query = useQuery({ queryKey: ['purchases', stationId, page, search, from, to, documentType], queryFn: () => apiList<Invoice>(`/purchases?stationId=${stationId}&documentType=${documentType}&page=${page}&pageSize=15&search=${encodeURIComponent(search)}&from=${from}&to=${to}`), enabled: Boolean(stationId) });
  const detail = useQuery({ queryKey: ['purchase', selected], queryFn: () => apiGet<Invoice>(`/purchases/${selected}`), enabled: Boolean(selected) });
  const invalidate = () => { void qc.invalidateQueries(); };
  const action = useMutation({ mutationFn: (input: 'receive' | 'return' | 'cancel' | { kind: 'receive' | 'return'; lines: {lineId: string; quantityLitres: string}[]; reason: string }) => {
    const kind = typeof input === 'string' ? input : input.kind;
    const payload = typeof input === 'string' ? { reason } : { lines: input.lines, reason: input.reason };
    return apiPost(`/purchases/${selected}/${kind}`, payload, keys.keyFor({ selected, kind, ...payload }));
  }, onSuccess: () => { keys.reset(); setReturning(false); setQuantityKind(null); setReason(''); invalidate(); } });
  if (!stationId) return <EmptyState title="No station assigned" />;
  const invoice = detail.data;
  return <>
    <PageHeader title="Purchases & orders" description="Multi-line fuel purchases, partial receipts and returns. Drafts do not change tank stock or supplier payables." actions={can('deliveries.write') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(undefined); setCreating(true); }}>{documentType === 'ORDER' ? 'New purchase order' : 'New purchase invoice'}</Button>} />
    <Field label="Register" className="mb-4"><Select value={documentType} onChange={e => { setDocumentType(e.target.value as 'INVOICE' | 'ORDER'); setPage(1); }}><option value="INVOICE">Purchase invoices</option><option value="ORDER">Purchase orders</option></Select></Field>
    <Card className="mb-4 p-4"><div className="grid gap-3 sm:grid-cols-3">
      <Field label="Search invoice or supplier"><Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></Field>
      <Field label="From"><Input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></Field>
      <Field label="To"><Input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} /></Field>
    </div></Card>
    {query.isLoading ? <LoadingBlock /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <Card>
      {!query.data?.data.length ? <EmptyState title="No purchase invoices" description="Existing single-tank receipts are still under Deliveries. Do not enter the same supplier invoice in both registers." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Invoice</th><th>Date / due</th><th>Supplier</th><th>Status</th><th className="text-right">Total</th><th /></tr></thead><tbody>{query.data.data.map(row => <tr key={row.id}><td>{row.invoiceNumber}</td><td>{row.invoiceDate}<div className="text-xs text-ink-500">Due {row.dueDate}</div></td><td>{row.supplierName}</td><td><Badge>{row.status}</Badge></td><td className="text-right num">{formatINR(row.totalAmount)}</td><td><Button size="sm" variant="ghost" onClick={() => { setSelected(row.id); action.reset(); }}>Open</Button></td></tr>)}</tbody></table></div>}
      {query.data && <Pagination {...query.data.meta} onPage={setPage} />}
    </Card>}
    {creating && <PurchaseForm key={stationId} initial={editing} order={editing ? editing.documentType === 'ORDER' : documentType === 'ORDER'} stationId={stationId} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); setSelected(id); invalidate(); }} />}
    <Modal open={Boolean(selected)} onClose={() => { setSelected(''); setReturning(false); action.reset(); }} title={invoice ? `${invoice.documentType === 'ORDER' ? 'Purchase order' : 'Purchase'} · ${invoice.invoiceNumber}` : 'Purchase invoice'} size="2xl" footer={invoice && can('deliveries.write') ? <div className="flex flex-wrap gap-2">
      {invoice.documentType === 'ORDER' && invoice.status === 'DRAFT' && <Button variant="primary" onClick={() => setConverting(true)}>Convert to invoice</Button>}
      {invoice.status === 'DRAFT' && <><Button onClick={() => { setEditing(invoice); setSelected(''); setCreating(true); }}>Edit draft</Button><Button variant="outline" onClick={() => { setReturning(true); setReason(''); action.reset(); }}>Cancel draft</Button></>}
      {invoice.status === 'DRAFT' && returning && <><Field label="Cancellation reason" hint="At least 5 characters. The invoice remains in the audit trail."><Input value={reason} onChange={e => setReason(e.target.value)} /></Field><Button variant="danger" disabled={reason.trim().length < 5} loading={action.isPending} onClick={() => action.mutate('cancel')}>Confirm cancellation</Button></>}
      {invoice.documentType === 'INVOICE' && ['DRAFT', 'PARTIAL_RECEIVED'].includes(invoice.status) && <Button variant="primary" loading={action.isPending} onClick={() => action.mutate('receive')}>{invoice.status === 'DRAFT' ? 'Receive all lines into tanks' : 'Receive remaining quantities'}</Button>}
      {invoice.documentType === 'INVOICE' && ['RECEIVED', 'PARTIAL_RETURNED'].includes(invoice.status) && !returning && <Button variant="outline" onClick={() => { setReturning(true); action.reset(); }}>Return full invoice</Button>}
      {invoice.documentType === 'INVOICE' && ['RECEIVED', 'PARTIAL_RETURNED'].includes(invoice.status) && returning && <><Field label="Return reason" hint="At least 5 characters; all remaining received quantities will be reversed."><Input value={reason} onChange={e => setReason(e.target.value)} /></Field><Button variant="danger" disabled={reason.trim().length < 5} loading={action.isPending} onClick={() => action.mutate('return')}>Confirm full return</Button></>}
      {invoice.documentType === 'INVOICE' && ['DRAFT', 'PARTIAL_RECEIVED'].includes(invoice.status) && <Button variant="outline" onClick={() => { action.reset(); setQuantityKind('receive'); }}>Partial receipt</Button>}
      {invoice.documentType === 'INVOICE' && ['RECEIVED', 'PARTIAL_RETURNED'].includes(invoice.status) && <Button variant="outline" onClick={() => { action.reset(); setQuantityKind('return'); }}>Partial return</Button>}
    </div> : undefined}>
      {detail.isLoading ? <LoadingBlock /> : detail.isError ? <ErrorState error={detail.error} onRetry={() => void detail.refetch()} /> : invoice && <div className="space-y-4">
        <p><Badge>{invoice.status}</Badge> · Invoice {invoice.invoiceDate} · Due {invoice.dueDate}</p>
        {invoice.documentType === 'ORDER' && <p className="text-sm text-ink-400">Orders do not move stock or create payables. Conversion creates one separate draft invoice for this order.</p>}
        {invoice.sourceOrderId && <Button size="sm" onClick={() => setSelected(invoice.sourceOrderId!)}>Open source order</Button>}
        {invoice.convertedInvoiceId && <Button size="sm" onClick={() => setSelected(invoice.convertedInvoiceId!)}>Open converted invoice</Button>}
        <p className="text-sm text-ink-400">Vehicle: {invoice.vehicleNumber || '—'} · Transporter: {invoice.transporter || '—'}</p>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Fuel / tank</th><th className="text-right">Ordered</th><th className="text-right">Received / returned</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead><tbody>{invoice.lines.map((l, i) => <tr key={i}><td>{l.productName} · {l.tankCode}</td><td className="text-right">{formatLitres(l.quantityLitres)}</td><td className="text-right">{formatLitres(l.receivedLitres || '0')} / {formatLitres(l.returnedLitres || '0')}</td><td className="text-right">{formatINR(l.ratePerLitre)}</td><td className="text-right">{formatINR(l.amount || '0')}</td></tr>)}</tbody></table></div>
        <p className="text-sm">Subtotal {formatINR(invoice.subtotal)} − discount {formatINR(invoice.discountAmount)} + freight {formatINR(invoice.freightAmount)} + invoice tax {formatINR(invoice.taxAmount)}</p>
        <h3 className="font-semibold">Receipt / return history</h3>
        {!invoice.events?.length ? <p className="text-sm text-ink-500">Nothing posted yet.</p> : invoice.events.map(event => <div key={event.id} className="rounded-lg border border-carbon-700 p-3 text-sm"><strong>{event.kind}</strong> · {event.occurredAt} · {formatINR(event.amount)}<p>{event.note}</p></div>)}
        <p className="text-xl font-bold">Total {formatINR(invoice.totalAmount)}</p><p className="whitespace-pre-wrap text-sm">{invoice.notes}</p>
        {(invoice.status === 'RETURNED' || invoice.status === 'CANCELLED') && <p className="text-sm">{invoice.status === 'CANCELLED' ? 'Cancelled: ' : 'Full return posted: '}{invoice.returnReason}</p>}
        <p className="text-xs text-ink-500">Each receipt posts only its selected litres today. Discount, freight and invoice tax are allocated proportionally by line value to received/returned quantities, with cumulative rounding to avoid penny drift. Complete receipt before returning fuel. For detailed dip/density decantation records use Deliveries. No automatic tax/GST determination.</p>
      </div>}
      {action.isError && <div className="mt-4" role="alert"><ErrorState error={action.error} /></div>}
    </Modal>
    {converting && invoice && <ConvertOrder order={invoice} onClose={() => setConverting(false)} onSaved={id => { setConverting(false); setDocumentType('INVOICE'); setSelected(id); invalidate(); }} />}
    {quantityKind && invoice && <QuantityModal invoice={invoice} kind={quantityKind} busy={action.isPending} error={action.error} onClose={() => setQuantityKind(null)} onSubmit={(lines, note) => action.mutate({ kind: quantityKind, lines, reason: note })} />}
  </>;
}

function PurchaseForm({ stationId, initial, order, onClose, onSaved }: { order: boolean; initial?: Invoice; stationId: string; onClose: () => void; onSaved: (id: string) => void }) {
  const [supplierId, setSupplier] = useState(initial?.supplierId ?? '');
  const [invoiceNumber, setNumber] = useState(initial?.invoiceNumber ?? '');
  const [invoiceDate, setDate] = useState(initial?.invoiceDate ?? todayIst());
  const [dueDate, setDue] = useState(initial?.dueDate ?? todayIst());
  const [lines, setLines] = useState<Line[]>(initial?.lines.map(l => ({ tankId: l.tankId, quantityLitres: l.quantityLitres, ratePerLitre: l.ratePerLitre })) ?? [blankLine()]);
  const [discountAmount, setDiscount] = useState(initial?.discountAmount ?? '0');
  const [freightAmount, setFreight] = useState(initial?.freightAmount ?? '0');
  const [taxAmount, setTax] = useState(initial?.taxAmount ?? '0');
  const [vehicleNumber, setVehicle] = useState(initial?.vehicleNumber ?? '');
  const [transporter, setTransporter] = useState(initial?.transporter ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const keys = useIdempotencyTracker('purchase-create');
  const options = useQuery({ queryKey: ['purchase-options', stationId], queryFn: () => apiGet<{ suppliers: {id: string; name: string}[]; tanks: Tank[] }>(`/purchases/options?stationId=${stationId}`) });
  const suppliers = options.data?.suppliers;
  const tanks = options.data?.tanks;
  const subtotal = lines.reduce((sum, l) => sum.plus(money(l.quantityLitres).times(money(l.ratePerLitre)).toDecimalPlaces(2)), new Decimal(0));
  const total = subtotal.minus(money(discountAmount)).plus(money(freightAmount)).plus(money(taxAmount));
  const save = useMutation({ mutationFn: () => {
    const payload = { revision: initial?.revision, stationId, supplierId, invoiceNumber, invoiceDate, dueDate, lines, discountAmount, freightAmount, taxAmount, vehicleNumber, transporter, notes };
    return apiPost<{ id: string }>(initial ? `/purchases/${initial.id}/edit` : order ? '/purchase-orders' : '/purchases', payload, keys.keyFor(payload));
  }, onSuccess: data => { keys.reset(); onSaved(data.id); } });
  const update = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
  const lookupError = options.error;
  return <Modal open onClose={onClose} title={order ? (initial ? 'Edit purchase order' : 'New purchase order') : initial ? 'Edit draft purchase invoice' : 'New purchase invoice'} description="Fuel lines only · save draft, then receive when the fuel arrives. Use supplier invoice tax amounts; tax is not calculated automatically." size="2xl" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={Boolean(lookupError) || !supplierId || !invoiceNumber.trim() || !lines.length || lines.some(l => !l.tankId || !money(l.quantityLitres).gt(0) || !money(l.ratePerLitre).gt(0))} onClick={() => save.mutate()}>Save draft</Button></>}>
    <div className="space-y-5">
      {lookupError && <ErrorState error={lookupError} onRetry={() => { void options.refetch(); }} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Supplier" required><Select value={supplierId} onChange={e => setSupplier(e.target.value)}><option value="">Select supplier…</option>{suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label={order ? 'Order number' : 'Invoice number'} required><Input value={invoiceNumber} maxLength={120} onChange={e => setNumber(e.target.value)} /></Field>
        <Field label="Invoice date" required><Input type="date" value={invoiceDate} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Due date" required><Input type="date" min={invoiceDate} value={dueDate} onChange={e => setDue(e.target.value)} /></Field>
      </div>
      <div className="flex items-center justify-between"><h3 className="font-semibold">Line items · {lines.length}</h3><Button size="sm" disabled={lines.length >= 50} onClick={() => setLines([...lines, blankLine()])}>Add line</Button></div>
      <div className="space-y-3">{lines.map((l, i) => <div key={i} className="grid items-end gap-3 rounded-xl border border-carbon-700 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={`Fuel / tank ${i + 1}`} required><Select value={l.tankId} onChange={e => update(i, { tankId: e.target.value })}><option value="">Select tank…</option>{tanks?.filter(t => t.status === 'ACTIVE').map(t => <option key={t.id} value={t.id}>{t.code} · {t.productName || t.name}</option>)}</Select></Field>
        <Field label={`Litres ${i + 1}`} required><Input inputMode="decimal" value={l.quantityLitres} onChange={e => update(i, { quantityLitres: e.target.value })} /></Field>
        <Field label={`Rate ${i + 1}`} required><Input inputMode="decimal" value={l.ratePerLitre} onChange={e => update(i, { ratePerLitre: e.target.value })} /></Field>
        <div className="pb-2 num text-sm">{formatINR(money(l.quantityLitres).times(money(l.ratePerLitre)).toFixed(2))}</div>
        <Button variant="ghost" aria-label={`Remove line ${i + 1}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
      </div>)}</div>
      <div className="grid gap-3 sm:grid-cols-3"><Field label="Discount amount (₹)"><Input inputMode="decimal" value={discountAmount} onChange={e => setDiscount(e.target.value)} /></Field><Field label="Freight amount (₹)"><Input inputMode="decimal" value={freightAmount} onChange={e => setFreight(e.target.value)} /></Field><Field label="Invoice tax amount (₹)"><Input inputMode="decimal" value={taxAmount} onChange={e => setTax(e.target.value)} /></Field></div>
      <p className="text-right font-bold">Subtotal {formatINR(subtotal.toFixed(2))} · Grand total {formatINR(total.toFixed(2))}</p>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Vehicle number"><Input value={vehicleNumber} maxLength={80} onChange={e => setVehicle(e.target.value)} /></Field><Field label="Transporter"><Input value={transporter} maxLength={160} onChange={e => setTransporter(e.target.value)} /></Field></div>
      <Field label="Internal notes"><Textarea value={notes} maxLength={4000} onChange={e => setNotes(e.target.value)} /></Field>
      {save.isError && <div role="alert"><ErrorState error={save.error} /></div>}
    </div>
  </Modal>;
}

function QuantityModal({ invoice, kind, busy, error, onClose, onSubmit }: { invoice: Invoice; kind: 'receive' | 'return'; busy: boolean; error: Error | null; onClose: () => void; onSubmit: (lines: {lineId: string; quantityLitres: string}[], reason: string) => void }) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const returning = kind === 'return';
  const available = invoice.lines.map(l => ({ ...l, remaining: money(returning ? l.receivedLitres || '0' : l.quantityLitres).minus(money(returning ? l.returnedLitres || '0' : l.receivedLitres || '0')) })).filter(l => l.remaining.gt(0));
  const selected = available.filter(l => money(quantities[l.id!] || '0').gt(0)).map(l => ({ lineId: l.id!, quantityLitres: quantities[l.id!] }));
  const invalid = available.some(l => { const raw = quantities[l.id!]; if (!raw) return false; try { const n = new Decimal(raw); return !n.isFinite() || n.lt(0) || n.gt(l.remaining) || n.decimalPlaces() > 3; } catch { return true; } });
  return <Modal open onClose={onClose} title={returning ? 'Partial purchase return' : 'Partial purchase receipt'} description="Enter litres for the lines being posted now. Leave other lines blank. The server recalculates the proportional payable." footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={returning ? 'danger' : 'primary'} loading={busy} disabled={invalid || !selected.length || (returning && reason.trim().length < 5)} onClick={() => onSubmit(selected, reason)}>Post selected quantities</Button></>}>
    <div className="space-y-4">{available.map(l => <Field key={l.id} label={`Litres · ${l.tankCode} · line ${invoice.lines.findIndex(x => x.id === l.id) + 1}`} hint={`Maximum ${formatLitres(l.remaining.toFixed(3))}`}><Input inputMode="decimal" value={quantities[l.id!] || ''} onChange={e => setQuantities({ ...quantities, [l.id!]: e.target.value })} /></Field>)}
      {returning && <Field label="Return reason" hint="Minimum 5 characters; permanently audited."><Textarea value={reason} onChange={e => setReason(e.target.value)} /></Field>}
      {invalid && <p role="alert" className="text-sm text-danger">Use non-negative quantities with at most 3 decimal places, within the remaining litres.</p>}
      {error && <ErrorState error={error} />}
    </div>
  </Modal>;
}

function ConvertOrder({ order, onClose, onSaved }: { order: Invoice; onClose: () => void; onSaved: (id: string) => void }) {
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(todayIst());
  const [due, setDue] = useState(todayIst());
  const keys = useIdempotencyTracker('order-convert');
  const convert = useMutation({ mutationFn: () => {
    const payload = { invoiceNumber: number, invoiceDate: date, dueDate: due };
    return apiPost<{id: string}>(`/purchases/${order.id}/convert-order`,payload,keys.keyFor(payload));
  }, onSuccess: data => { keys.reset(); onSaved(data.id); } });
  return <Modal open onClose={onClose} title="Convert purchase order" description="Copies all lines and charges into one draft invoice. No stock or payable is posted until receipt. Use the supplier's invoice number, different from the order number." footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={convert.isPending} disabled={!number.trim() || !date || !due || due < date} onClick={() => convert.mutate()}>Create invoice from order</Button></>}>
    <div className="space-y-3"><Field label="Supplier invoice number" required><Input value={number} maxLength={120} onChange={e=>setNumber(e.target.value)} /></Field><Field label="Invoice date" required><Input type="date" value={date} onChange={e=>setDate(e.target.value)} /></Field><Field label="Due date" required><Input type="date" min={date} value={due} onChange={e=>setDue(e.target.value)} /></Field>{convert.isError && <ErrorState error={convert.error} />}</div>
  </Modal>;
}
