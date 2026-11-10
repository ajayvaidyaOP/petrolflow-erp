import React, { useState, useEffect } from 'react';
import { Button, Card, CardBody, DemoNotice, Input, LoadingBlock } from '../components/ui';
import { useAuth } from '../lib/auth';
import { apiGet, apiPost } from '../lib/api';
import { formatINR, formatLitres, formatDate } from '../lib/format';
import { cn } from '../lib/utils';
import { ChevronLeft, ChevronRight, Fuel, Truck, Calendar, AlertTriangle } from 'lucide-react';

// Senior Dev: Mobile-First Pump Tablet UI (Petrol Pump CRM)
// Optimized for 7-10 inch tablets used by pump attendants.
// Large touch targets, high contrast, offline-ready indicators.
// Responsive: stacked on phones and portrait tablets, two columns once both cards fit side by side.

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

// Senior Dev: Large touch button component for tablet
const TabletButton = ({ children, onClick, variant = 'primary', className = '' }: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'danger' | 'secondary'; className?: string
}) => (
  <Button
    onClick={onClick}
    variant={variant}
    className={cn('h-20 w-full whitespace-normal rounded-2xl px-3 text-center text-lg font-bold leading-tight', className)}
  >
    {children}
  </Button>
);

// Round icon button for the shortcut bar at the bottom of the screen.
const ShortcutButton = ({ icon, label, variant = 'outline' }: {
  icon: React.ReactNode; label: string; variant?: 'outline' | 'danger'
}) => (
  <Button variant={variant} icon={icon} className="h-16 w-16 flex-col gap-1 rounded-full px-0 text-[10px]">
    {label}
  </Button>
);

const TabletCardHeader = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <div className="flex items-center gap-2 border-b border-carbon-700/60 px-4 py-3.5 sm:px-5 sm:py-4">
    {icon}
    <h2 className="font-display text-xl font-bold tracking-tight text-ink-100">{title}</h2>
  </div>
);

const Metric = ({ label, value, valueClassName }: { label: string; value: React.ReactNode; valueClassName?: string }) => (
  // Wide enough for a full rupee amount; a narrow card simply stacks the tiles.
  <div className="min-w-0 flex-1 basis-48 rounded-xl border border-carbon-700/75 bg-carbon-900/55 p-4">
    <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">{label}</p>
    <p className={cn('num mt-1 font-display text-2xl font-extrabold tracking-tight text-ink-100', valueClassName)}>{value}</p>
  </div>
);

export default function PumpTabletUI() {
  const { me } = useAuth();
  const [activeShift, setActiveShift] = useState<TabletShift | null>(null);
  const [alerts, setAlerts] = useState<TabletAlert[]>([]);
  const [loading, setLoading] = useState(true);

  // Senior Dev: API integration (mocked for sandbox, will use apiGet('/tablet/shift'))
  useEffect(() => {
    const timer = setTimeout(() => {
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
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <LoadingBlock label="Loading Pump Tablet..." rows={5} />;

  return (
    <div className="space-y-4">
      <DemoNotice>
        SAMPLE DATA — this screen is a prototype. The shift figures and alerts are fixed examples, and the buttons are
        not connected to the pumps or the backend yet.
      </DemoNotice>

      {/* Header: Pump ID + Attendant + Time */}
      <div className="brand-gradient flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-2xl p-4 text-onbrand shadow-glow sm:p-5">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Pump {activeShift?.pumpId || '01'}</h1>
          <p className="text-sm text-onbrand/85">Attendant: {activeShift?.attendant || 'Loading...'}</p>
        </div>
        <div className="sm:text-right">
          <p className="font-display text-xl font-bold">{formatDate(new Date().toISOString())}</p>
          <p className="text-sm text-onbrand/85">Shift: {activeShift?.status.toUpperCase()}</p>
        </div>
      </div>

      {/* Alerts Section (Senior Dev: Critical for Pump Operations) */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div key={alert.id} className={cn(
              'flex items-center gap-3 rounded-xl p-3',
              alert.severity === 'high' ? 'bg-danger text-ondanger' : 'bg-warn text-onwarn',
            )}>
              <AlertTriangle className="h-8 w-8 shrink-0" aria-hidden />
              <span className="min-w-0 font-bold">{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main Dashboard Grid (one column until two cards fit beside the sidebar) */}
      <div className="grid items-start gap-4 lg:grid-cols-2">

        {/* Shift Summary Card */}
        <Card className="border-2 border-accent/50">
          <TabletCardHeader icon={<Fuel className="h-6 w-6 shrink-0 text-accent" aria-hidden />} title="Shift Summary" />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Metric
                label="Litres Dispensed"
                value={<>{activeShift?.litresDispensed.toFixed(1)} L</>}
                valueClassName="text-accent"
              />
              <Metric
                label="Cash Collected"
                value={formatINR(activeShift?.cashCollected || 0)}
                valueClassName="text-ok"
              />
            </div>
            <div className="grid gap-2">
              <TabletButton>
                Open Nozzle (Pump 1)
              </TabletButton>
              <TabletButton>
                Close Nozzle (Pump 1)
              </TabletButton>
            </div>
          </CardBody>
        </Card>

        {/* Vehicle & Loyalty Quick Actions */}
        <Card className="border-2 border-accent/50">
          <TabletCardHeader icon={<Truck className="h-6 w-6 shrink-0 text-accent" aria-hidden />} title="Quick Actions" />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <TabletButton variant="secondary" className="h-16">
                Vehicle History
              </TabletButton>
              <TabletButton variant="secondary" className="h-16">
                Loyalty Points
              </TabletButton>
            </div>
            <div className="grid gap-2">
              <Input
                aria-label="Vehicle Number"
                placeholder="Vehicle Number (MH-12-AB-1234)"
                className="h-16 rounded-2xl text-base sm:text-lg"
              />
              <TabletButton>
                Scan & Dispense
              </TabletButton>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Bottom Navigation (Senior Dev: Tablet-friendly large icons).
          Kept in the page flow instead of fixed to the window: the app shell already owns the bottom
          edge on phones and the left edge from tablet width up, and a floating bar would cover the
          buttons above it on short screens. */}
      <Card role="group" aria-label="Pump shortcuts" className="flex items-center justify-around gap-2 border-accent/40 p-3">
        <ShortcutButton icon={<Fuel className="h-6 w-6" aria-hidden />} label="Shift" />
        <ShortcutButton icon={<Truck className="h-6 w-6" aria-hidden />} label="Vehicle" />
        <ShortcutButton icon={<Calendar className="h-6 w-6" aria-hidden />} label="History" />
        <ShortcutButton icon={<AlertTriangle className="h-6 w-6" aria-hidden />} label="Alerts" variant="danger" />
      </Card>
    </div>
  );
}
