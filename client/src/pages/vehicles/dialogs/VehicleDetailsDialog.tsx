import React from 'react';
import { createPortal } from 'react-dom';
import { X, Car, User, Package, MapPin, Navigation, Edit2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useVehicleAssignments, useVehicleCheckins } from '../../../hooks/queries/useVehicles';
import type { Vehicle } from '../../../types';
import LoadingSkeleton from '../../../components/shared/LoadingSkeleton';
import { formatNgayGioGiaoVI } from '../../../lib/deliveryDisplay';

interface Props {
  vehicle: Vehicle | null;
  isOpen: boolean;
  isClosing: boolean;
  onClose: () => void;
  onEdit?: (vehicle: Vehicle) => void;
}

const VehicleDetailsDialog: React.FC<Props> = ({ vehicle, isOpen, isClosing, onClose, onEdit }) => {
  const { data: assignments, isLoading: assignmentsLoading } = useVehicleAssignments(vehicle?.id);
  const { data: checkins, isLoading: checkinsLoading } = useVehicleCheckins(vehicle?.id || '');

  if (!isOpen && !isClosing) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-350 ease-out',
          isClosing ? 'opacity-0' : 'animate-in fade-in duration-300',
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={clsx(
          'relative w-full max-w-[550px] bg-background shadow-2xl flex flex-col h-screen border-l border-border',
          isClosing ? 'dialog-slide-out' : 'dialog-slide-in',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 bg-card border-b border-border shrink-0">
          <div className="flex items-center gap-4">
            <div className={clsx(
              "w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg",
              vehicle?.status === 'available' ? 'bg-emerald-500 shadow-emerald-200' :
              vehicle?.status === 'in_transit' ? 'bg-blue-500 shadow-blue-200' : 'bg-orange-500 shadow-orange-200'
            )}>
              <Car size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-foreground tracking-tight">{vehicle?.license_plate}</h2>
              <p className="text-[13px] text-muted-foreground font-medium uppercase tracking-wider">{vehicle?.vehicle_type || 'Phương tiện'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground transition-all"
          >
            <X size={22} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Driver Info */}
          <div className="bg-card rounded-3xl border border-border shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <User size={18} className="text-primary" />
              <h3 className="text-[14px] font-extrabold text-foreground uppercase tracking-tight">Tài xế hiện tại</h3>
            </div>
            {vehicle?.profiles ? (
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center text-lg font-bold text-foreground">
                  {vehicle.profiles.full_name?.charAt(0)}
                </div>
                <div>
                  <p className="text-[15px] font-bold text-foreground">{vehicle.profiles.full_name}</p>
                  <p className="text-[13px] text-muted-foreground">Đang trực tiếp vận hành</p>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground italic">Chưa có tài xế phụ trách</p>
            )}
          </div>

          {/* Current Orders Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-primary" />
                <h3 className="text-[14px] font-extrabold text-foreground uppercase tracking-tight">Đơn hàng đang chở</h3>
              </div>
              <span className="text-[12px] font-bold px-2 py-0.5 bg-muted text-muted-foreground rounded-full">
                {assignments?.length || 0}
              </span>
            </div>

            {assignmentsLoading ? (
              <LoadingSkeleton type="card" rows={2} />
            ) : !assignments?.length ? (
              <div className="bg-card rounded-3xl border border-dashed border-border p-10 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground/40">
                  <Package size={32} />
                </div>
                <p className="text-[14px] text-muted-foreground font-medium">Hiện tại xe không có đơn hàng nào</p>
                <p className="text-[12px] text-muted-foreground/60 mt-1">Thông tin sẽ hiển thị khi xe được gán đơn hàng mới</p>
              </div>
            ) : (
              <div className="space-y-3">
                {assignments.map((assignment: any) => (
                  <div key={assignment.id} className="bg-card rounded-3xl border border-border shadow-sm p-5 hover:border-primary/30 transition-all group">
                    <div className="flex items-start justify-between mb-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-black text-primary px-2 py-0.5 bg-primary/5 rounded-md">
                            {assignment.delivery_orders?.import_orders?.order_code}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-medium">• {new Date(assignment.assigned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <h4 className="text-[15px] font-extrabold text-foreground group-hover:text-primary transition-colors">
                          {assignment.delivery_orders?.product_name}
                        </h4>
                      </div>
                      <div className="text-right">
                        <p className="text-[16px] font-black text-emerald-600">{assignment.assigned_quantity}</p>
                        <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest">Số lượng</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                      <div className="flex items-start gap-2">
                        <User size={14} className="mt-0.5 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest leading-none mb-1">Khách hàng</p>
                          <p className="text-[13px] text-foreground font-semibold truncate">
                            {assignment.delivery_orders?.import_orders?.customers?.name || assignment.delivery_orders?.import_orders?.receiver_name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin size={14} className="mt-0.5 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest leading-none mb-1">Ngày giờ giao</p>
                          <p className="text-[13px] text-foreground font-semibold truncate" title={assignment.delivery_orders?.delivery_date ? formatNgayGioGiaoVI(assignment.delivery_orders.delivery_date, assignment.delivery_orders.delivery_time) : undefined}>
                            {assignment.delivery_orders?.delivery_date
                              ? formatNgayGioGiaoVI(assignment.delivery_orders.delivery_date, assignment.delivery_orders.delivery_time)
                              : 'Hôm nay'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Location History Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <MapPin size={18} className="text-primary" />
                <h3 className="text-[14px] font-extrabold text-foreground uppercase tracking-tight">Lịch sử di chuyển</h3>
              </div>
            </div>

            {checkinsLoading ? (
              <LoadingSkeleton type="card" rows={1} />
            ) : !checkins?.length ? (
              <div className="bg-card rounded-3xl border border-dashed border-border p-8 flex flex-col items-center justify-center text-center">
                <p className="text-[13px] text-muted-foreground italic">Chưa có dữ liệu vị trí GPS</p>
              </div>
            ) : (
              <div className="space-y-3">
                {checkins.slice(0, 3).map((c: any) => (
                  <div key={c.id} className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={clsx(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                        c.checkin_type === 'in' ? 'bg-blue-50 text-blue-500' : 'bg-orange-50 text-orange-500'
                      )}>
                        {c.checkin_type === 'in' ? <Car size={14} /> : <Navigation size={14} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-foreground truncate">
                          {c.checkin_type === 'in' ? 'Bắt đầu' : 'Kết thúc'} • {new Date(c.checkin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {new Date(c.checkin_time).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                    </div>
                    <a 
                      href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-xl transition-all shrink-0"
                      title="Xem trên bản đồ"
                    >
                      <MapPin size={16} />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-card border-t border-border px-6 py-4 flex items-center justify-end gap-3 shrink-0">
          {onEdit && vehicle && (
            <button
              onClick={() => onEdit(vehicle)}
              className="px-6 py-2.5 rounded-2xl bg-primary/10 hover:bg-primary/20 text-primary text-[13px] font-extrabold transition-all flex items-center gap-2"
            >
              <Edit2 size={16} />
              Chỉnh sửa
            </button>
          )}
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-2xl bg-muted hover:bg-muted/80 text-foreground text-[13px] font-extrabold transition-all"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default VehicleDetailsDialog;
