import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { X, Truck, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useForm, type SubmitHandler, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { useCreateDelivery } from '../../../hooks/queries/useDelivery';
import { useVehicles } from '../../../hooks/queries/useVehicles';
import type { ImportOrder } from '../../../types';
import CurrencyInput from '../../../components/shared/CurrencyInput';

const deliverySchema = z.object({
  import_order_id: z.string(),
  product_name: z.string().min(1, 'Vui lòng nhập tên sản phẩm'),
  total_quantity: z.coerce.number().min(1, 'Số lượng tối thiểu là 1'),
  delivery_date: z.string().min(1, 'Vui lòng chọn ngày giao'),
  delivery_time: z.string().optional(),
  unit_price: z.coerce.number().optional(),
  import_cost: z.coerce.number().optional(),
  payment_method: z.string().optional(),
  vehicles: z.array(z.object({
    vehicle_id: z.string().min(1, 'Vui lòng chọn xe'),
    driver_id: z.string().min(1),
    quantity: z.coerce.number().min(1, 'SL tối thiểu 1'),
  })).optional(),
}).superRefine((data, ctx) => {
  if (data.vehicles && data.vehicles.length > 0) {
    const totalAssigned = data.vehicles.reduce((sum, v) => sum + v.quantity, 0);
    if (totalAssigned > data.total_quantity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Tổng SL gán (${totalAssigned}) vượt quá SL trong đơn (${data.total_quantity})`,
        path: ['vehicles'],
      });
    }
  }
});

interface DeliveryVehicleRow {
  vehicle_id: string;
  driver_id: string;
  quantity: number;
}

interface DeliveryFormData {
  import_order_id: string;
  product_name: string;
  total_quantity: number;
  delivery_date: string;
  delivery_time?: string;
  unit_price?: number;
  import_cost?: number;
  payment_method?: string;
  vehicles?: DeliveryVehicleRow[];
}

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  importOrder: ImportOrder | null;
  onClose: () => void;
}

const CreateDeliveryDialog: React.FC<Props> = ({ isOpen, isClosing, importOrder, onClose }) => {
  const createMutation = useCreateDelivery();
  const { data: vehiclesData } = useVehicles(isOpen);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<DeliveryFormData>({
    resolver: zodResolver(deliverySchema) as any,
    defaultValues: {
      vehicles: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "vehicles"
  });

  useEffect(() => {
    if (importOrder) {
      const firstItem = importOrder.import_order_items?.[0];
      reset({
        import_order_id: importOrder.id,
        product_name: (firstItem?.products?.name || firstItem?.package_type) || 'Kiện',
        total_quantity: firstItem?.quantity || importOrder.quantity || 0,
        delivery_date: format(new Date(), 'yyyy-MM-dd'),
        delivery_time: '',
        import_cost: firstItem?.unit_price || importOrder.unit_price || 0,
        unit_price: firstItem?.unit_price || importOrder.unit_price || 0,
        payment_method: 'Tiền mặt',
        vehicles: []
      });
    }
  }, [importOrder, reset]);

  const onSubmit: SubmitHandler<DeliveryFormData> = async (data) => {
    try {
      const delivery_time = (data.delivery_time || '').trim();
      await createMutation.mutateAsync({
        ...data,
        delivery_time: delivery_time || undefined,
      });
      onClose();
      navigate('/hang-hoa/giao-hang');
    } catch {
      // Error handled by mutation
    }
  };

  if (!isOpen && !isClosing) return null;

  const isSubmitting = createMutation.isPending;

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
          'relative w-full max-w-[500px] bg-background shadow-2xl flex flex-col h-screen border-l border-border',
          isClosing ? 'dialog-slide-out' : 'dialog-slide-in',
        )}
      >
        {/* Header  */}
        <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-600">
              <Truck size={20} />
            </div>
            <h2 className="text-lg font-bold text-foreground">
              Tạo đơn giao hàng
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-foreground">Ngày giao</label>
                <input
                  type="date"
                  {...register('delivery_date')}
                  className="w-full px-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                />
                {errors.delivery_date && (
                  <p className="text-red-500 text-[11px] font-bold">{errors.delivery_date.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-foreground">Giờ giao</label>
                <input
                  type="time"
                  step={60}
                  {...register('delivery_time')}
                  className="w-full px-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-orange-600">
                <Truck size={16} />
                <span className="text-[12px] font-bold uppercase tracking-wide">Ghép xe vận chuyển</span>
              </div>
              <button
                type="button"
                onClick={() => append({ vehicle_id: '', driver_id: '', quantity: 0 })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors text-[11px] font-bold"
              >
                <Plus size={14} />
                Thêm xe
              </button>
            </div>

            {fields.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-border rounded-xl">
                <p className="text-[12px] text-muted-foreground">Chưa gán xe nào cho đơn này</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="p-3 bg-muted/5 border border-border rounded-xl space-y-3 relative group">
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="absolute top-2 right-2 p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>

                    <div className="grid grid-cols-12 gap-3 pr-8">
                      <div className="col-span-12 sm:col-span-7 space-y-1">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase opacity-70">Chọn xe</label>
                        <select
                          {...register(`vehicles.${index}.vehicle_id` as const)}
                          className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-medium"
                          onChange={(e) => {
                            const vehicleId = e.target.value;
                            register(`vehicles.${index}.vehicle_id` as const).onChange(e); // Maintain hook-form state
                            const vehicle = vehiclesData?.find(v => v.id === vehicleId);
                            if (vehicle) {
                              setValue(`vehicles.${index}.driver_id`, vehicle.driver_id || 'unassigned');
                            }
                          }}
                        >
                          <option value="">-- Chọn xe --</option>
                          {vehiclesData?.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.license_plate} ({v.profiles?.full_name || 'Chưa có tài'})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-12 sm:col-span-5 space-y-1">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase opacity-70">Số lượng</label>
                        <input
                          type="number"
                          {...register(`vehicles.${index}.quantity` as const)}
                          className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-bold tabular-nums"
                          placeholder="SL"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {errors.vehicles && (
                  <p className="text-red-500 text-[11px] font-bold mt-2 px-1">
                    {(errors.vehicles as any).message}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2 text-emerald-600">
              <span className="text-[12px] font-bold uppercase tracking-wider">Thông tin tài chính (Tùy chọn)</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-foreground">Loại thanh toán</label>
                <Controller
                  name="payment_method"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      value={field.value || ''}
                      onChange={field.onChange}
                      className="w-full px-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-medium"
                    >
                      <option value="">-- Chọn loại --</option>
                      <option value="Tiền mặt">Tiền mặt</option>
                      <option value="Chuyển khoản">Chuyển khoản</option>
                      <option value="Thanh toán sau">Thanh toán sau (Nợ)</option>
                    </select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-foreground">Số tiền thanh toán</label>
                <Controller
                  name="unit_price"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput
                      {...field}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="0"
                      className="w-full px-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all tabular-nums"
                    />
                  )}
                />
              </div>
            </div>
          </div>

          <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100">
            <p className="text-[12px] text-orange-700 leading-relaxed">
              <strong>Lưu ý:</strong> Sau khi tạo đơn giao hàng, bạn có thể gán thêm xe hoặc cập nhật số lượng giao tại trang <strong>Hàng cần giao</strong>.
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="bg-card border-t border-border px-6 py-4 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-xl border border-border hover:bg-muted text-foreground text-[13px] font-bold transition-all"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className={clsx(
              'flex items-center gap-2 px-8 py-2 rounded-xl text-[13px] font-bold shadow-lg transition-all group',
              isSubmitting
                ? 'bg-orange-500/50 text-white/60 cursor-wait'
                : 'bg-orange-500 text-white hover:bg-orange-600 shadow-orange-500/20',
            )}
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Đang tạo...
              </>
            ) : (
              <>
                <Truck size={18} />
                Tạo đơn giao
                <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CreateDeliveryDialog;
