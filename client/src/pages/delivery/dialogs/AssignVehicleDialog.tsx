import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Truck, Package, User, AlertCircle, Trash2, CheckCircle, ImagePlus, Loader2, Camera } from 'lucide-react';
import { clsx } from 'clsx';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAssignVehicle } from '../../../hooks/queries/useDelivery';
import { useVehicles } from '../../../hooks/queries/useVehicles';
import { useEmployees } from '../../../hooks/queries/useHR';
import type { DeliveryOrder } from '../../../types';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { useAuth } from '../../../context/AuthContext';
import { uploadApi } from '../../../api/uploadApi';
import toast from 'react-hot-toast';
import type { Vehicle } from '../../../types';
import VnUnitPriceInput from '../../../components/shared/VnUnitPriceInput';
import CurrencyInput from '../../../components/shared/CurrencyInput';

const assignmentSchema = z.object({
  vehicle_id: z.string().min(1, 'Vui lòng chọn xe'),
  driver_id: z.string().min(1, 'Vui lòng chọn tài xế'),
  loader_name: z.string().optional().nullable(),
  unit_price: z.coerce.number().min(0).optional().default(0),
  /** SL giao thêm (incremental); khi lưu sẽ cộng với SL đã gán cho xe. */
  quantity: z.coerce.number().min(0, 'SL không được âm'),
  expected_amount: z.coerce.number().min(0).optional().default(0),
  /** Ảnh gắn với xe dòng này (phiếu thu / chứng từ theo xe); khi lưu gộp vào image_urls đơn. */
  image_urls: z.array(z.string()).default([]),
});

const schema = z.object({
  assignments: z.array(assignmentSchema).min(1, 'Cần ít nhất một sự phân bổ'),
  image_urls: z.array(z.string()).default([]),
  export_payment_status: z.enum(['unpaid', 'paid']).default('unpaid'),
});

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FormValues = z.infer<typeof schema>;

function mergeDeliveryImageUrls(global: string[], assignments: { image_urls?: string[] }[]): string[] {
  const fromRows = assignments.flatMap((a) => a.image_urls || []);
  return [...new Set([...(global || []), ...fromRows])];
}

function removeImageUrlFromForm(getValues: () => FormValues, setValue: (n: keyof FormValues | any, v: any, o?: any) => void, url: string) {
  const data = getValues();
  setValue(
    'image_urls',
    (data.image_urls || []).filter((u) => u !== url),
    { shouldValidate: true },
  );
  (data.assignments || []).forEach((_, i) => {
    const rowUrls = data.assignments[i]?.image_urls || [];
    if (rowUrls.includes(url)) {
      setValue(
        `assignments.${i}.image_urls`,
        rowUrls.filter((u) => u !== url),
        { shouldValidate: true },
      );
    }
  });
}

const vehicleSupportsGoodsCategory = (vehicle: Vehicle, category: 'grocery' | 'vegetable') => {
  if (!vehicle.goods_categories || vehicle.goods_categories.length === 0) return true;
  return vehicle.goods_categories.includes(category);
};

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  order: DeliveryOrder | null;
  initialVehicleId?: string | null;
  allOrders?: DeliveryOrder[];
  onClose: () => void;
}

const EMPTY_ARRAY: DeliveryOrder[] = [];

const AssignVehicleDialog: React.FC<Props> = ({ isOpen, isClosing, order, initialVehicleId, allOrders = EMPTY_ARRAY, onClose }) => {
  const { data: vehicles } = useVehicles(isOpen);
  const { data: employees } = useEmployees(isOpen);
  const assignMutation = useAssignVehicle();
  const { user } = useAuth();

  const normalizedRole = (user?.role || '').toLowerCase();
  const isLoader = normalizedRole.includes('lo_xe') || normalizedRole.includes('lơ xe');
  const isDriver = normalizedRole === 'driver' || normalizedRole.includes('tai_xe') || normalizedRole.includes('tài xế') || normalizedRole.includes('driver') || isLoader;
  
  const myEmployee = React.useMemo(() => {
    if (!user) return null;
    return (employees || []).find(e => e.id === user.id || (user.full_name && e.full_name === user.full_name));
  }, [employees, user]);
  
  const myEmployeeId = myEmployee?.id || user?.id;

  const myVehicle = React.useMemo(() => {
    if (!myEmployeeId && !user?.full_name) return undefined;
    const allVehs = vehicles || [];
    return allVehs.find(v => 
      v.driver_id === myEmployeeId || 
      v.in_charge_id === myEmployeeId ||
      (user?.full_name && v.profiles?.full_name === user.full_name) ||
      (user?.full_name && v.responsible_profile?.full_name === user.full_name)
    );
  }, [vehicles, myEmployeeId, user?.full_name]);

  const targetCategory = (order?.order_category ?? 'standard') === 'vegetable' ? 'vegetable' : 'grocery';
  const eligibleVehicles = React.useMemo(
    () => {
      let filtered = (vehicles || []).filter((vehicle) => vehicleSupportsGoodsCategory(vehicle, targetCategory));
      
      if (isDriver && myVehicle) {
        filtered = filtered.filter(v => v.id === myVehicle.id);
      }
      
      return filtered;
    },
    [vehicles, targetCategory, isDriver, myVehicle]
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    reset,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      assignments: [],
      image_urls: [],
      export_payment_status: 'unpaid',
    },
  });

  const { fields, remove } = useFieldArray({
    control,
    name: 'assignments',
  });

  /** SL đã lưu cho từng dòng xe khi mở form; cột «SL giao thêm» = nhập phần nốt. */
  const [assignmentBaselines, setAssignmentBaselines] = useState<number[]>([]);

  const watchAssignments = watch('assignments') || [];
  const watchImageUrls = watch('image_urls') || [];
  const allMergedImageUrls = React.useMemo(
    () => mergeDeliveryImageUrls(watchImageUrls, watchAssignments),
    [watchImageUrls, watchAssignments],
  );
  const watchExportPaymentStatus = watch('export_payment_status');
  const projectedAssignedTotal = React.useMemo(
    () =>
      watchAssignments.reduce((acc, row, i) => {
        const b = assignmentBaselines[i] ?? 0;
        const d = Number(row.quantity) || 0;
        return acc + b + d;
      }, 0),
    [watchAssignments, assignmentBaselines],
  );
  const currentAvailable = order ? Math.max(0, order.total_quantity - projectedAssignedTotal) : 0;

  const removeAssignmentRow = (index: number) => {
    remove(index);
    setAssignmentBaselines((prev) => prev.filter((_, i) => i !== index));
  };
  const isStandardOrder = (order?.order_category ?? 'standard') === 'standard';
  /** Phiếu nhập tạp hóa đã trả tại SG — không thu lại trên đơn giao. */
  const importPaid = isStandardOrder && order?.import_orders?.payment_status === 'paid';

  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  /** 'global' = ảnh chung đơn; số = chỉ số dòng xe nhận ảnh vừa tải */
  const imageUploadTargetRef = useRef<'global' | number>('global');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      toast.error('Chỉ hỗ trợ file ảnh');
      return;
    }

    const target = imageUploadTargetRef.current;

    try {
      setIsUploading(true);
      const uploadPromises = files.map(file => 
        uploadApi.uploadFile(file, 'import-orders', 'delivery-orders')
      );
      
      const responses = await Promise.all(uploadPromises);
      const newUrls = responses.map(r => r.url);

      if (target === 'global') {
        const currentUrls = getValues('image_urls') || [];
        setValue('image_urls', [...currentUrls, ...newUrls], { shouldValidate: true });
      } else {
        const cur = (getValues(`assignments.${target}.image_urls` as any) || []) as string[];
        setValue(`assignments.${target}.image_urls` as any, [...cur, ...newUrls], { shouldValidate: true });
      }
      toast.success(`Đã tải lên ${newUrls.length} ảnh thành công!`);
    } catch (error) {
      console.error('File upload error:', error);
      toast.error('Lỗi khi tải ảnh lên');
    } finally {
      setIsUploading(false);
      imageUploadTargetRef.current = 'global';
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (order && isOpen) {
      const importPaidReset =
        (order.order_category ?? 'standard') === 'standard' &&
        order.import_orders?.payment_status === 'paid';

      let defaultUnitPrice = Number(order.unit_price) || 0;
      if (!defaultUnitPrice && allOrders.length > 0) {
        const orderReceiverName = order.import_orders?.customers?.name || order.import_orders?.receiver_name?.trim() || order.import_orders?.profiles?.full_name || '';
        const sameDayOrders = allOrders.filter(o => {
          if (o.id === order.id) return false;
          if (o.delivery_date !== order.delivery_date) return false;
          if (o.product_name !== order.product_name) return false;
          const oReceiverName = o.import_orders?.customers?.name || o.import_orders?.receiver_name?.trim() || o.import_orders?.profiles?.full_name || '';
          if (oReceiverName !== orderReceiverName) return false;
          if (!o.delivery_vehicles || o.delivery_vehicles.length === 0) return false;
          if (!o.unit_price || o.unit_price <= 0) return false;
          return true;
        });
        if (sameDayOrders.length > 0) {
          defaultUnitPrice = Number(sameDayOrders[0].unit_price) || 0;
        }
      }

      const existingDvs = order.delivery_vehicles || [];
      const initialAssignments: any[] = [];
      const baselines: number[] = [];

      if (existingDvs.length > 0) {
        existingDvs.forEach((dv: any) => {
          const vid = dv.vehicle_id;
          const persistedQty = Number(dv.assigned_quantity) || 0;
          baselines.push(persistedQty);
          const rowImageUrls: string[] = [];
          if (Array.isArray(dv.image_urls)) {
            for (const u of dv.image_urls) {
              if (u && typeof u === 'string' && !rowImageUrls.includes(u)) rowImageUrls.push(u);
            }
          }
          for (const pc of order.payment_collections || []) {
            if (pc.vehicle_id === vid && pc.image_url && !rowImageUrls.includes(pc.image_url)) {
              rowImageUrls.push(pc.image_url);
            }
          }
          initialAssignments.push({
            vehicle_id: dv.vehicle_id,
            driver_id: dv.driver_id || '',
            loader_name: dv.loader_name || '',
            unit_price: defaultUnitPrice,
            quantity: '',
            expected_amount: importPaidReset
              ? 0
              : dv.expected_amount || (persistedQty * defaultUnitPrice),
            image_urls: rowImageUrls,
          });
        });
      }

      let initialVid = initialVehicleId || '';
      if (isDriver) {
        initialVid = initialVid || myVehicle?.id || '';
      }

      if (initialVid && !initialAssignments.some(a => a.vehicle_id === initialVid)) {
        const vehicle = eligibleVehicles.find(v => v.id === initialVid);
        const alreadyAssignedSum = baselines.reduce((sum, b) => sum + b, 0);
        const remainingForThis = Math.max(0, order.total_quantity - alreadyAssignedSum);

        baselines.push(0);
        initialAssignments.push({
          vehicle_id: initialVid,
          driver_id: vehicle?.driver_id || vehicle?.in_charge_id || (isDriver ? myEmployeeId : ''),
          loader_name: '',
          unit_price: defaultUnitPrice,
          quantity: remainingForThis,
          expected_amount: importPaidReset ? 0 : remainingForThis * defaultUnitPrice,
          image_urls: [],
        });
      }

      if (initialAssignments.length === 0) {
        baselines.push(0);
        initialAssignments.push({
          vehicle_id: isDriver ? (initialVid || '') : '',
          driver_id: isDriver ? (myEmployeeId || '') : '',
          loader_name: '',
          unit_price: defaultUnitPrice,
          quantity: '',
          expected_amount: 0,
          image_urls: [],
        });
      }

      if (isDriver && initialVid && myEmployeeId) {
        initialAssignments.forEach((assignment) => {
          if (assignment.vehicle_id === initialVid) {
            assignment.driver_id = myEmployeeId;
          }
        });
      }

      if (importPaidReset) {
        initialAssignments.forEach((a) => {
          a.expected_amount = 0;
        });
      }

      const existingAssignedVehicleIds = initialAssignments
        .map((assignment, i) => {
          const final = (baselines[i] ?? 0) + (Number(assignment.quantity) || 0);
          return final > 0 ? assignment.vehicle_id : null;
        })
        .filter(Boolean);

      const paidVehicleIds = new Set(
        (order.payment_collections || [])
          .filter((pc: any) => pc.status === 'confirmed' || pc.status === 'self_confirmed')
          .map((pc: any) => pc.vehicle_id)
          .filter(Boolean)
      );

      const defaultExportPaymentStatus: 'unpaid' | 'paid' = order.export_order_payment_status
        ? (order.export_order_payment_status === 'paid' ? 'paid' : 'unpaid')
        : (existingAssignedVehicleIds.length > 0 && existingAssignedVehicleIds.every((id) => paidVehicleIds.has(id))
          ? 'paid'
          : 'unpaid');

      const existingImages = (order as any).image_urls || [];
      const legacyImage = (order as any).image_url;
      const orderLevelImageUrls = Array.isArray(existingImages) ? [...existingImages] : [];
      if (legacyImage && !orderLevelImageUrls.includes(legacyImage)) {
        orderLevelImageUrls.push(legacyImage);
      }

      /**
       * Ảnh cũ chỉ lưu ở đơn: nếu DB chưa có image_urls trên delivery_vehicles, suy luận ban đầu.
       * - Một xe: gom hết vào dòng đó.
       * - Nhiều xe: chia vòng từng ảnh cho các dòng (fallback; lưu sau sẽ ghi đúng vào từng xe).
       * Đã có image_urls lưu trên ít nhất một dòng xe → không tự chia, giữ ảnh đơn ở khối chung.
       */
      let formGlobalImageUrls = [...orderLevelImageUrls];
      const rowsWithVehicle = initialAssignments.filter(
        (a: any) => a.vehicle_id && String(a.vehicle_id).trim() !== '',
      );
      const hadStoredRowImages =
        existingDvs.length > 0 &&
        existingDvs.some((dv: any) => Array.isArray(dv.image_urls) && dv.image_urls.length > 0);

      if (formGlobalImageUrls.length > 0 && rowsWithVehicle.length > 0 && !hadStoredRowImages) {
        if (rowsWithVehicle.length === 1) {
          const target = rowsWithVehicle[0] as { image_urls: string[] };
          for (const url of formGlobalImageUrls) {
            if (url && !target.image_urls.includes(url)) {
              target.image_urls.push(url);
            }
          }
          formGlobalImageUrls = [];
        } else {
          formGlobalImageUrls.forEach((url, i) => {
            if (!url) return;
            const row = rowsWithVehicle[i % rowsWithVehicle.length] as { image_urls: string[] };
            if (!row.image_urls.includes(url)) row.image_urls.push(url);
          });
          formGlobalImageUrls = [];
        }
      }

      setAssignmentBaselines(baselines);
      reset({
        assignments: initialAssignments,
        image_urls: formGlobalImageUrls,
        export_payment_status: defaultExportPaymentStatus,
      });
    }
  }, [order, initialVehicleId, isOpen, reset, eligibleVehicles, isDriver, myVehicle, myEmployeeId, allOrders]);

  if (!isOpen && !isClosing) return null;

  const onSubmit = async (data: FormValues) => {
    if (!order) return;
    if (assignmentBaselines.length !== data.assignments.length) {
      toast.error('Lỗi đồng bộ form. Đóng hộp thoại và mở lại.');
      return;
    }
    try {
      const sumFinal = data.assignments.reduce(
        (s, a, i) => s + (assignmentBaselines[i] ?? 0) + (Number(a.quantity) || 0),
        0,
      );
      if (sumFinal > order.total_quantity) {
        toast.error(`Tổng SL phân cho xe (${sumFinal}) không được vượt quá SL đơn (${order.total_quantity}).`);
        return;
      }

      for (let i = 0; i < data.assignments.length; i++) {
        const finalQty = (assignmentBaselines[i] ?? 0) + (Number(data.assignments[i].quantity) || 0);
        if (finalQty <= 0) {
          toast.error('Mỗi dòng xe cần có tổng SL > 0 (đã gán trước đó + SL giao thêm).');
          return;
        }
      }

      const normalizedAssignments = data.assignments
        .map((assignment, index) => {
          const vehicle = eligibleVehicles.find((v) => v.id === assignment.vehicle_id);
          const resolvedDriverId =
            assignment.driver_id ||
            vehicle?.driver_id ||
            vehicle?.in_charge_id ||
            (isDriver && assignment.vehicle_id === myVehicle?.id ? myEmployeeId || '' : '');

          const rawPrice = Number(assignment.unit_price) || 0;
          const normalizedPrice = rawPrice;
          const baseline = assignmentBaselines[index] ?? 0;
          const delta = Number(assignment.quantity) || 0;
          const finalQty = baseline + delta;
          const normalizedAmount = finalQty * normalizedPrice;
          const srcImportPaid =
            (order.order_category ?? 'standard') === 'standard' &&
            order.import_orders?.payment_status === 'paid';

          return {
            ...assignment,
            quantity: finalQty,
            driver_id: resolvedDriverId,
            unit_price: normalizedPrice,
            expected_amount: srcImportPaid
              ? 0
              : normalizedAmount > 0
                ? normalizedAmount
                : Number(assignment.expected_amount) || 0,
          };
        })
        .filter((assignment) => {
          if (UUID_REGEX.test(assignment.driver_id)) return true;

          if (isDriver && assignment.vehicle_id !== myVehicle?.id) return false;

          return true;
        });

      const hasInvalidDriverId = normalizedAssignments.some(
        (assignment) => !UUID_REGEX.test(assignment.driver_id)
      );

      if (hasInvalidDriverId) {
        toast.error('Có xe chưa có tài xế hợp lệ. Vui lòng chọn tài xế trước khi lưu.');
        return;
      }

      if (normalizedAssignments.length === 0) {
        toast.error('Không có phân bổ hợp lệ để lưu.');
        return;
      }

      const payload: any = {
        assignments: normalizedAssignments,
        export_payment_status: data.export_payment_status,
        unit_price: normalizedAssignments[0]?.unit_price || 0,
      };
      const mergedImageUrls = mergeDeliveryImageUrls(data.image_urls || [], data.assignments);
      if (mergedImageUrls.length > 0) {
        payload.image_urls = mergedImageUrls;
        payload.image_url = mergedImageUrls[0];
      } else {
        payload.image_urls = [];
        payload.image_url = null;
      }

      await assignMutation.mutateAsync({
        id: order.id,
        payload
      });
      onClose();
    } catch {
      // Error handled by mutation toast
    }
  };

  const isSubmitting = assignMutation.isPending;

  return createPortal(
    <div className="fixed inset-0 z-9999 flex items-end sm:items-center justify-center sm:p-4">
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 bg-black/40 backdrop-blur-sm transition-all duration-350 ease-out',
          isClosing ? 'opacity-0' : 'animate-in fade-in duration-300',
        )}
        onClick={onClose}
      />

      {/* Dialog Container */}
      <div
        className={clsx(
          'relative w-full bg-background flex flex-col transition-all duration-350',
          'h-dvh sm:h-auto sm:max-h-[90vh] sm:max-w-200',
          'rounded-none sm:rounded-3xl shadow-2xl',
          isClosing
            ? 'translate-y-full sm:translate-y-0 sm:scale-95 opacity-0'
            : 'animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300'
        )}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-card border-b border-border flex items-center justify-between shrink-0 sm:rounded-t-3xl shadow-sm z-10 pb-safe-top">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600">
              <Truck size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Phân xe cho đơn hàng
              </h2>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                {order?.product_name}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form id="assign-vehicle-form" onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 custom-scrollbar">
          {/* Order Info Summary */}
          <div className="bg-muted/50 rounded-2xl p-4 border border-border flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Tổng cần giao</span>
                <span className="text-lg font-black text-foreground tabular-nums">
                  {order?.total_quantity.toLocaleString()}
                </span>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Còn lại (Chưa phân)</span>
                <span className="text-lg font-black text-orange-600 tabular-nums transition-all">
                  {currentAvailable.toLocaleString()}
                </span>
              </div>
            </div>

            {order?.import_orders?.total_amount != null && (
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Tổng tiền đơn hàng</span>
                <span className="text-[15px] font-black text-emerald-600 tabular-nums">
                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(order.import_orders.total_amount))}
                </span>
              </div>
            )}
            {importPaid && (
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Tình trạng nhập</span>
                <span className="text-[11px] font-black uppercase tracking-wide text-emerald-700 bg-emerald-500/15 border border-emerald-200/60 px-2.5 py-1 rounded-lg">
                  Đã trả
                </span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-foreground uppercase tracking-wider">Danh sách phương tiện</h3>
            </div>

            <div className="flex flex-col gap-3">
              {fields.map((field, index) => {
                const currentVid = watchAssignments[index]?.vehicle_id;
                const isPaid = currentVid
                  ? (order?.payment_collections || []).some((pc: any) => pc.vehicle_id === currentVid && (pc.status === 'confirmed' || pc.status === 'self_confirmed'))
                  : false;

                const isMyVehicleRow = currentVid === myVehicle?.id;
                
                if (isDriver && !isMyVehicleRow && currentVid) {
                  return null;
                }

                const isRowDisabled = isPaid || (isDriver && !isMyVehicleRow);

                return (
                  <div key={field.id} className={clsx("relative flex flex-col md:flex-row gap-4 p-4 bg-card border border-border shadow-sm rounded-xl items-start md:items-end group transition-colors", isPaid ? "opacity-90 bg-muted/50" : "hover:border-primary/30")}>
                    {/* Badge đã thu tiền */}
                    {isPaid && (
                      <div className="absolute -top-3 left-4 bg-green-100 border border-green-200 text-green-700 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 shadow-sm">
                        <CheckCircle size={10} strokeWidth={3} /> Đã thu tiền
                      </div>
                    )}

                    {/* Xe */}
                    <div className="flex-1 w-full space-y-1.5 mt-2 md:mt-0">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                        <Truck size={12} className={isPaid ? "text-green-500" : "text-primary"} /> Chọn xe
                      </label>
                      <SearchableSelect
                        options={eligibleVehicles.map(v => ({
                          value: v.id,
                          label: `${v.license_plate} ${v.profiles?.full_name ? '(' + v.profiles.full_name + ')' : ''}`,
                          selectedLabel: v.license_plate
                        }))}
                        value={currentVid || ''}
                        onValueChange={(val) => {
                          if (isRowDisabled) return;
                          setValue(`assignments.${index}.vehicle_id`, val, { shouldValidate: true });
                          // Auto fill driver
                          const vehicle = eligibleVehicles.find(v => v.id === val);
                          if (vehicle?.driver_id || vehicle?.in_charge_id) {
                            setValue(`assignments.${index}.driver_id`, vehicle.driver_id || vehicle.in_charge_id || '', { shouldValidate: true });
                          }
                        }}
                        placeholder="Biển số..."
                        disabled={isRowDisabled || isDriver}
                      />
                      {errors.assignments?.[index]?.vehicle_id && <p className="text-red-500 text-[10px] font-medium absolute -bottom-4">{errors.assignments[index]?.vehicle_id?.message}</p>}
                    </div>
                    {/* Tài xế */}
                    <div className="flex-1 w-full space-y-1.5 mt-2 md:mt-0">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                        <User size={12} className={isPaid ? "text-green-500" : "text-primary"} /> Tài xế
                      </label>
                      <SearchableSelect
                        options={(employees || []).filter(e => e.role === 'driver' || e.role?.toLowerCase().includes('tài xế') || e.role?.toLowerCase().includes('tai xe') || e.role?.toLowerCase().includes('tai_xe') || e.role?.toLowerCase().includes('lơ xe') || e.role?.toLowerCase().includes('lo xe') || e.role?.toLowerCase().includes('lo_xe')).map(e => ({ value: e.id, label: e.full_name }))}
                        value={watchAssignments[index]?.driver_id || ''}
                        onValueChange={(val) => {
                          if (isRowDisabled) return;
                          setValue(`assignments.${index}.driver_id`, val, { shouldValidate: true });
                        }}
                        placeholder="Chọn tài xế..."
                        disabled={isRowDisabled || isDriver}
                      />
                      {errors.assignments?.[index]?.driver_id && <p className="text-red-500 text-[10px] font-medium absolute -bottom-4">{errors.assignments[index]?.driver_id?.message}</p>}
                    </div>
                    {/* Số lượng */}
                    <div className="w-full md:w-32 space-y-1.5 mt-2 md:mt-0">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                        <Package size={12} className={isPaid ? "text-green-500" : "text-primary"} /> SL giao thêm
                      </label>
                      {(assignmentBaselines[index] ?? 0) > 0 && (
                        <p className="text-[9px] text-muted-foreground font-semibold tabular-nums -mt-0.5">
                          Đã gán: {(assignmentBaselines[index] ?? 0).toLocaleString()} — nhập phần nốt (vd đơn 20, đã 10 → ghi 10).
                        </p>
                      )}
                      {(assignmentBaselines[index] ?? 0) === 0 && (
                        <p className="text-[9px] text-muted-foreground leading-snug -mt-0.5">
                          Lần đầu phân xe: nhập tổng SL cho xe (vd 20).
                        </p>
                      )}
                      <input
                        type="number"
                        step="any"
                        {...register(`assignments.${index}.quantity` as const, {
                          onChange: (e) => {
                            if (isRowDisabled) return;
                            let valStr = e.target.value;
                            if (valStr.length > 1 && valStr.startsWith('0') && valStr[1] !== '.') {
                              valStr = valStr.replace(/^0+/, '');
                              e.target.value = valStr;
                            }
                            const delta = Number(valStr) || 0;
                            const baseline = assignmentBaselines[index] ?? 0;
                            const finalQty = baseline + delta;
                            const currentUnitPrice = Number(watchAssignments[index]?.unit_price) || 0;
                            if (!importPaid) {
                              const expected = finalQty * currentUnitPrice;
                              setValue(`assignments.${index}.expected_amount`, expected, { shouldValidate: true });
                            }
                          }
                        })}
                        disabled={isRowDisabled}
                        placeholder="0"
                        className={clsx("w-full h-10.5 px-3 bg-muted/20 border border-border rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-bold tabular-nums", isRowDisabled && "opacity-70 bg-muted text-muted-foreground cursor-not-allowed")}
                      />
                      {errors.assignments?.[index]?.quantity && <p className="text-red-500 text-[10px] font-medium absolute -bottom-4">{errors.assignments[index]?.quantity?.message}</p>}
                    </div>

                    {/* Đơn giá (VND): format vi-VN */}
                    <div className="w-full md:w-36 space-y-1.5 mt-2 md:mt-0">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                        Đơn giá
                      </label>
                      <Controller
                        control={control}
                        name={`assignments.${index}.unit_price`}
                        render={({ field }) => (
                          <VnUnitPriceInput
                            value={Number(field.value) || 0}
                            onChange={(vnd) => {
                              if (isRowDisabled) return;
                              field.onChange(vnd);
                              const delta = Number(watchAssignments[index]?.quantity) || 0;
                              const baseline = assignmentBaselines[index] ?? 0;
                              const finalQty = baseline + delta;
                              if (!importPaid) {
                                const expected = finalQty * vnd;
                                setValue(`assignments.${index}.expected_amount`, expected, { shouldValidate: true });
                              }
                            }}
                            onBlur={field.onBlur}
                            name={field.name}
                            disabled={isRowDisabled}
                            placeholder="0"
                            className={clsx(
                              'w-full h-10.5 px-3 bg-card border border-border rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-bold tabular-nums',
                              isRowDisabled && 'opacity-70 bg-muted text-muted-foreground cursor-not-allowed'
                            )}
                          />
                        )}
                      />
                    </div>

                    {/* Tiền thu (chỉ đơn tạp hóa/standard) */}
                    {isStandardOrder && (
                      <div className="w-full md:w-44 space-y-1.5 mt-2 md:mt-0">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Tiền thu (VND)</label>
                        {importPaid ? (
                          <div
                            className="w-full h-10.5 px-3 flex items-center rounded-lg border border-emerald-200/80 bg-emerald-500/10 text-[12px] font-bold text-emerald-800 tabular-nums cursor-not-allowed"
                            title="Phiếu nhập đã trả — không thu lại trên xe"
                          >
                            Đã trả
                          </div>
                        ) : (
                          <Controller
                            control={control}
                            name={`assignments.${index}.expected_amount`}
                            render={({ field }) => (
                              <CurrencyInput
                                value={Number(field.value) > 0 ? Number(field.value) : undefined}
                                onChange={(val) => {
                                  if (isRowDisabled) return;
                                  field.onChange(val ?? 0);
                                }}
                                onBlur={field.onBlur}
                                name={field.name}
                                disabled={isRowDisabled}
                                placeholder="0"
                                className={clsx(
                                  'w-full h-10.5 px-3 bg-muted/20 border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-bold tabular-nums',
                                  isRowDisabled && 'opacity-70 bg-muted text-muted-foreground cursor-not-allowed',
                                )}
                              />
                            )}
                          />
                        )}
                      </div>
                    )}

                    {/* Người bốc xếp (chỉ đơn rau) */}
                    {!isStandardOrder && (
                      <div className="w-full md:w-52 space-y-1.5 mt-2 md:mt-0">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Người bốc xếp</label>
                        <input
                          type="text"
                          {...register(`assignments.${index}.loader_name` as const)}
                          disabled={isRowDisabled}
                          placeholder="Nhập tên người bốc xếp"
                          className={clsx(
                            "w-full h-10.5 px-3 bg-muted/20 border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-semibold",
                            isRowDisabled && "opacity-70 bg-muted text-muted-foreground cursor-not-allowed"
                          )}
                        />
                      </div>
                    )}

                    {/* Ảnh gắn theo từng xe (phiếu thu / chứng từ) */}
                    <div className="w-full flex-[1_1_100%] border-t border-dashed border-border/70 pt-3 mt-1">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
                        Ảnh theo xe
                        {(() => {
                          const plate = eligibleVehicles.find((v) => v.id === currentVid)?.license_plate?.trim();
                          return plate ? ` · ${plate}` : '';
                        })()}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(watchAssignments[index]?.image_urls || []).map((url, uidx) => (
                          <div
                            key={`row-${index}-${url}-${uidx}`}
                            className="relative w-12 h-12 rounded-lg border border-border overflow-hidden shrink-0 group/rowimg bg-muted/20"
                          >
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            {!isRowDisabled && (
                              <button
                                type="button"
                                onClick={() => {
                                  const cur = watchAssignments[index]?.image_urls || [];
                                  setValue(
                                    `assignments.${index}.image_urls`,
                                    cur.filter((u) => u !== url),
                                    { shouldValidate: true },
                                  );
                                }}
                                className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover/rowimg:opacity-100 transition-opacity"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                        {!isRowDisabled && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                imageUploadTargetRef.current = index;
                                cameraInputRef.current?.click();
                              }}
                              disabled={isUploading}
                              className="w-12 h-12 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:text-orange-500 hover:border-orange-400/50 hover:bg-orange-50/50 transition-all disabled:opacity-50"
                              title="Chụp ảnh cho xe này"
                            >
                              <Camera size={16} className="text-orange-500" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                imageUploadTargetRef.current = index;
                                fileInputRef.current?.click();
                              }}
                              disabled={isUploading}
                              className="w-12 h-12 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all disabled:opacity-50"
                              title="Chọn ảnh cho xe này"
                            >
                              <ImagePlus size={16} className="text-primary" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Nút xóa */}
                    {fields.length > 1 && !isRowDisabled && (
                      <button
                        type="button"
                        onClick={() => removeAssignmentRow(index)}
                        className="absolute -top-2 -right-2 md:static md:w-10 md:h-10.5 flex items-center justify-center bg-card md:bg-transparent text-red-400 hover:text-red-500 hover:bg-red-50 border border-red-100 md:border-transparent rounded-full md:rounded-lg shadow-sm md:shadow-none transition-all"
                        title="Xóa xe này"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {order?.total_quantity && projectedAssignedTotal > order.total_quantity && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-2 text-amber-700 mt-4">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p className="text-[12px] font-medium italic">Tổng số lượng đã phân ({projectedAssignedTotal.toLocaleString()}) đang vượt quá yêu cầu của đơn hàng ({order.total_quantity.toLocaleString()}).</p>
              </div>
            )}

            {isStandardOrder && (
              <div className="space-y-2 pt-4 border-t border-border mt-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Trạng thái thanh toán phiếu xuất</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setValue('export_payment_status', 'unpaid', { shouldValidate: true })}
                    className={clsx(
                      'h-10 rounded-xl border text-[13px] font-bold transition-all',
                      watchExportPaymentStatus === 'unpaid'
                        ? 'border-red-300 bg-red-50 text-red-700'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted/40'
                    )}
                  >
                    Chưa thanh toán
                  </button>
                  <button
                    type="button"
                    onClick={() => setValue('export_payment_status', 'paid', { shouldValidate: true })}
                    className={clsx(
                      'h-10 rounded-xl border text-[13px] font-bold transition-all',
                      watchExportPaymentStatus === 'paid'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted/40'
                    )}
                  >
                    Đã thanh toán
                  </button>
                </div>
              </div>
            )}

            {/* Upload Image Section — lưới lớn: mọi ảnh (chung + theo từng xe) */}
            <div className="space-y-1.5 pt-4 border-t border-border mt-2">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Camera size={12} />
                Ảnh xuất hàng / Giao hàng ({allMergedImageUrls.length})
              </label>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Ảnh thêm trong từng dòng xe hiển thị kèm biển số ở trên; tất cả ảnh vẫn xem và xóa tại đây.
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {allMergedImageUrls.map((url, idx) => (
                  <div key={`${url}-${idx}`} className="relative aspect-square rounded-xl border border-border overflow-hidden group bg-muted/20">
                    <img src={url} alt={`Receipt ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImageUrlFromForm(getValues, setValue, url)}
                      className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
                
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    ref={cameraInputRef}
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      imageUploadTargetRef.current = 'global';
                      cameraInputRef.current?.click();
                    }}
                    disabled={isUploading}
                    className="w-full aspect-square border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:text-orange-500 hover:border-orange-400/50 hover:bg-orange-50 transition-all bg-muted/5 disabled:opacity-50"
                  >
                    {isUploading ? (
                      <Loader2 size={18} className="animate-spin text-primary" />
                    ) : (
                      <>
                        <Camera size={20} className="mb-1 text-orange-500" />
                        <span className="text-[10px] font-bold text-center px-1">Chụp ảnh</span>
                      </>
                    )}
                  </button>
                </div>

                <div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      imageUploadTargetRef.current = 'global';
                      fileInputRef.current?.click();
                    }}
                    disabled={isUploading}
                    className="w-full aspect-square border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all bg-muted/5 disabled:opacity-50"
                  >
                    {isUploading ? (
                      <Loader2 size={18} className="animate-spin text-primary" />
                    ) : (
                      <>
                        <ImagePlus size={20} className="mb-1 text-primary" />
                        <span className="text-[10px] font-bold text-center px-1">Chọn ảnh</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </form>

        {/* Footer Buttons */}
        <div className="p-5 sm:p-6 pt-4 bg-card border-t border-border shrink-0 sm:rounded-b-3xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-border hover:bg-muted text-foreground text-[14px] font-bold transition-all"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              form="assign-vehicle-form"
              disabled={isSubmitting}
              className={clsx(
                "flex-2 py-3 rounded-xl bg-primary text-white text-[14px] font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2",
                isSubmitting && "opacity-70 cursor-not-allowed pointer-events-none"
              )}
            >
              {isSubmitting ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Truck size={18} />
              )}
              {isStandardOrder ? 'Xác nhận thông tin' : 'Xuất hàng'}
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};

export default AssignVehicleDialog;
