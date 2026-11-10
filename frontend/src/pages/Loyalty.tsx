import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, CardFooter } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/table';
import { useAuth } from '../lib/auth';
import { apiGet, apiPost } from '../lib/api';
import { formatINR, formatLitres, formatDate } from '../lib/format';

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

export default function Loyalty() {
  const { me } = useAuth();
  const [points, setPoints] = useState<LoyaltyPoint[]>([]);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<LoyaltyPoint | null>(null);
  const [loading, setLoading] = useState(true);

  // Senior Dev: API integration (mocked for now, will use apiGet('/loyalty/points'))
  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
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

  if (loading) return <div>Loading Loyalty Dashboard...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Loyalty & Vehicle History Dashboard</h1>
        <Badge variant="secondary">Total Active Customers: {points.length}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Customer List */}
        <Card className="md:col-span-1">
          <CardHeader>
            <h2 className="text-lg font-semibold">Customers</h2>
          </CardHeader>
          <CardContent className="max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {points.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted" onClick={() => handleSelectCustomer(p)}>
                    <TableCell>{p.vehicleNumber}</TableCell>
                    <TableCell>{p.balance} pts</TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'active' ? 'default' : 'destructive'}>
                        {p.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Selected Customer Details */}
        <Card className="md:col-span-2">
          <CardHeader>
            <h2 className="text-lg font-semibold">
              {selectedCustomer ? `Vehicle: ${selectedCustomer.vehicleNumber} | Owner: ${selectedCustomer.customerName}` : 'Select a Customer'}
            </h2>
          </CardHeader>
          <CardContent>
            {selectedCustomer ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Earned</p>
                    <p className="text-2xl font-bold">{selectedCustomer.pointsEarned} pts</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Balance</p>
                    <p className="text-2xl font-bold text-green-500">{selectedCustomer.balance} pts</p>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-2">Transaction History</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Points</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell>{formatDate(t.date)}</TableCell>
                          <TableCell>
                            <Badge variant={t.type === 'earn' ? 'default' : 'secondary'}>
                              {t.type.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>{t.description}</TableCell>
                          <TableCell>{t.type === 'earn' ? `+${t.points}` : `-${t.points}`}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-6 flex justify-end">
                  <Button onClick={handleRedeem} disabled={!selectedCustomer || selectedCustomer.balance === 0}>
                    Redeem Points (Senior Dev: API Pending)
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Select a customer from the left to view history and redeem points.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
