import React, { useState } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/table';
import { useAuth } from '../lib/auth';
import { apiGet, apiPost } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';
import { ChevronLeft, ChevronRight, Fuel, Truck, Calendar, AlertTriangle } from 'lucide-react';

// Senior Dev: Mobile-First Pump Tablet UI (Petrol Pump CRM)
// Optimized for 7-10 inch tablets used by pump attendants.
// Large touch targets, high contrast, offline-ready indicators.

interface TabletShift {
  id: string;
  pumpId: string;
  attendant: string;
  status: 'open' | 'closing' | 'closed';
  litresDispensed: number;
  cashCollected: number;
  lastReading: number;
  startTime: string;
}

interface TabletAlert {
  id: string;
  type: 'leakage' | 'low-stock' | 'nozzle-error';
  message: string;
  severity: 'high' | 'medium' | 'low';
}

export default function PumpTabletUI() {
  const { me } = useAuth();
  const [activeShift, setActiveShift] = useState<TabletShift | null>(null);
  const [alerts, setAlerts] = useState<TabletAlert[]>([]);
  const [loading, setLoading] = useState(true);

  // Senior Dev: API integration (mocked for sandbox, will use apiGet('/tablet/shift'))
  useEffect(() => {
    setTimeout(() => {
      setActiveShift({
        id: 'shift-9921',
        pumpId: 'PUMP-01',
        attendant: 'Rajesh Kumar',
        status: 'open',
        litresDispensed: 1250.5,
        cashCollected: 105000,
        lastReading: 45000,
        startTime: '2026-11-09T08:00:00Z',
      });
      setAlerts([
        { id: 'a1', type: 'low-stock', message: 'Tank A (Petrol 95) < 20%', severity: 'high' },
        { id: 'a2', type: 'nozzle-error', message: 'Nozzle 3 - Sensor Timeout', severity: 'medium' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  // Senior Dev: Large touch button component for tablet
  const TabletButton = ({ children, onClick, variant = 'default', className = '' }: { 
    children: React.ReactNode; onClick: () => void; variant?: 'default' | 'destructive' | 'secondary'; className?: string 
  }) => (
    <Button 
      onClick={onClick} 
      variant={variant} 
      className={`h-20 w-full text-lg font-bold rounded-xl shadow-lg ${className}`}
    >
      {children}
    </Button>
  );

  if (loading) return <div className="h-screen flex items-center justify-center text-2xl font-bold">Loading Pump Tablet...</div>;

  return (
    <div className="min-h-screen bg-charcoal-900 text-white p-4 space-y-4">
      {/* Header: Pump ID + Attendant + Time */}
      <div className="flex justify-between items-center bg-orange-600 p-4 rounded-2xl shadow-lg">
        <div>
          <h1 className="text-2xl font-bold">Pump {activeShift?.pumpId || '01'}</h1>
          <p className="text-sm opacity-80">Attendant: {activeShift?.attendant || 'Loading...'}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold">{formatDate(new Date().toISOString())}</p>
          <p className="text-sm opacity-80">Shift: {activeShift?.status.toUpperCase()}</p>
        </div>
      </div>

      {/* Alerts Section (Senior Dev: Critical for Pump Operations) */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div key={alert.id} className={`p-3 rounded-xl flex items-center gap-3 ${
              alert.severity === 'high' ? 'bg-red-600' : 'bg-yellow-600'
            }`}>
              <AlertTriangle className="w-8 h-8" />
              <span className="font-bold">{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main Dashboard Grid (Tablet Optimized: 2 columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Shift Summary Card */}
        <Card className="bg-charcoal-800 border-orange-500 border-2">
          <CardHeader>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Fuel className="w-6 h-6 text-orange-500" /> Shift Summary
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-xl">
                <p className="text-sm text-muted-foreground">Litres Dispensed</p>
                <p className="text-3xl font-bold text-orange-500">{activeShift?.litresDispensed.toFixed(1)} L</p>
              </div>
              <div className="p-4 bg-muted rounded-xl">
                <p className="text-sm text-muted-foreground">Cash Collected</p>
                <p className="text-3xl font-bold text-green-500">{formatCurrency(activeShift?.cashCollected || 0)}</p>
              </div>
            </div>
            <TabletButton variant="default" className="mt-4">
              Open Nozzle (Pump 1)
            </TabletButton>
            <TabletButton variant="default" className="mt-2">
              Close Nozzle (Pump 1)
            </TabletButton>
          </CardContent>
        </Card>

        {/* Vehicle & Loyalty Quick Actions */}
        <Card className="bg-charcoal-800 border-orange-500 border-2">
          <CardHeader>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Truck className="w-6 h-6 text-orange-500" /> Quick Actions
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <TabletButton variant="secondary" className="h-16">
                Vehicle History
              </TabletButton>
              <TabletButton variant="secondary" className="h-16">
                Loyalty Points
              </TabletButton>
            </div>
            <div className="mt-4">
              <Input 
                placeholder="Vehicle Number (MH-12-AB-1234)" 
                className="h-16 text-lg rounded-xl"
              />
              <TabletButton variant="default" className="mt-2">
                Scan & Dispense
              </TabletButton>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Navigation (Senior Dev: Tablet-friendly large icons) */}
      <div className="fixed bottom-0 left-0 right-0 bg-charcoal-900 border-t border-orange-500 p-4 flex justify-around items-center">
        <Button variant="outline" className="h-16 w-16 rounded-full flex flex-col items-center justify-center">
          <Fuel className="w-6 h-6" />
          <span className="text-[10px] mt-1">Shift</span>
        </Button>
        <Button variant="outline" className="h-16 w-16 rounded-full flex flex-col items-center justify-center">
          <Truck className="w-6 h-6" />
          <span className="text-[10px] mt-1">Vehicle</span>
        </Button>
        <Button variant="outline" className="h-16 w-16 rounded-full flex flex-col items-center justify-center">
          <Calendar className="w-6 h-6" />
          <span className="text-[10px] mt-1">History</span>
        </Button>
        <Button variant="destructive" className="h-16 w-16 rounded-full flex flex-col items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
          <span className="text-[10px] mt-1">Alerts</span>
        </Button>
      </div>
    </div>
  );
}
