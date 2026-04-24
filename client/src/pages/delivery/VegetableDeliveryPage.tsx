import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { Calendar, PlusCircle, Truck, CheckCircle, Store, Package, User, Trash2, Pencil, RotateCcw } from 'lucide-react';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import PageHeader from '../../components/shared/PageHeader';
import { useDeliveryOrders, useDeleteDeliveryOrders } from '../../hooks/queries/useDelivery';
import { useVehicles } from '../../hooks/queries/useVehicles';
import { useAuth } from '../../context/AuthContext';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import AssignVehicleDialog from './dialogs/AssignVehicleDialog';
import EditDeliveryDialog from './dialogs/EditDeliveryDialog';
import BulkAssignVehicleDialog from './dialogs/BulkAssignVehicleDialog';
import BulkEditDeliveryDialog from './dialogs/BulkEditDeliveryDialog';
import RevertVehicleDialog from './dialogs/RevertVehicleDialog';
import { MultiSearchableSelect } from '../../components/ui/MultiSearchableSelect';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import { Filter, X } from 'lucide-react';
import { SearchInput } from '../../components/ui/SearchInput';
import { matchesSearch } from '../../lib/str-utils';
import { getDeliveryAnchorDateString } from '../../lib/deliveryDayAnchor';
import { formatNgayGioGiaoVI } from '../../lib/deliveryDisplay';
import type { DeliveryOrder, Vehicle } from '../../types';
import { isSoftDeletedSourceOrder } from '../../utils/softDeletedOrder';
import { deliveryOrderVisibleToUser, hasFullGoodsModuleAccess } from '../../utils/goodsModuleScope';

const formatNumber = (val?: number) => {
  if (val == null) return '0';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(val);
};

const STATUS_LABELS: Record<string, string> = {
  all: 'Tất cả',
  can_giao: 'Cần giao',
  da_giao: 'Đã giao',
};

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  all: { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  can_giao: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-500', dot: 'bg-orange-500' },
  da_giao: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-500', dot: 'bg-green-500' },
};

const normalizeVegetableStatus = (status?: string) => (status === 'hang_o_sg' ? 'can_giao' : (status || 'can_giao'));

const PAYMENT_STATUS_CONFIG = {
  unpaid: { label: 'Chưa thu', className: 'bg-red-500/10 text-red-700 dark:text-red-500 border-red-200/20' },
  partial: { label: 'Thu một phần', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-200/20' },
  paid: { label: 'Đã thu', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-200/20' },
};

const isPaidCollectionStatus = (status?: string) => status === 'confirmed' || status === 'self_confirmed';

const vehicleSupportsGoodsCategory = (vehicle: Vehicle, category: 'grocery' | 'vegetable') => {
  if (!vehicle.goods_categories || vehicle.goods_categories.length === 0) return true;
  return vehicle.goods_categories.includes(category);
};

const getOrderData = (order: DeliveryOrder) => order.vegetable_orders || order.import_orders;

const getSenderName = (order: DeliveryOrder) => getOrderData(order)?.sender_name || getOrderData(order)?.customers?.name || '-';

const getDisplayProductName = (order: DeliveryOrder) =>
  order.product_name.includes(' - ') ? order.product_name.split(' - ').slice(1).join(' - ') : order.product_name;

const getPresetVehicleIdFromOrder = (order: DeliveryOrder, vehicleList: Vehicle[]) => {
  const orderPlate = getOrderData(order)?.license_plate?.trim().toLowerCase();
  if (!orderPlate) return undefined;
  return vehicleList.find((v) => v.license_plate?.trim().toLowerCase() === orderPlate)?.id;
};

const getOrderPaymentStatus = (order: DeliveryOrder): keyof typeof PAYMENT_STATUS_CONFIG => {
  const assignedVehicleIds = (order.delivery_vehicles || [])
    .filter((dv) => (dv.assigned_quantity || 0) > 0)
    .map((dv) => dv.vehicle_id)
    .filter((vehicleId): vehicleId is string => Boolean(vehicleId));

  if (assignedVehicleIds.length === 0) return 'unpaid';

  const paidVehicleIds = new Set(
    (order.payment_collections || [])
      .filter((pc) => isPaidCollectionStatus(pc.status))
      .map((pc) => pc.vehicle_id)
      .filter((vehicleId): vehicleId is string => Boolean(vehicleId))
  );

  const paidCount = assignedVehicleIds.filter((vehicleId) => paidVehicleIds.has(vehicleId)).length;

  if (paidCount === 0) return 'unpaid';
  if (paidCount === assignedVehicleIds.length) return 'paid';
  return 'partial';
};

const VegetableDeliveryPage: React.FC = () => {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'can_giao' | 'da_giao'>('can_giao');
  const [ageFilter, setAgeFilter] = useState<'all' | 'new' | 'old'>('all');

  const { user } = useAuth();
  const { data: vehicles } = useVehicles();
  const { data: ordersRaw, isLoading: ordersLoading, isError, refetch } = useDeliveryOrders(startDate, endDate, 'vegetable');
  const orders = React.useMemo(() => {
    let base = (ordersRaw || []).filter((o) => !isSoftDeletedSourceOrder(o));
    if (user && !hasFullGoodsModuleAccess(user)) {
      base = base.filter((o) =>
        deliveryOrderVisibleToUser(o, { id: user.id, role: user.role, full_name: user.full_name }, vehicles || [])
      );
    }
    return base;
  }, [ordersRaw, user, vehicles]);
  const deleteMutation = useDeleteDeliveryOrders();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isAssignClosing, setIsAssignClosing] = useState(false);

  const [editingOrder, setEditingOrder] = useState<DeliveryOrder | null>(null);
  const [isEditClosing, setIsEditClosing] = useState(false);

  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [isBulkAssignClosing, setIsBulkAssignClosing] = useState(false);

  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isBulkEditClosing, setIsBulkEditClosing] = useState(false);

  const [revertingOrder, setRevertingOrder] = useState<DeliveryOrder | null>(null);
  const [isRevertClosing, setIsRevertClosing] = useState(false);

  const isLoading = ordersLoading;
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const normalizedRole = (user?.role || '').toLowerCase();
  const isLoader = normalizedRole.includes('lo_xe') || normalizedRole.includes('lơ xe');
  const isDriver =
    normalizedRole === 'driver' || normalizedRole.includes('tai_xe') || normalizedRole.includes('tài xế') || normalizedRole.includes('driver');
  const isDriverOrLoader = isDriver || isLoader;
  const eligibleVehicles = React.useMemo(
    () => (vehicles || []).filter((vehicle) => vehicleSupportsGoodsCategory(vehicle, 'vegetable')),
    [vehicles]
  );
  const myVehicleIds = React.useMemo(
    () => eligibleVehicles.filter((v) => 
      v.driver_id === user?.id || 
      v.in_charge_id === user?.id ||
      (user?.full_name && v.profiles?.full_name === user?.full_name) ||
      (user?.full_name && v.responsible_profile?.full_name === user?.full_name)
    ).map((v) => v.id),
    [eligibleVehicles, user]
  );
  const myVehicleIdSet = React.useMemo(() => new Set(myVehicleIds), [myVehicleIds]);
  const myPrimaryVehicleId = myVehicleIds[0];
  const canShowAssignButton = isAdmin || isLoader || (isDriver && myVehicleIds.length > 0);

  const displayedVehicles = React.useMemo(() => {
    if (statusFilter === 'da_giao' && isDriverOrLoader) {
      return eligibleVehicles.filter(v => myVehicleIdSet.has(v.id));
    }
    return eligibleVehicles;
  }, [eligibleVehicles, statusFilter, isDriverOrLoader, myVehicleIdSet]);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCustomer, setFilterCustomer] = useState<string[]>([]);
  const [filterReceiver, setFilterReceiver] = useState<string[]>([]);
  const [filterProduct, setFilterProduct] = useState<string[]>([]);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isFilterClosing, setIsFilterClosing] = useState(false);

  const openFilter = () => setIsFilterOpen(true);
  const closeFilter = () => {
    setIsFilterClosing(true);
    setTimeout(() => {
      setIsFilterOpen(false);
      setIsFilterClosing(false);
    }, 300);
  };

  const openAssign = (order: DeliveryOrder, vehicleId?: string) => {
    setSelectedOrder(order);
    setSelectedVehicleId(vehicleId || null);
    setIsAssignOpen(true);
  };

  const closeAssign = () => {
    setIsAssignClosing(true);
    setTimeout(() => {
      setIsAssignOpen(false);
      setIsAssignClosing(false);
      setSelectedOrder(null);
      setSelectedVehicleId(null);
    }, 350);
  };

  const openRevert = (order: DeliveryOrder) => setRevertingOrder(order);
  const closeRevert = () => {
    setIsRevertClosing(true);
    setTimeout(() => {
      setRevertingOrder(null);
      setIsRevertClosing(false);
    }, 300);
  };

  const openEdit = (order: DeliveryOrder) => setEditingOrder(order);
  const closeEdit = () => {
    setIsEditClosing(true);
    setTimeout(() => {
      setEditingOrder(null);
      setIsEditClosing(false);
    }, 300);
  };

  const openBulkEdit = () => setIsBulkEditOpen(true);
  const closeBulkEdit = () => {
    setIsBulkEditClosing(true);
    setTimeout(() => {
      setIsBulkEditOpen(false);
      setIsBulkEditClosing(false);
      setSelectedIds(new Set());
    }, 300);
  };

  const openBulkAssign = () => setIsBulkAssignOpen(true);
  const closeBulkAssign = () => {
    setIsBulkAssignClosing(true);
    setTimeout(() => {
      setIsBulkAssignOpen(false);
      setIsBulkAssignClosing(false);
      setSelectedIds(new Set());
    }, 300);
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Xác nhận xoá ${selectedIds.size} đơn hàng đã chọn?`)) return;
    try {
      await deleteMutation.mutateAsync(Array.from(selectedIds));
      setSelectedIds(new Set());
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteOne = async (id: string) => {
    if (!window.confirm('Xác nhận xoá đơn hàng này?')) return;
    try {
      await deleteMutation.mutateAsync([id]);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      // Error handled by mutation
    }
  };

  const handleOrderClick = async (order: DeliveryOrder, vehicleId?: string) => {
    if (isDriver && !isLoader && myVehicleIds.length === 0) return;

    const clickedVehicleId =
      vehicleId ||
      (myVehicleIds.length === 1 ? myPrimaryVehicleId : getPresetVehicleIdFromOrder(order, eligibleVehicles));

    openAssign(order, clickedVehicleId);
  };

  // Status counts for tabs
  const statusCounts = React.useMemo(() => {
    if (!orders) return { all: 0, can_giao: 0, da_giao: 0 };
    return {
      all: orders.length,
      can_giao: orders.filter((o) => normalizeVegetableStatus(o.status) === 'can_giao').length,
      da_giao: orders.filter((o) => {
        if (o.status === 'da_giao') return true;
        const totalAssigned = (o.delivery_vehicles || []).reduce((sum, dv) => sum + (dv.assigned_quantity || 0), 0);
        return totalAssigned > 0 && totalAssigned < o.total_quantity;
      }).length,
    };
  }, [orders]);

  const { customerOptions, receiverOptions, productOptions } = React.useMemo(() => {
    if (!orders) return { customerOptions: [], receiverOptions: [], productOptions: [] };
    const cSet = new Set<string>();
    const rSet = new Set<string>();
    const pSet = new Set<string>();
    orders.forEach(o => {
      const orderData = o.vegetable_orders || o.import_orders;
      const cName = orderData?.sender_name || orderData?.customers?.name;
      if (cName) cSet.add(cName);

      const rName = orderData?.receiver_name?.trim() || orderData?.profiles?.full_name;
      if (rName) rSet.add(rName);

      const pName = o.product_name.includes(' - ') ? o.product_name.split(' - ').slice(1).join(' - ') : o.product_name;
      if (pName) pSet.add(pName);
    });
    return {
      customerOptions: Array.from(cSet).map(c => ({ label: c, value: c })),
      receiverOptions: Array.from(rSet).map(c => ({ label: c, value: c })),
      productOptions: Array.from(pSet).map(p => ({ label: p, value: p })),
    };
  }, [orders]);

  let filteredOrders = orders || [];

    // Filter by status
  if (statusFilter !== 'all') {
    filteredOrders = filteredOrders.filter(o => {
      const normalized = normalizeVegetableStatus(o.status);
      if (statusFilter === 'can_giao') return normalized === 'can_giao';
      if (statusFilter === 'da_giao') {
        let isDaGiao = false;
        if (normalized === 'da_giao') isDaGiao = true;
        else {
          const totalAssigned = (o.delivery_vehicles || []).reduce((sum, dv) => sum + (dv.assigned_quantity || 0), 0);
          isDaGiao = totalAssigned > 0 && totalAssigned < o.total_quantity;
        }

        if (!isDaGiao) return false;

        if (isDriverOrLoader) {
          const hasMyAssignment = (o.delivery_vehicles || []).some(dv => 
            dv.vehicle_id && myVehicleIdSet.has(dv.vehicle_id) && (dv.assigned_quantity || 0) > 0
          );
          return hasMyAssignment;
        }

        return true;
      }
      return true;
    });
  }

  // Filter by age (mốc 19:00 — giống trang giao tạp hóa)
  const anchorStr = getDeliveryAnchorDateString();
  if (ageFilter === 'new') {
    filteredOrders = filteredOrders.filter((o) => o.delivery_date === anchorStr);
  } else if (ageFilter === 'old') {
    filteredOrders = filteredOrders.filter((o) => o.delivery_date && o.delivery_date < anchorStr);
  }

    // Text & Select Filters logic
  filteredOrders = filteredOrders.filter(o => {
      const orderData = o.vegetable_orders || o.import_orders;
      const cName = orderData?.sender_name || orderData?.customers?.name;
      const rName = orderData?.receiver_name?.trim() || orderData?.profiles?.full_name;
      const pName = getDisplayProductName(o);

      if (searchQuery) {
        if (
          !matchesSearch(cName || '', searchQuery) && 
          !matchesSearch(rName || '', searchQuery) && 
          !matchesSearch(pName || '', searchQuery) && 
          !matchesSearch(orderData?.order_code || '', searchQuery)
        ) {
          return false;
        }
      }
      if (filterCustomer.length > 0 && cName && !filterCustomer.includes(cName)) return false;
      if (filterReceiver.length > 0 && rName && !filterReceiver.includes(rName)) return false;
      if (filterProduct.length > 0 && pName && !filterProduct.includes(pName)) return false;

      return true;
    });

  // Selection helpers (admin only)
  const isAllSelected = filteredOrders.length > 0 && filteredOrders.every(o => selectedIds.has(o.id));
  const isSomeSelected = !isAllSelected && filteredOrders.some(o => selectedIds.has(o.id));
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map(o => o.id)));
    }
  };

  // Grouping logic: Date -> Supplier -> [Orders]
  const groupedOrders = (filteredOrders || []).reduce<Record<string, Record<string, DeliveryOrder[]>>>((acc, order) => {
    const date = order.delivery_date || 'N/A';
    const supplierName = getSenderName(order) || 'Chưa rõ vựa';

    if (!acc[date]) acc[date] = {};
    if (!acc[date][supplierName]) acc[date][supplierName] = [];
    acc[date][supplierName].push(order);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedOrders).sort((a, b) => b.localeCompare(a)); // Newest first

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader title="Giao hàng rau" description="Danh sách đơn hàng rau cần giao" backPath="/hang-hoa" />
      </div>

      <div className="bg-card flex flex-row w-full gap-2 items-center rounded-2xl shadow-sm border border-border p-2.5 md:mb-6 mb-3 overflow-x-auto custom-scrollbar">
        {/* SEARCH BAR */}
        <div className="flex-1 min-w-50 md:max-w-full">
          <SearchInput
            placeholder="Tìm mã, vựa, hàng..."
            onSearch={(raw) => setSearchQuery(raw)}
            className="h-9.5"
          />
        </div>

        {/* DESKTOP ADVANCED FILTERS */}
        <div className="hidden md:flex gap-2 items-center shrink-0">
          <div className="w-50">
            <MultiSearchableSelect
              options={customerOptions}
              value={filterCustomer}
              onValueChange={setFilterCustomer}
              placeholder="Tên vựa / chủ"
              className="bg-transparent"
              icon={<Store size={15} />}
            />
          </div>

          <div className="w-50">
            <MultiSearchableSelect
              options={receiverOptions}
              value={filterReceiver}
              onValueChange={setFilterReceiver}
              placeholder="Người nhận"
              className="bg-transparent"
              icon={<User size={15} />}
            />
          </div>

          <div className="w-50">
            <MultiSearchableSelect
              options={productOptions}
              value={filterProduct}
              onValueChange={setFilterProduct}
              placeholder="Tên hàng"
              className="bg-transparent"
              icon={<Package size={15} />}
            />
          </div>
        </div>

        {/* AGE FILTER */}
        <div className="hidden md:flex shrink-0 bg-muted/20 border border-border/80 rounded-xl p-0.5">
          {(['all', 'new', 'old'] as const).map((age) => (
            <button
              key={age}
              onClick={() => setAgeFilter(age)}
              className={clsx(
                "px-3 py-1.5 text-[12px] font-bold rounded-lg transition-all",
                ageFilter === age
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {age === 'all' ? 'Tất cả' : age === 'new' ? 'Hàng mới' : 'Hàng cũ'}
            </button>
          ))}
        </div>

        {/* DESKTOP DATE FILTER */}
        <div className="hidden md:block shrink-0">
          <DateRangePicker
            initialDateFrom={startDate}
            initialDateTo={endDate}
            onUpdate={(values) => {
              if (values.range.from) {
                setStartDate(format(values.range.from, 'yyyy-MM-dd'));
              } else {
                setStartDate('');
              }
              if (values.range.to) {
                setEndDate(format(values.range.to, 'yyyy-MM-dd'));
              } else {
                setEndDate('');
              }
            }}
          />
        </div>

        {/* ACTIONS */}
        <div className="flex items-center gap-2 shrink-0">
          {/* MOBILE FILTER BUTTON */}
          <button
            onClick={openFilter}
            className="md:hidden flex items-center justify-center w-9.5 h-9.5 shrink-0 border border-border/80 rounded-xl transition-all bg-muted/20 text-muted-foreground hover:bg-muted"
          >
            <Filter size={17} />
          </button>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Status Tabs */}
        <div className="flex flex-col shrink-0 border-b border-border bg-muted/50">
          <div className="grid grid-cols-3 gap-1 px-3 py-2 md:flex md:items-center md:gap-1 md:overflow-x-auto custom-scrollbar">
            {(['can_giao', 'da_giao', 'all'] as const).map(status => {
              const colors = STATUS_COLORS[status];
              const isActive = statusFilter === status;
              const count = statusCounts[status];
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={clsx(
                    "w-full flex items-center justify-center md:justify-start gap-1 px-1.5 md:px-3 py-1.5 rounded-lg text-[10px] md:text-[12px] font-bold transition-all whitespace-nowrap",
                    isActive
                      ? `${colors.bg} ${colors.text} shadow-sm ring-1 ring-black/5`
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {STATUS_LABELS[status]}
                  {count > 0 && (
                    <span className={clsx(
                      "text-[9px] md:text-[10px] font-black px-1 md:px-1.5 py-0.5 rounded-full min-w-4 md:min-w-5 text-center",
                      isActive ? `${colors.bg} ${colors.text}` : "bg-muted/60 text-muted-foreground"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <div className="p-4"><LoadingSkeleton rows={10} columns={6} /></div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !filteredOrders?.length ? (
          <EmptyState 
            title={statusFilter === 'all' ? "Không có dữ liệu" : statusFilter === 'can_giao' ? "Không có đơn cần giao" : "Không có đơn đã giao"} 
            description={`Không có đơn hàng nào với trạng thái "${STATUS_LABELS[statusFilter]}" phù hợp với bộ lọc.`} 
          />
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar bg-muted/30 md:bg-transparent relative">
            {/* Desktop View */}
            <div className="hidden md:block">
              <table className="w-full border-collapse bg-card">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-card border-b border-border text-muted-foreground">
                    {isAdmin && (
                      <th className="px-3 py-3 w-10 border-r border-border">
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                            checked={isAllSelected}
                            onChange={toggleSelectAll}
                            ref={input => {
                              if (input) {
                                input.indeterminate = isSomeSelected;
                              }
                            }}
                          />
                        </div>
                      </th>
                    )}
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-24 border-r border-border">Thao tác</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">Loại</th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-28 border-r border-border">Ngày giờ giao</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-left min-w-20 border-r border-border">Tên vựa / chủ</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-left border-r border-border">Hàng</th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-17.5 border-r border-border">Trạng thái</th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-28 border-r border-border">Thanh toán</th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">SL Tổng</th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">Còn lại</th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">Dư</th>
                    {displayedVehicles.map(v => (
                      <th key={v.id} className={clsx(
                        "px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-28 border-r border-border last:border-r-0",
                        myVehicleIdSet.has(v.id) && "bg-primary/5 text-primary"
                      )}>
                        {v.license_plate}
                      </th>
                    ))}
                    {displayedVehicles.length === 0 && !(statusFilter === 'da_giao' && isDriverOrLoader) && ['1', '2', '3', '4', '5', '6', '7', '8', 'ba', 'kho'].map(col => (
                      <th key={col} className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-12 border-r border-border last:border-r-0">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedDates.map((date) => (
                    <React.Fragment key={date}>
                      {/* Date separator row */}
                      <tr className="bg-muted/80 dark:bg-muted/40 border-y border-border shadow-sm overflow-hidden">
                        <td colSpan={(isAdmin ? 11 : 10) + (displayedVehicles.length || ((statusFilter === 'da_giao' && isDriverOrLoader) ? 0 : 10))} className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {isAdmin && (() => {
                              const dateOrders = Object.values(groupedOrders[date]).flat();
                              return (
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer mr-2"
                                  checked={dateOrders.length > 0 && dateOrders.every(o => selectedIds.has(o.id))}
                                  onChange={(e) => {
                                    const isChecked = e.target.checked;
                                    setSelectedIds(prev => {
                                      const next = new Set(prev);
                                      dateOrders.forEach(o => {
                                        if (isChecked) next.add(o.id);
                                        else next.delete(o.id);
                                      });
                                      return next;
                                    });
                                  }}
                                  ref={input => {
                                    if (input) {
                                      const someSelected = dateOrders.some(o => selectedIds.has(o.id));
                                      const allSelected = dateOrders.every(o => selectedIds.has(o.id));
                                      input.indeterminate = someSelected && !allSelected;
                                    }
                                  }}
                                />
                              );
                            })()}
                            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 text-primary">
                              <Calendar size={14} />
                            </div>
                            <span className="text-[13px] font-black text-foreground uppercase tracking-wider">Ngày giao: {new Date(date).toLocaleDateString('vi-VN')}</span>
                          </div>
                        </td>
                      </tr>
                      {/* Items for this date (grouped by supplier) */}
                      {Object.entries(groupedOrders[date]).map(([supplierName, ordersBySupplier]) => (
                        <React.Fragment key={`${date}-${supplierName}`}>
                          <tr className="bg-primary/5 border-y border-primary/10">
                            <td colSpan={(isAdmin ? 11 : 10) + (displayedVehicles.length || ((statusFilter === 'da_giao' && isDriverOrLoader) ? 0 : 10))} className="px-4 py-2">
                              <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Vựa: {supplierName}</span>
                            </td>
                          </tr>
                          {ordersBySupplier.map((o) => {
                        const totalAssigned = (o.delivery_vehicles || []).reduce(
                          (sum, dv) => sum + (dv.assigned_quantity || 0),
                          0
                        );
                        const remainingQty = o.total_quantity - totalAssigned;
                        const displayStatus = normalizeVegetableStatus(o.status);
                        const statusColor = STATUS_COLORS[displayStatus] || STATUS_COLORS.can_giao;
                        const paymentStatus = getOrderPaymentStatus(o);
                        const paymentConfig = PAYMENT_STATUS_CONFIG[paymentStatus];

                            return (
                          <tr key={o.id} className={clsx("transition-colors group", selectedIds.has(o.id) ? "bg-primary/5 dark:bg-primary/10" : "hover:bg-muted/50")}>
                            {isAdmin && (
                              <td className="px-3 py-3 border-r border-border text-center">
                                <div className="flex items-center justify-center">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                                    checked={selectedIds.has(o.id)}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      toggleSelectId(o.id);
                                    }}
                                  />
                                </div>
                              </td>
                            )}
                            <td className="px-2 py-3 border-r border-border text-center">
                              <div className="flex items-center justify-center gap-1">
                                {canShowAssignButton && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOrderClick(o);
                                    }}
                                    className={clsx(
                                      "p-1.5 rounded-md transition-colors",
                                      remainingQty > 0
                                        ? "bg-orange-500/10 text-orange-600 dark:text-orange-500 hover:bg-orange-500/20"
                                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                                    )}
                                    title={remainingQty > 0 ? "Xuất hàng" : "Chỉnh sửa xuất hàng"}
                                  >
                                    <Truck size={14} strokeWidth={2.5} />
                                  </button>
                                )}
                                {isAdmin && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openEdit(o);
                                      }}
                                      className="p-1.5 rounded-md transition-colors bg-blue-500/10 text-blue-600 dark:text-blue-500 hover:bg-blue-500/20"
                                      title="Chỉnh sửa đơn hàng"
                                    >
                                      <Pencil size={14} strokeWidth={2.5} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteOne(o.id);
                                      }}
                                      className="p-1.5 rounded-md transition-colors bg-red-500/10 text-red-600 dark:text-red-500 hover:bg-red-500/20"
                                      title="Xóa đơn hàng"
                                    >
                                      <Trash2 size={14} strokeWidth={2.5} />
                                    </button>
                                  </>
                                )}
                                {statusFilter === 'da_giao' && (isAdmin || (isDriver && myVehicleIds.length > 0) || isLoader) && totalAssigned > 0 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openRevert(o);
                                    }}
                                    className="p-1.5 rounded-md transition-colors bg-amber-500/10 text-amber-600 dark:text-amber-500 hover:bg-amber-500/20"
                                    title="Hoàn tác giao hàng"
                                  >
                                    <RotateCcw size={14} strokeWidth={2.5} />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 border-r border-border text-center">
                              <div className="flex items-center justify-center">
                                {o.delivery_date === anchorStr ? (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500/10 text-emerald-700 uppercase">Mới</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-muted text-muted-foreground uppercase">Cũ</span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-3 border-r border-border text-center text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
                              {formatNgayGioGiaoVI(o.delivery_date, o.delivery_time)}
                            </td>
                            <td className="px-4 py-3 text-[12px] font-bold text-foreground border-r border-border">
                              {getSenderName(o)}
                            </td>
                            <td className="px-4 py-3 text-[13px] font-medium text-muted-foreground border-r border-border">
                              {getDisplayProductName(o)}
                            </td>
                            <td className="px-2 py-3 border-r border-border">
                              <div className={clsx("flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold mx-auto w-fit", statusColor.bg, statusColor.text)}>
                                <div className={clsx("w-1.5 h-1.5 rounded-full", statusColor.dot)} />
                                {STATUS_LABELS[displayStatus] || displayStatus}
                              </div>
                            </td>
                            <td className="px-2 py-3 border-r border-border text-center">
                              <span className={clsx("inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-bold border", paymentConfig.className)}>
                                {paymentConfig.label}
                              </span>
                            </td>
                            <td className="px-2 py-3 text-[13px] font-bold text-muted-foreground text-center tabular-nums border-r border-border">
                              {formatNumber(o.total_quantity)}
                              {(() => {
                                const isPartial = totalAssigned > 0 && totalAssigned < o.total_quantity;
                                if (isPartial && statusFilter === 'da_giao') {
                                  return (
                                    <div className="text-[10px] text-green-600 dark:text-green-500 mt-0.5 font-bold">
                                      Đã giao: {formatNumber(totalAssigned)}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </td>
                            <td className="px-2 py-3 text-[13px] font-black text-orange-600 dark:text-orange-500 text-center tabular-nums border-r border-border">
                              {formatNumber(remainingQty > 0 ? remainingQty : 0)}
                            </td>
                            <td className="px-2 py-3 text-[13px] font-black text-red-600 dark:text-red-500 text-center tabular-nums border-r border-border">
                              {remainingQty < 0 ? formatNumber(remainingQty) : '-'}
                            </td>
                            {displayedVehicles.map(v => {
                              const dv = (o.delivery_vehicles || []).find((deliveryVehicle) => deliveryVehicle.vehicle_id === v.id);
                              const qty = dv?.assigned_quantity || 0;
                              const totalAssignedQty = (o.delivery_vehicles || []).reduce((sum, deliveryVehicle) => sum + (deliveryVehicle.assigned_quantity || 0), 0);
                              const hasRealAssignment = totalAssignedQty > 0;
                              const presetVehicleId = getPresetVehicleIdFromOrder(o, eligibleVehicles);
                              const fallbackQty = !hasRealAssignment && presetVehicleId === v.id && remainingQty > 0 ? remainingQty : 0;
                              const displayQty = qty > 0 ? qty : fallbackQty;
                              const isEditableByMe = myVehicleIdSet.has(v.id);
                              const canEdit = isEditableByMe || isAdmin;

                              const isPaid = (o.payment_collections || []).some(
                                (pc) => pc.vehicle_id === v.id && isPaidCollectionStatus(pc.status)
                              );

                              return (
                                <td
                                  key={v.id}
                                  onClick={() => {
                                    if (canEdit && (qty > 0 || remainingQty > 0)) {
                                      handleOrderClick(o, v.id);
                                    }
                                  }}
                                  className={clsx(
                                    "px-1 py-1 text-[13px] text-center tabular-nums border-r border-border last:border-r-0 transition-all relative",
                                    displayQty > 0 ? "font-bold text-blue-600 dark:text-blue-500 bg-blue-500/10" : "text-muted-foreground/30",
                                    canEdit && (displayQty > 0 || remainingQty > 0) && "cursor-pointer hover:bg-primary/5 active:scale-95"
                                  )}
                                >
                                  <div className="flex flex-col items-center justify-center">
                                    <span>
                                      {displayQty > 0 ? formatNumber(displayQty) : (canEdit && remainingQty > 0 ? <PlusCircle size={14} className="mx-auto opacity-10 group-hover:opacity-40" /> : '-')}
                                    </span>
                                    {isPaid && (
                                      <div className="mt-0.5 flex items-center justify-center gap-0.5 text-green-600 bg-green-500/10 rounded-sm px-1" title="Đã xác nhận thu tiền">
                                        <CheckCircle size={8} strokeWidth={3} />
                                        <span className="text-[9px] font-black leading-none pb-px">Thu</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            {displayedVehicles.length === 0 && !(statusFilter === 'da_giao' && isDriverOrLoader) && ['1', '2', '3', '4', '5', '6', '7', '8', 'ba', 'kho'].map(col => {
                              const getQtyForCol = (col: string) => {
                                const matches = (o.delivery_vehicles || []).filter((dv) => {
                                  const plate = (dv.vehicles?.license_plate || '').toLowerCase();
                                  if (col === 'ba') return plate.includes('ba');
                                  if (col === 'kho') return plate.includes('kho');
                                  return plate.includes(col);
                                });
                                return matches.reduce((sum, dv) => sum + (dv.assigned_quantity || 0), 0);
                              };
                              const qty = getQtyForCol(col);
                              return (
                                <td
                                  key={col}
                                  className={clsx(
                                    "px-2 py-3 text-[13px] text-center tabular-nums border-r border-border last:border-r-0",
                                    qty > 0 ? "font-bold text-orange-600 dark:text-orange-500 bg-orange-500/10" : "text-muted-foreground/30"
                                  )}
                                >
                                  {qty > 0 ? formatNumber(qty) : '-'}
                                </td>
                              );
                            })}
                          </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="md:hidden flex flex-col gap-3 px-3 pt-0 pb-20 relative">
              {sortedDates.map((date) => (
                <div key={`mobile-${date}`} className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2 sticky top-0 bg-muted/80 dark:bg-muted/40 backdrop-blur-md p-3 -mx-3 px-5 z-10 border-b border-border shadow-sm">
                    {isAdmin && (() => {
                      const dateOrders = Object.values(groupedOrders[date]).flat();
                      return (
                        <input
                          type="checkbox"
                          className="w-5 h-5 rounded-md border-border text-primary focus:ring-primary mr-1"
                          checked={dateOrders.length > 0 && dateOrders.every(o => selectedIds.has(o.id))}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              dateOrders.forEach(o => {
                                if (isChecked) next.add(o.id);
                                else next.delete(o.id);
                              });
                              return next;
                            });
                          }}
                        />
                      );
                    })()}
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary shrink-0">
                      <Calendar size={14} />
                    </div>
                    <span className="text-[13px] font-black text-foreground uppercase tracking-wider">
                      Ngày giao: {new Date(date).toLocaleDateString('vi-VN')}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5 px-0.5">
                    {Object.entries(groupedOrders[date]).map(([supplierName, ordersBySupplier]) => (
                      <div key={`mobile-supplier-${date}-${supplierName}`} className="flex flex-col gap-2">
                        <div className="px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
                          <span className="text-[11px] font-bold text-primary uppercase tracking-wider">Vựa: {supplierName}</span>
                        </div>

                        {ordersBySupplier.map((o) => {
                      const totalAssigned = (o.delivery_vehicles || []).reduce(
                        (sum, dv) => sum + (dv.assigned_quantity || 0),
                        0
                      );
                      const remainingQty = o.total_quantity - totalAssigned;
                      const paymentStatus = getOrderPaymentStatus(o);
                      const paymentConfig = PAYMENT_STATUS_CONFIG[paymentStatus];

                          return (
                        <div
                          key={`mobile-order-${o.id}`}
                          onClick={() => {
                            handleOrderClick(o);
                          }}
                          className={clsx(
                            "bg-card rounded-xl border shadow-sm transition-all relative overflow-hidden cursor-pointer active:scale-[0.98]",
                            remainingQty > 0 ? "border-orange-500/30 dark:border-orange-500/20" : "border-border"
                          )}
                        >
                          {/* Card body */}
                          <div className="p-3 flex flex-col gap-2">
                            {isAdmin && (
                              <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  className="w-5 h-5 rounded-md border-slate-300 text-primary focus:ring-primary"
                                  checked={selectedIds.has(o.id)}
                                  onChange={() => toggleSelectId(o.id)}
                                />
                              </div>
                            )}
                            {/* Row 1: Order code + Product name */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {o.delivery_date === anchorStr ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-500/10 text-emerald-700 uppercase">Mới</span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-muted text-muted-foreground uppercase">Cũ</span>
                              )}
                              <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                              <span className="text-[13px] font-bold text-foreground">
                                {getDisplayProductName(o)}
                              </span>
                            </div>

                            {/* Row 2: Ngày giờ giao + Supplier + Quantity */}
                            <div className="flex justify-between items-center gap-2">
                              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                <span className="text-[11px] text-muted-foreground tabular-nums truncate" title={formatNgayGioGiaoVI(o.delivery_date, o.delivery_time)}>
                                  {formatNgayGioGiaoVI(o.delivery_date, o.delivery_time)}
                                </span>
                                <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground truncate">
                                  <Store size={13} className="text-muted-foreground/60 shrink-0" />
                                  <span className="font-semibold text-foreground truncate">
                                    {getSenderName(o)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className={clsx("inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-bold border", paymentConfig.className)}>
                                  {paymentConfig.label}
                                </span>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] uppercase font-black tracking-wider text-muted-foreground/60">SL:</span>
                                  <span className="text-[14px] font-bold text-foreground tabular-nums">{formatNumber(o.total_quantity)}</span>
                                  {(() => {
                                    const isPartial = totalAssigned > 0 && totalAssigned < o.total_quantity;
                                    if (isPartial && statusFilter === 'da_giao') {
                                      return (
                                        <span className="text-[11px] font-bold text-green-600 dark:text-green-500 ml-1">
                                          (Giao: {formatNumber(totalAssigned)})
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              </div>
                            </div>

                            {/* Show assigned vehicles */}
                            {(() => {
                              const deliveryVehicles = o.delivery_vehicles || [];
                              return deliveryVehicles.length > 0 && deliveryVehicles.some((dv) => {
                                if ((dv.assigned_quantity || 0) <= 0) return false;
                                if (statusFilter === 'da_giao' && isDriverOrLoader) {
                                  return dv.vehicle_id && myVehicleIdSet.has(dv.vehicle_id);
                                }
                                return true;
                              });
                            })() && (
                              <div className="pt-2 border-t border-border flex flex-wrap gap-1.5">
                                {(o.delivery_vehicles || []).filter((dv) => {
                                  if ((dv.assigned_quantity || 0) <= 0) return false;
                                  if (statusFilter === 'da_giao' && isDriverOrLoader) {
                                    return dv.vehicle_id && myVehicleIdSet.has(dv.vehicle_id);
                                  }
                                  return true;
                                }).map((dv) => {
                                  const isPaid = (o.payment_collections || []).some(
                                    (pc) => pc.vehicle_id === dv.vehicle_id && isPaidCollectionStatus(pc.status)
                                  );
                                  return (
                                    <div key={dv.id} className={clsx("flex items-center gap-1.5 px-2 py-1 rounded-md border", isPaid ? "bg-green-500/10 border-green-200/20" : "bg-blue-500/10 border-blue-200/20")} title={isPaid ? "Đã thu tiền" : undefined}>
                                      <Truck size={12} className={isPaid ? "text-green-500" : "text-blue-500"} />
                                      <span className={clsx("text-[11px] font-bold", isPaid ? "text-green-700 dark:text-green-500" : "text-blue-700 dark:text-blue-500")}>{dv.vehicles?.license_plate || '-'}</span>
                                      <span className="text-[11px] font-black text-foreground ml-1">{formatNumber(dv.assigned_quantity)}</span>
                                      {isPaid && <CheckCircle size={12} className="text-green-600 ml-0.5" />}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Bottom action bar */}
                          {isAdmin || canShowAssignButton ? (
                            <div className="flex border-t border-border divide-x divide-border">
                              {canShowAssignButton && remainingQty > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOrderClick(o);
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-orange-600 dark:text-orange-500 hover:bg-orange-500/10 text-[12px] font-bold transition-colors"
                                >
                                  <Truck size={14} strokeWidth={2.5} />
                                  Phân xe
                                </button>
                              )}
                              {isAdmin && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEdit(o);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-blue-600 dark:text-blue-500 hover:bg-blue-500/10 text-[12px] font-bold transition-colors"
                                  >
                                    <Pencil size={14} strokeWidth={2.5} />
                                    Sửa
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteOne(o.id);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-red-600 dark:text-red-500 hover:bg-red-500/10 text-[12px] font-bold transition-colors"
                                  >
                                    <Trash2 size={14} strokeWidth={2.5} />
                                    Xóa
                                  </button>
                                </>
                              )}
                              {statusFilter === 'da_giao' && (isAdmin || (isDriver && myVehicleIds.length > 0) || isLoader) && totalAssigned > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openRevert(o);
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-amber-600 dark:text-amber-500 hover:bg-amber-500/10 text-[12px] font-bold transition-colors"
                                >
                                  <RotateCcw size={14} strokeWidth={2.5} />
                                  Hoàn tác
                                </button>
                              )}
                            </div>
                          ) : null}
                        </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isAdmin && selectedIds.size > 0 && createPortal(
        <div className="fixed bottom-0 md:bottom-6 left-0 right-0 md:left-1/2 md:-translate-x-1/2 bg-card md:rounded-2xl shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.15)] md:shadow-xl border-t md:border border-border p-3 z-[900] flex flex-col md:flex-row items-center gap-3 animate-in slide-in-from-bottom-10 md:min-w-[400px]">
          <div className="flex items-center gap-2 px-2 shrink-0 self-start md:self-auto w-full md:w-auto justify-between md:justify-start">
            <span className="text-[13px] font-bold text-foreground whitespace-nowrap">Đã chọn <strong className="text-primary">{selectedIds.size}</strong></span>
            <button onClick={() => setSelectedIds(new Set())} className="text-[12px] font-bold text-muted-foreground hover:text-foreground underline md:hidden">Bỏ chọn</button>
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto custom-scrollbar pb-1 md:pb-0">
            <button
              onClick={openBulkAssign}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[12px] md:text-[13px] font-bold bg-orange-600 text-white hover:bg-orange-600 transition-all shadow-sm"
            >
              <Truck size={14} strokeWidth={2.5} />
              Phân xe
            </button>
            <button
              onClick={openBulkEdit}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[12px] md:text-[13px] font-bold bg-blue-600 text-white hover:bg-blue-600 transition-all shadow-sm"
            >
              <Pencil size={14} strokeWidth={2.5} />
              Sửa
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={deleteMutation.isPending}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[12px] md:text-[13px] font-bold bg-red-600 text-white hover:bg-red-600 transition-all shadow-sm disabled:opacity-50"
            >
              <Trash2 size={14} strokeWidth={2.5} />
              Xóa
            </button>
          </div>
          
          <button onClick={() => setSelectedIds(new Set())} className="hidden md:flex ml-auto p-2 text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted rounded-full transition-colors">
            <X size={16} />
          </button>
        </div>,
        document.body
      )}

      <AssignVehicleDialog
        isOpen={isAssignOpen}
        isClosing={isAssignClosing}
        order={selectedOrder}
        initialVehicleId={selectedVehicleId}
        allOrders={orders || []}
        onClose={closeAssign}
      />

      <EditDeliveryDialog
        isOpen={!!editingOrder}
        isClosing={isEditClosing}
        order={editingOrder}
        onClose={closeEdit}
      />

      <BulkAssignVehicleDialog
        isOpen={isBulkAssignOpen}
        isClosing={isBulkAssignClosing}
        orders={filteredOrders.filter(o => selectedIds.has(o.id))}
        onClose={closeBulkAssign}
      />

      <BulkEditDeliveryDialog
        isOpen={isBulkEditOpen}
        isClosing={isBulkEditClosing}
        orders={filteredOrders.filter(o => selectedIds.has(o.id))}
        hideImage={true}
        onClose={closeBulkEdit}
      />

      <RevertVehicleDialog
        isOpen={!!revertingOrder}
        isClosing={isRevertClosing}
        order={revertingOrder}
        isAdmin={isAdmin}
        myVehicleIds={myVehicleIds}
        onClose={closeRevert}
      />

      <MobileFilterSheet
        isOpen={isFilterOpen}
        isClosing={isFilterClosing}
        onClose={closeFilter}
        onApply={(filters) => {
          setStartDate(filters.dateFrom || '');
          setEndDate(filters.dateTo || '');
        }}
        onClear={() => {
          setFilterCustomer([]);
          setFilterReceiver([]);
          setFilterProduct([]);
        }}
        showClearButton={filterCustomer.length > 0 || filterReceiver.length > 0 || filterProduct.length > 0}
        initialDateFrom={startDate}
        initialDateTo={endDate}
        dateLabel="Khoảng thời gian"
      >
        <div className="space-y-1.5 z-30">
          <label className="text-[13px] font-bold text-muted-foreground">Tên vựa / chủ</label>
          <MultiSearchableSelect
            options={customerOptions}
            value={filterCustomer}
            onValueChange={setFilterCustomer}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-10.5 border-border/80 rounded-xl"
            inline
            icon={<Store size={15} />}
          />
        </div>
        <div className="space-y-1.5 z-25">
          <label className="text-[13px] font-bold text-muted-foreground">Người nhận</label>
          <MultiSearchableSelect
            options={receiverOptions}
            value={filterReceiver}
            onValueChange={setFilterReceiver}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-10.5 border-border/80 rounded-xl"
            inline
            icon={<User size={15} />}
          />
        </div>
        <div className="space-y-1.5 z-20">
          <label className="text-[13px] font-bold text-muted-foreground">Tên hàng</label>
          <MultiSearchableSelect
            options={productOptions}
            value={filterProduct}
            onValueChange={setFilterProduct}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-10.5 border-border/80 rounded-xl"
            inline
            icon={<Package size={15} />}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[13px] font-bold text-muted-foreground">Phân loại hàng</label>
          <div className="flex gap-2">
            {(['all', 'new', 'old'] as const).map((age) => (
              <button
                key={age}
                onClick={() => setAgeFilter(age)}
                className={clsx(
                  "flex-1 py-2.5 text-[12px] font-bold rounded-xl border transition-all",
                  ageFilter === age
                    ? "bg-primary border-primary text-white shadow-md"
                    : "bg-card border-border text-muted-foreground"
                )}
              >
                {age === 'all' ? 'Tất cả' : age === 'new' ? 'Hàng mới' : 'Hàng cũ'}
              </button>
            ))}
          </div>
        </div>
      </MobileFilterSheet>
    </div>
  );
};

export default VegetableDeliveryPage;
