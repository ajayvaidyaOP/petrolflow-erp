import React, { useState, useEffect } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DemoNotice,
  LoadingBlock,
  PageHeader,
} from '../components/ui';
import { useAuth } from '../lib/auth';
import { apiGet, apiPost } from '../lib/api';
import { formatINR, formatLitres, formatDate } from '../lib/format';
import { cn } from '../lib/utils';

// Senior Dev: Added 'loyalty.read' permission check in App.tsx
// Mock data structure for Senior Dev demo (will connect to API later)
interface LoyaltyPoint {
  id: string;
  customerId: string;
  customerName: string;
  vehicleNumber: string;
  pointsEarned: number;
  pointsRedeemed: number;
  balance: number;
  lastTransaction: string;
  status: 'active' | 'expired' | 'redeemed';
}

interface LoyaltyTransaction {
  id: string;
  date: string;
  type: 'earn' | 'redeem';
  amount: number; // Litres or Currency
  points: number;
  description: string;
}

function Metric({ label, value, valueClassName }: { label: string; value: React.ReactNode; valueClassName?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-carbon-700/75 bg-carbon-900/55 p-3.5 sm:p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">{label}</p>
      <p className={cn('num mt-1 font-display text-xl font-extrabold tracking-tight text-ink-100 sm:text-2xl', valueClassName)}>
        {value}
      </p>
    </div>
  );
}

export default function Loyalty() {
  const { me } = useAuth();
  const [points, setPoints] = useState<LoyaltyPoint[]>([]);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<LoyaltyPoint | null>(null);
  const [loading, setLoading] = useState(true);

  // Senior Dev: API integration (mocked for now, will use apiGet('/loyalty/points'))
  useEffect(() => {
    // Simulate API call
    const timer = setTimeout(() => {
      setPoints([
        {
          id: '1',
          customerId: 'CUST-001',
          customerName: 'Sunrise Fuels - Owner',
          vehicleNumber: 'MH-12-AB-1234',
          pointsEarned: 5000,
          pointsRedeemed: 1200,
          balance: 3800,
          lastTransaction: '2026-11-08T10:30:00Z',
          status: 'active',
        },
        {
          id: '2',
          customerId: 'CUST-002',
          customerName: 'Rajesh Transport',
          vehicleNumber: 'MH-14-XY-5678',
          pointsEarned: 12000,
          pointsRedeemed: 0,
          balance: 12000,
          lastTransaction: '2026-11-09T08:15:00Z',
          status: 'active',
        },
      ]);
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleSelectCustomer = (customer: LoyaltyPoint) => {
    setSelectedCustomer(customer);
    // Fetch transactions for this customer
    setTransactions([
      { id: 't1', date: '2026-11-09T08:15:00Z', type: 'earn', amount: 150, points: 150, description: 'Fuel Sale - Petrol 95' },
      { id: 't2', date: '2026-11-08T10:30:00Z', type: 'redeem', amount: 0, points: 500, description: 'Lubricant Discount' },
    ]);
  };

  const handleRedeem = async () => {
    // Senior Dev: apiPost('/loyalty/redeem', { customerId: selectedCustomer?.customerId, points: 100 })
    alert(`Redeeming points for ${selectedCustomer?.customerName}... (Senior Dev: API integration pending)`);
  };

  if (loading) return <LoadingBlock label="Loading Loyalty Dashboard..." rows={4} />;

  return (
    <div>
      <PageHeader
        title="Loyalty & Vehicle History Dashboard"
        actions={<Badge>Total Active Customers: {points.length}</Badge>}
      />

      <DemoNotice>
        SAMPLE DATA — this screen is a prototype. The customers, balances and transactions are fixed examples built
        into the page; nothing here is read from or saved to the backend yet.
      </DemoNotice>

      {/* One column until there is room for the list beside the details (the sidebar takes ~250px from md up). */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* Customer List */}
        <Card className="overflow-hidden">
          <CardHeader title="Customers" />
          <div className="max-h-[600px] overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => {
                  const selected = selectedCustomer?.id === p.id;
                  return (
                    <tr
                      key={p.id}
                      className={cn('cursor-pointer', selected && '!bg-accent/10')}
                      onClick={() => handleSelectCustomer(p)}
                    >
                      <td className="whitespace-nowrap">
                        {/* A real button keeps the row selectable from the keyboard; its click bubbles up to the row. */}
                        <button
                          type="button"
                          aria-pressed={selected}
                          className="rounded font-semibold text-ink-100 underline-offset-4 hover:underline"
                        >
                          {p.vehicleNumber}
                        </button>
                      </td>
                      <td className="num whitespace-nowrap">{p.balance} pts</td>
                      <td>
                        <Badge tone={p.status === 'active' ? 'success' : 'danger'}>{p.status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Selected Customer Details */}
        <Card>
          <CardHeader
            title={
              selectedCustomer
                ? `Vehicle: ${selectedCustomer.vehicleNumber} | Owner: ${selectedCustomer.customerName}`
                : 'Select a Customer'
            }
          />
          {selectedCustomer ? (
            <CardBody className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Total Earned" value={<>{selectedCustomer.pointsEarned} pts</>} />
                <Metric label="Balance" value={<>{selectedCustomer.balance} pts</>} valueClassName="text-ok" />
              </div>

              <div>
                <h3 className="mb-2 font-display text-sm font-bold text-ink-100">Transaction History</h3>
                <div className="table-wrap rounded-xl border border-carbon-700/60">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="max-sm:hidden">Type</th>
                        <th>Description</th>
                        <th className="text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((t) => {
                        const type = <Badge tone={t.type === 'earn' ? 'success' : 'neutral'}>{t.type.toUpperCase()}</Badge>;
                        return (
                          <tr key={t.id}>
                            <td className="whitespace-nowrap">{formatDate(t.date)}</td>
                            <td className="max-sm:hidden">{type}</td>
                            <td>
                              {t.description}
                              {/* A phone has no room for a Type column, so the badge moves under the description
                                  and the Points column stays on screen without swiping sideways. */}
                              <span className="mt-1 block sm:hidden">{type}</span>
                            </td>
                            <td className="num whitespace-nowrap text-right">
                              {t.type === 'earn' ? `+${t.points}` : `-${t.points}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  variant="primary"
                  className="h-auto min-h-10 whitespace-normal py-2 max-sm:w-full"
                  onClick={handleRedeem}
                  disabled={selectedCustomer.balance === 0}
                >
                  Redeem Points (Senior Dev: API Pending)
                </Button>
              </div>
            </CardBody>
          ) : (
            <div className="grid h-64 place-items-center px-6 text-center text-sm text-ink-400">
              Select a customer from the list to view history and redeem points.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
