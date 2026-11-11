import React, { useState, useEffect } from 'react';
import { Badge, Card, CardBody, CardHeader, DemoNotice, LoadingBlock, PageHeader } from '../components/ui';
import { formatINR, formatLitres, formatDate } from '../lib/format';
import { apiGet } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';

// Senior Dev: Vehicle History Dashboard (Petrol Pump CRM)
// Tracks 12-month sales, average mileage, and fuel points per vehicle.
// Responsive: one column until the list fits beside the details; the summary tiles wrap on their own.

interface VehicleHistory {
  vehicleNumber: string;
  customerName: string;
  totalLitres: number;
  totalSales: number; // INR
  avgMileage: number; // km/litre (estimated from odometer readings)
  lastTransaction: string;
  fuelPointsEarned: number;
  monthlySales: Record<string, number>; // Last 12 months: "2026-11": 1500, ...
}

interface MonthlySalesData {
  month: string;
  litres: number;
  sales: number;
}

function Metric({ label, value, valueClassName }: { label: string; value: React.ReactNode; valueClassName?: string }) {
  return (
    // Wide enough for a full rupee amount; narrower cards simply wrap the tiles onto more rows.
    <div className="min-w-0 flex-1 basis-48 rounded-xl border border-carbon-700/75 bg-carbon-900/55 p-3.5 sm:p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">{label}</p>
      <p className={cn('num mt-1 font-display text-xl font-extrabold tracking-tight text-ink-100', valueClassName)}>
        {value}
      </p>
    </div>
  );
}

export default function VehicleHistoryDashboard() {
  const { me } = useAuth();
  const [history, setHistory] = useState<VehicleHistory[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleHistory | null>(null);
  const [loading, setLoading] = useState(true);

  // Senior Dev: API integration (mocked for now, will use apiGet('/crm/vehicle-history'))
  useEffect(() => {
    // Simulate API call for last 12 months data
    const timer = setTimeout(() => {
      setHistory([
        {
          vehicleNumber: 'MH-12-AB-1234',
          customerName: 'Sunrise Fuels - Owner',
          totalLitres: 45000,
          totalSales: 3825000,
          avgMileage: 12.5,
          lastTransaction: '2026-11-09T10:30:00Z',
          fuelPointsEarned: 4500,
          monthlySales: {
            '2025-11': 3000, '2025-12': 3200, '2026-01': 2800, '2026-02': 3100,
            '2026-03': 3500, '2026-04': 3300, '2026-05': 3700, '2026-06': 3900,
            '2026-07': 4100, '2026-08': 3800, '2026-09': 4200, '2026-10': 4500,
            '2026-11': 1200, // Current month partial
          },
        },
        {
          vehicleNumber: 'MH-14-XY-5678',
          customerName: 'Rajesh Transport',
          totalLitres: 85000,
          totalSales: 7225000,
          avgMileage: 8.2,
          lastTransaction: '2026-11-09T08:15:00Z',
          fuelPointsEarned: 8500,
          monthlySales: {
            '2025-11': 6000, '2025-12': 6500, '2026-01': 5800, '2026-02': 6200,
            '2026-03': 7000, '2026-04': 6800, '2026-05': 7500, '2026-06': 7800,
            '2026-07': 8100, '2026-08': 7900, '2026-09': 8500, '2026-10': 9000,
            '2026-11': 2500, // Current month partial
          },
        },
      ]);
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleSelectVehicle = (v: VehicleHistory) => {
    setSelectedVehicle(v);
  };

  // Senior Dev: Helper to render monthly bar chart (simple CSS bars for now)
  const renderMonthlyChart = (monthlySales: Record<string, number>) => {
    const months = Object.entries(monthlySales);
    const max = Math.max(0, ...months.map(([, litres]) => litres)) || 1;
    return (
      <div
        role="img"
        aria-label={`Litres per month: ${months.map(([month, litres]) => `${month} ${litres} L`).join(', ')}`}
        className="mt-4 grid gap-1 sm:gap-1.5"
        style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
      >
        {months.map(([month, litres]) => (
          <div key={month} className="flex min-w-0 flex-col items-center">
            {/* Fixed-height track: the bar's percentage height needs a definite height to resolve against. */}
            <div className="relative h-36 w-full">
              <div
                className="absolute inset-x-0 bottom-0 rounded-t bg-accent transition-all duration-500"
                style={{ height: `${(litres / max) * 100}%`, minHeight: '4px' }}
                title={`${litres} L in ${month}`}
              />
            </div>
            <span className="mt-1 text-[10px] text-ink-500">{month.split('-')[1]}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return <LoadingBlock label="Loading Vehicle History Dashboard..." rows={4} />;

  return (
    <div>
      <PageHeader
        title="Vehicle History & CRM Dashboard"
        actions={<Badge>Total Vehicles Tracked: {history.length}</Badge>}
      />

      <DemoNotice>
        SAMPLE DATA — this screen is a prototype. The vehicles, litres and sales figures are fixed examples built into
        the page; nothing here is read from the backend yet.
      </DemoNotice>

      {/* One column until there is room for the list beside the details (the sidebar takes ~250px from md up). */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* Vehicle List */}
        <Card className="overflow-hidden">
          <CardHeader title="Vehicles" />
          <div className="max-h-[600px] overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Litres</th>
                  <th>Mileage</th>
                </tr>
              </thead>
              <tbody>
                {history.map((v) => {
                  const selected = selectedVehicle?.vehicleNumber === v.vehicleNumber;
                  return (
                    <tr
                      key={v.vehicleNumber}
                      className={cn('cursor-pointer', selected && '!bg-accent/10')}
                      onClick={() => handleSelectVehicle(v)}
                    >
                      <td className="whitespace-nowrap">
                        {/* A real button keeps the row selectable from the keyboard; its click bubbles up to the row. */}
                        <button
                          type="button"
                          aria-pressed={selected}
                          className="rounded font-semibold text-ink-100 underline-offset-4 hover:underline"
                        >
                          {v.vehicleNumber}
                        </button>
                      </td>
                      <td className="num whitespace-nowrap">{v.totalLitres} L</td>
                      <td className="num whitespace-nowrap">{v.avgMileage} km/L</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Selected Vehicle Details */}
        <Card>
          <CardHeader
            title={
              selectedVehicle
                ? `Vehicle: ${selectedVehicle.vehicleNumber} | Owner: ${selectedVehicle.customerName}`
                : 'Select a Vehicle'
            }
          />
          {selectedVehicle ? (
            <CardBody className="space-y-6">
              {/* Summary Stats */}
              <div className="flex flex-wrap gap-3">
                <Metric label="Total Litres (12m)" value={<>{selectedVehicle.totalLitres} L</>} />
                <Metric label="Total Sales" value={formatINR(selectedVehicle.totalSales)} valueClassName="text-ok" />
                <Metric label="Avg Mileage" value={<>{selectedVehicle.avgMileage} km/L</>} valueClassName="text-accent" />
              </div>

              {/* Monthly Sales Chart */}
              <div>
                <h3 className="font-display text-sm font-bold text-ink-100">Monthly Sales Trend (Last 12 Months)</h3>
                {renderMonthlyChart(selectedVehicle.monthlySales)}
                <div className="mt-2 flex justify-between text-[10px] text-ink-500">
                  <span>Nov '25</span>
                  <span>Nov '26</span>
                </div>
              </div>

              {/* Loyalty Points Integration */}
              <div className="rounded-xl border border-accent/25 bg-accent/8 p-4">
                <h3 className="mb-2 font-display text-sm font-bold text-accent">Loyalty Points Summary</h3>
                <p className="text-sm text-ink-200">
                  Total Points Earned: <span className="font-bold text-ink-100">{selectedVehicle.fuelPointsEarned} pts</span>
                </p>
                <p className="mt-1 text-sm text-ink-200">
                  Redemption Eligibility: <Badge tone="success">Active</Badge>
                </p>
              </div>
            </CardBody>
          ) : (
            <div className="grid h-64 place-items-center px-6 text-center text-sm text-ink-400">
              Select a vehicle from the list to view 12-month history and loyalty points.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
