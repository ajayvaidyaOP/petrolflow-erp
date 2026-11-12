import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { apiGet, apiList, apiPost } from '../lib/api';
import { useAuth, useStations } from '../lib/auth';
import { useIdempotencyTracker } from '../lib/idempotency';
import { formatINR, formatDateTime, todayIst } from '../lib/format';
import { Button, Card, EmptyState, ErrorState, Field, Input, Select, Modal, PageHeader, Pagination, LoadingBlock, Badge, Textarea } from '../components/ui';

type Slip = { id: string; slipNumber: string; reference: string; vehicleNumber: string; occurredAt: string; amount: string; quantityLitres: string; ratePerLitre: string; productName: string };
type Party = { id: string; name: string; address?: string; gstin?: string; phone?: string; legalName?: string };
type Bill = { id: string; billNumber: string; billDate: string; dueDate: string; totalAmount: string; status: string; customerName: string; customerSnapshot: {customer: Party; issuer: Party; station: Party}; notes: string; voidReason: string; items: { id: string; amount: string; entrySnapshot: Slip }[] };

export default function CreditBilling() {
  const { stationId } = useStations(); const { can } = useAuth(); const qc = useQueryClient();
  const [tab, setTab] = useState<'unbilled'|'billed'>('unbilled');
  const [customerId, setCustomer] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [page, setPage] = useState(1);
  const [checked, setChecked] = useState<string[]>([]); const [issuing, setIssuing] = useState(false); const [selected, setSelected] = useState('');
  const [billDate, setDate] = useState(todayIst()); const [dueDate, setDue] = useState(todayIst()); const [number, setNumber] = useState(''); const [notes, setNotes] = useState('');
  const [voiding,setVoiding] = useState(false); const [reason,setReason] = useState('');
  const keys = useIdempotencyTracker('credit-bill');
  const customers = useQuery({queryKey:['billing-customers'],queryFn:()=>apiGet<Party[]>('/catalog/customers?pageSize=200')});
  const slips = useQuery({queryKey:['unbilled',stationId,customerId,from,to,page],queryFn:()=>apiList<Slip>(`/credit-billing/unbilled?stationId=${stationId}&customerId=${customerId}&from=${from}&to=${to}&page=${page}&pageSize=50`),enabled:!!stationId && !!customerId && tab==='unbilled'});
  const bills = useQuery({queryKey:['credit-bills',stationId,customerId,page],queryFn:()=>apiList<Bill>(`/credit-billing/bills?stationId=${stationId}&customerId=${customerId}&page=${page}&pageSize=20`),enabled:!!stationId && tab==='billed'});
  const detail = useQuery({queryKey:['credit-bill',selected],queryFn:()=>apiGet<Bill>(`/credit-billing/bills/${selected}`),enabled:!!selected});
  const refresh=()=>{void qc.invalidateQueries();};
  const issue = useMutation({mutationFn:()=>{
    const payload={stationId,customerId,entryIds:checked,billDate,dueDate,billNumber:number,notes};
    return apiPost<{id:string}>('/credit-billing/bills',payload,keys.keyFor(payload));
  },onSuccess:data=>{keys.reset();setChecked([]);setIssuing(false);setSelected(data.id);setTab('billed');setPage(1);refresh();}});
  const voidBill = useMutation({mutationFn:()=>apiPost(`/credit-billing/bills/${selected}/void`,{reason},keys.keyFor({selected,reason})),onSuccess:()=>{keys.reset();setVoiding(false);setReason('');refresh();}});
  const rows=slips.data?.data || []; const picked=rows.filter(s=>checked.includes(s.id)); const total=picked.reduce((sum,s)=>sum.plus(s.amount),new Decimal(0)).toFixed(2);
  const reset=()=>{setPage(1);setChecked([]);};
  if(!stationId)return <EmptyState title="No station assigned"/>;
  const bill=detail.data;
  return <>
    <PageHeader title="Credit sale billing" description="Group existing credit slips into customer bills. Billing does not record another sale, move stock or increase the ledger balance." />
    <div className="mb-4 flex gap-2"><Button variant={tab==='unbilled'?'primary':'outline'} onClick={()=>{setTab('unbilled');reset();}}>Unbilled slips</Button><Button variant={tab==='billed'?'primary':'outline'} onClick={()=>{setTab('billed');reset();}}>Billed register</Button></div>
    <Card className="mb-4 p-4"><div className="grid gap-3 sm:grid-cols-3"><Field label="Customer"><Select value={customerId} onChange={e=>{setCustomer(e.target.value);reset();}}><option value="">{tab==='billed'?'All customers':'Select customer…'}</option>{customers.data?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>{tab==='unbilled'&&<><Field label="Slips from"><Input type="date" value={from} onChange={e=>{setFrom(e.target.value);reset();}}/></Field><Field label="Slips to"><Input type="date" value={to} onChange={e=>{setTo(e.target.value);reset();}}/></Field></>}</div>{customers.isError&&<ErrorState error={customers.error} onRetry={()=>void customers.refetch()}/>}</Card>
    {tab==='unbilled' ? !customerId ? <EmptyState title="Select a customer to prepare a bill"/> : slips.isLoading ? <LoadingBlock/> : slips.isError ? <ErrorState error={slips.error} onRetry={()=>void slips.refetch()}/> : <Card>
      {!rows.length?<EmptyState title="No unbilled credit slips" description="Record credit sales under Customer credit. Already billed slips are excluded."/>:<><div className="flex flex-wrap items-center justify-between gap-3 p-4"><Button variant="outline" onClick={()=>setChecked(checked.length===rows.length?[]:rows.map(r=>r.id))}>Select page</Button><span>{checked.length} selected · {formatINR(total)}</span>{can('sales.write')&&<Button variant="primary" disabled={!checked.length} onClick={()=>{issue.reset();setIssuing(true);}}>Prepare bill</Button>}</div><div className="table-wrap"><table className="data-table"><thead><tr><th>Select</th><th>Slip</th><th>Date</th><th>Vehicle</th><th>Amount</th></tr></thead><tbody>{rows.map(s=><tr key={s.id}><td><input type="checkbox" aria-label={`Select slip ${s.slipNumber||s.reference||s.id}`} checked={checked.includes(s.id)} onChange={e=>setChecked(e.target.checked?[...checked,s.id]:checked.filter(x=>x!==s.id))}/></td><td>{s.slipNumber||s.reference||'—'}</td><td>{formatDateTime(s.occurredAt)}</td><td>{s.vehicleNumber||'—'}</td><td className="num">{formatINR(s.amount)}</td></tr>)}</tbody></table></div></>}
      {slips.data&&<Pagination {...slips.data.meta} onPage={p=>{setPage(p);setChecked([]);}}/>}
    </Card> : bills.isLoading ? <LoadingBlock/> : bills.isError ? <ErrorState error={bills.error} onRetry={()=>void bills.refetch()}/> : <Card>{!bills.data?.data.length?<EmptyState title="No credit bills"/>:<div className="table-wrap"><table className="data-table"><thead><tr><th>Bill</th><th>Customer</th><th>Date / due</th><th>Status</th><th>Total</th><th/></tr></thead><tbody>{bills.data.data.map(b=><tr key={b.id}><td>{b.billNumber}</td><td>{b.customerName}</td><td>{b.billDate}<div className="text-xs text-ink-500">Due {b.dueDate}</div></td><td><Badge>{b.status}</Badge></td><td className="num">{formatINR(b.totalAmount)}</td><td><Button size="sm" onClick={()=>{setSelected(b.id);setVoiding(false);voidBill.reset();}}>Open bill</Button></td></tr>)}</tbody></table></div>}{bills.data&&<Pagination {...bills.data.meta} onPage={setPage}/>}</Card>}
    <Modal open={issuing} onClose={()=>setIssuing(false)} title="Prepare credit bill" description="Consolidated bill of existing slips, not a new tax invoice. Original sale amounts, tax treatment and slip due dates are unchanged." footer={<><Button variant="ghost" onClick={()=>setIssuing(false)}>Cancel</Button><Button variant="primary" loading={issue.isPending} disabled={!checked.length||!billDate||!dueDate||dueDate<billDate} onClick={()=>issue.mutate()}>Issue credit bill</Button></>}>
      <div className="space-y-3"><p>{checked.length} slips · {formatINR(total)}</p><Field label="Bill number" hint="Leave blank to generate automatically."><Input maxLength={120} value={number} onChange={e=>setNumber(e.target.value)}/></Field><Field label="Bill date" required><Input type="date" value={billDate} onChange={e=>setDate(e.target.value)}/></Field><Field label="Bill due date" required><Input type="date" min={billDate} value={dueDate} onChange={e=>setDue(e.target.value)}/></Field><Field label="Notes"><Textarea maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>{issue.isError&&<ErrorState error={issue.error}/>}</div>
    </Modal>
    <Modal open={!!selected} onClose={()=>{setSelected('');setVoiding(false);}} title={bill?.billNumber||'Credit bill'} size="2xl" footer={bill&&<><Button onClick={()=>window.print()}>Print / Save PDF</Button>{can('sales.write')&&bill.status==='ISSUED'&&<Button variant="outline" onClick={()=>{setVoiding(true);voidBill.reset();}}>Void bill</Button>}</>}>
      {detail.isLoading?<LoadingBlock/>:detail.isError?<ErrorState error={detail.error} onRetry={()=>void detail.refetch()}/>:bill&&<div id="credit-bill-print" className="space-y-4">
        <h2 className="text-xl font-bold">{bill.customerSnapshot.issuer?.legalName||bill.customerSnapshot.issuer?.name}</h2><p>{bill.customerSnapshot.station?.name} · {bill.customerSnapshot.station?.address}</p><h3 className="font-bold">Consolidated credit bill · {bill.billNumber}</h3><p><Badge>{bill.status}</Badge> · {bill.billDate} · Due {bill.dueDate}</p><p className="whitespace-pre-wrap">{bill.customerSnapshot.customer?.name}<br/>{bill.customerSnapshot.customer?.address}<br/>{bill.customerSnapshot.customer?.gstin}</p>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Slip / reference</th><th>Sale date</th><th>Vehicle</th><th>Amount</th></tr></thead><tbody>{bill.items.map(item=><tr key={item.id}><td>{item.entrySnapshot.slipNumber||item.entrySnapshot.reference||'—'}</td><td>{formatDateTime(item.entrySnapshot.occurredAt)}</td><td>{item.entrySnapshot.vehicleNumber||'—'}</td><td className="num">{formatINR(item.amount)}</td></tr>)}</tbody></table></div><p className="text-right text-xl font-bold">Total {formatINR(bill.totalAmount)}</p><p className="whitespace-pre-wrap">{bill.notes}</p><p className="text-xs text-ink-500">This consolidates previously posted credit sales. It is not a payment receipt or a new tax invoice; no tax is added again. Bill due date is a collection target, not a change to original ledger ageing.</p>{bill.status==='VOID'&&<p>VOID · {bill.voidReason}</p>}
      </div>}
      {voiding&&<div className="mt-4 space-y-3"><Field label="Void reason" hint="Minimum 5 characters. Slips become available for rebilling; the original bill remains in history."><Textarea value={reason} onChange={e=>setReason(e.target.value)}/></Field><Button variant="danger" disabled={reason.trim().length<5} loading={voidBill.isPending} onClick={()=>voidBill.mutate()}>Confirm void</Button>{voidBill.isError&&<ErrorState error={voidBill.error}/>}</div>}
    </Modal>
  </>;
}
