import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { formatINR, formatLitres, formatDate } from '../lib/format';
import { apiGet } from '../lib/api';
import { useAuth } from '../lib/auth';

// Senior Dev: Vehicle History Dashboard (Petrol Pump CRM)
// Tracks 12-month sales, average mileage, and fuel points per vehicle.

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

export default function VehicleHistoryDashboard() {
  const { me } = useAuth();
  const [history, setHistory] = useState<VehicleHistory[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleHistory | null>(null);
  const [loading, setLoading] = useState(true);

  // Senior Dev: API integration (mocked for now, will use apiGet('/crm/vehicle-history'))
  useEffect(() => {
    // Simulate API call for last 12 months data
    setTimeout(() => {
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
  }, []);

  const handleSelectVehicle = (v: VehicleHistory) => {
    setSelectedVehicle(v);
  };

  // Senior Dev: Helper to render monthly bar chart (simple CSS bars for now)
  const renderMonthlyChart = (monthlySales: Record<string, number>) => {
    const max = Math.max(...Object.values(monthlySales));
    return (
      <div className="grid grid-cols-13 gap-1 mt-4">
        {Object.entries(monthlySales).map(([month, litres]) => (
          <div key={month} className="flex flex-col items-center">
            <div 
              className="w-full bg-orange-500 rounded-t transition-all duration-500" 
              style={{ height: `${(litres / max) * 100}%`, minHeight: '4px' }}
              title={`${litres} L in ${month}`}
            />
            <span className="text-[10px] mt-1 text-muted-foreground">{month.split('-')[1]}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return <div>Loading Vehicle History Dashboard...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Vehicle History & CRM Dashboard</h1>
        <Badge variant="secondary">Total Vehicles Tracked: {history.length}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Vehicle List */}
        <Card className="md:col-span-1">
          <CardHeader>
            <h2 className="text-lg font-semibold">Vehicles</h2>
          </CardHeader>
          <CardContent className="max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Litres</TableHead>
                  <TableHead>Mileage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((v) => (
                  <TableRow key={v.vehicleNumber} className="cursor-pointer hover:bg-muted" onClick={() => handleSelectVehicle(v)}>
                    <TableCell>{v.vehicleNumber}</TableCell>
                    <TableCell>{v.totalLitres} L</TableCell>
                    <TableCell>{v.avgMileage} km/L</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Selected Vehicle Details */}
        <Card className="md:col-span-2">
          <CardHeader>
            <h2 className="text-lg font-semibold">
              {selectedVehicle ? `Vehicle: ${selectedVehicle.vehicleNumber} | Owner: ${selectedVehicle.customerName}` : 'Select a Vehicle'}
            </h2>
          </CardHeader>
          <CardContent>
            {selectedVehicle ? (
              <div className="space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Litres (12m)</p>
                    <p className="text-2xl font-bold">{selectedVehicle.totalLitres} L</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Sales</p>
                    <p className="text-2xl font-bold text-green-500">{formatCurrency(selectedVehicle.totalSales)}</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Avg Mileage</p>
                    <p className="text-2xl font-bold text-orange-500">{selectedVehicle.avgMileage} km/L</p>
                  </div>
                </div>

                {/* Monthly Sales Chart */}
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-2">Monthly Sales Trend (Last 12 Months)</h3>
                  {renderMonthlyChart(selectedVehicle.monthlySales)}
                  <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                    <span>Nov '25</span>
                    <span>Nov '26</span>
                  </div>
                </div>

                {/* Loyalty Points Integration */}
                <div className="mt-8 p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <h3 className="text-lg font-semibold mb-2 text-orange-800">Loyalty Points Summary</h3>
                  <p className="text-sm">Total Points Earned: <span className="font-bold">{selectedVehicle.fuelPointsEarned} pts</span></p>
                  <p className="text-sm mt-1">Redemption Eligibility: <Badge variant="default">Active</Badge></p>
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Select a vehicle from the left to view 12-month history and loyalty points.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
