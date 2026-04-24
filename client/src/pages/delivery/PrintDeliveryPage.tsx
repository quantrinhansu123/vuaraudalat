import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import { useDeliveryOrders } from '../../hooks/queries/useDelivery';
import { useVehicles } from '../../hooks/queries/useVehicles';
import type { DeliveryOrder, Vehicle } from '../../types';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { isSoftDeletedSourceOrder } from '../../utils/softDeletedOrder';
import { deliveryTimeToInputValue } from '../../lib/deliveryDisplay';

const getDisplayProductName = (order: DeliveryOrder) =>
  order.product_name.includes(' - ') ? order.product_name.split(' - ').slice(1).join(' - ') : order.product_name;

const getReceiverDisplayName = (order: DeliveryOrder) => {
  const orderObj = order.import_orders;
  return orderObj?.customers?.name || orderObj?.receiver_name?.trim() || orderObj?.profiles?.full_name || '-';
};

const vehicleSupportsGoodsCategory = (vehicle: Vehicle, category: 'grocery' | 'vegetable') => {
  if (!vehicle.goods_categories || vehicle.goods_categories.length === 0) return true;
  return vehicle.goods_categories.includes(category);
};

const PrintDeliveryPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialDateFrom = searchParams.get('dateFrom') || format(new Date(), 'yyyy-MM-dd');
  const initialDateTo = searchParams.get('dateTo') || format(new Date(), 'yyyy-MM-dd');

  const [startDate, setStartDate] = useState<string>(initialDateFrom);
  const [endDate, setEndDate] = useState<string>(initialDateTo);

  const { data: ordersRaw, isLoading, isError, refetch } = useDeliveryOrders(startDate, endDate, 'standard');
  const { data: vehicles } = useVehicles();

  const orders = React.useMemo(() => {
    return (ordersRaw || []).filter((o) => !isSoftDeletedSourceOrder(o));
  }, [ordersRaw]);

  const eligibleVehicles = React.useMemo(
    () => (vehicles || []).filter((vehicle) => vehicleSupportsGoodsCategory(vehicle, 'grocery')),
    [vehicles]
  );

  let filteredOrders = orders || [];
  filteredOrders.sort((a, b) => getReceiverDisplayName(a).localeCompare(getReceiverDisplayName(b), 'vi'));

  const groupedOrders = (filteredOrders || []).reduce<Record<string, DeliveryOrder[]>>((acc, order) => {
    const date = order.delivery_date || 'N/A';
    if (!acc[date]) acc[date] = [];
    acc[date].push(order);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedOrders).sort((a, b) => b.localeCompare(a)); // Newest first

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <style>{`
        @media print {
          body { 
            counter-reset: page; 
          }
          
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%; 
            display: block !important; 
          }
          .no-print { display: none !important; }
          
          .print-section {
            page-break-before: always;
          }
          .print-section:first-child {
            page-break-before: auto;
          }

          @page { 
            size: A4 portrait; 
            margin: 15mm 10mm 10mm 10mm;
          }

          .page-number-auto::after {
            counter-increment: page;
            content: "Tờ: " counter(page);
            position: fixed;
            top: 2mm;
            right: 15mm;
            font-size: 16px;
            font-weight: bold;
            visibility: visible !important;
          }

          .print-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            font-family: "Times New Roman", serif;
            font-size: 11px;
            page-break-inside: auto;
          }
          .print-table thead { display: table-header-group; }
          .print-table tr { page-break-inside: avoid; page-break-after: auto; }
          
          .print-table th, .print-table td {
            border: 1px solid #000 !important;
            padding: 4px 3px !important;
            overflow: hidden;
            word-break: break-word;
          }
          .print-table th { font-weight: bold; text-align: center; background-color: #f3f4f6 !important; }
          .print-table .col-name { width: 17%; }
          .print-table .col-qty { width: 2%; }
          .print-table .col-product { width: 10%; }
          
          .print-header-repeat {
            border: none !important;
          }
          .print-header-repeat th {
            border: none !important;
            background: transparent !important;
            padding-bottom: 10px !important;
          }

          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }

        @media screen {
          .print-sheet {
            max-width: 210mm;
            margin: 0 auto 24px auto;
            padding: 10mm 12mm;
            background: white;
            box-shadow: 0 2px 16px rgba(0,0,0,0.08);
            border: 1px solid #e5e7eb;
            border-radius: 8px;
          }
          .page-number-auto::after {
            content: "Số tờ sẽ tự động hiển thị khi in";
            display: block;
            text-align: right;
            font-size: 12px;
            color: #6b7280;
            margin-bottom: 8px;
          }
        }
        
        .print-table { width: 100%; border-collapse: collapse; font-family: "Times New Roman", serif; font-size: 14px; }
        .print-table th, .print-table td { border: 1px solid #000 !important; padding: 4px 6px !important; }
        .print-table th { font-weight: bold; text-align: center; }
      `}</style>

      <div className="no-print animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-[18px] font-black text-foreground">In Phiếu Giao Hàng</h1>
            <p className="text-[12px] text-muted-foreground">Hàng tạp hóa</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border shadow-sm p-4 mb-6 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Thời gian giao</label>
            <DateRangePicker
              initialDateFrom={startDate}
              initialDateTo={endDate}
              onUpdate={(values) => {
                if (values.range.from) setStartDate(format(values.range.from, 'yyyy-MM-dd'));
                else setStartDate('');
                if (values.range.to) setEndDate(format(values.range.to, 'yyyy-MM-dd'));
                else setEndDate('');
              }}
            />
          </div>

          <button
            onClick={handlePrint}
            disabled={filteredOrders.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
          >
            <Printer size={16} />
            In ({filteredOrders.length} dòng)
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="no-print p-4">
          <LoadingSkeleton rows={10} columns={6} />
        </div>
      ) : isError ? (
        <div className="no-print">
          <ErrorState onRetry={() => refetch()} />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="no-print">
          <EmptyState
            title="Không có dữ liệu"
            description="Không có đơn giao hàng tạp hóa trong khoảng thời gian này"
          />
        </div>
      ) : (
        <div className="print-area page-number-auto">
          {sortedDates.map((date) => (
            <div key={date} className="print-section print-sheet">
              <table className="print-table">
                <thead>
                  <tr className="print-header-repeat">
                    <th colSpan={4} className="text-left">
                      <div className="text-[16px] font-bold">Ngày giao: {new Date(date).toLocaleDateString('vi-VN')}</div>
                    </th>
                    <th colSpan={eligibleVehicles.length || 10} className="text-right">
                      {/* Page number handled by fixed position */}
                    </th>
                  </tr>
                  <tr>
                    <th className="col-name text-left border border-black align-middle">Tên Khách</th>
                    <th className="col-qty border border-black align-middle text-center">SL</th>
                    <th className="border border-black align-middle text-center text-[10px] whitespace-nowrap">Giờ giao</th>
                    <th className="col-product text-left border border-black align-middle">Hàng</th>
                    {eligibleVehicles.map(v => (
                      <th key={v.id} className="text-center border border-black text-[10px] whitespace-nowrap tracking-tighter uppercase">
                        {v.license_plate}
                      </th>
                    ))}
                    {eligibleVehicles.length === 0 && ['1', '2', '3', '4', '5', '6', '7', '8', 'ba', 'kho'].map(col => (
                      <th key={col} className="text-center border border-black text-[10px] whitespace-nowrap tracking-tighter uppercase">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupedOrders[date].map(o => (
                    <tr key={o.id}>
                      <td className="text-left font-medium border border-black">{getReceiverDisplayName(o)}</td>
                      <td className="text-center font-bold border border-black">{o.total_quantity || ''}</td>
                      <td className="text-center border border-black tabular-nums">{deliveryTimeToInputValue(o.delivery_time) || ''}</td>
                      <td className="text-left border border-black">{getDisplayProductName(o)}</td>
                      {eligibleVehicles.map(v => {
                        const dv = (o.delivery_vehicles || []).find(deliveryVehicle => deliveryVehicle.vehicle_id === v.id);
                        const qty = dv?.assigned_quantity || 0;
                        return (
                          <td key={v.id} className="text-center font-bold border border-black" style={{ color: '#dc2626' }}>
                            {qty > 0 ? qty : ''}
                          </td>
                        );
                      })}
                      {eligibleVehicles.length === 0 && ['1', '2', '3', '4', '5', '6', '7', '8', 'ba', 'kho'].map(col => {
                        const matches = (o.delivery_vehicles || []).filter(dv => {
                          const plate = (dv.vehicles?.license_plate || '').toLowerCase();
                          if (col === 'ba') return plate.includes('ba');
                          if (col === 'kho') return plate.includes('kho');
                          return plate.includes(col);
                        });
                        const qty = matches.reduce((sum, dv) => sum + (dv.assigned_quantity || 0), 0);
                        return (
                          <td key={col} className="text-center font-bold border border-black" style={{ color: '#dc2626' }}>
                            {qty > 0 ? qty : ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default PrintDeliveryPage;
