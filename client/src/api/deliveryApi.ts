import axiosClient from './axiosClient';
import type { DeliveryOrder } from '../types';

export const deliveryApi = {
  getAllToday: async (startDate?: string, endDate?: string, orderCategory?: string) => {
    const { data } = await axiosClient.get<DeliveryOrder[]>('/delivery', {
      params: { startDate, endDate, order_category: orderCategory },
    });
    return data;
  },

  getInventory: async (orderCategory?: string) => {
    const { data } = await axiosClient.get('/delivery/inventory', {
      params: { order_category: orderCategory }
    });
    return data;
  },

  create: async (payload: { 
    import_order_id: string; 
    product_name: string; 
    total_quantity: number; 
    unit_price?: number; 
    import_cost?: number; 
    payment_method?: string;
    order_category?: 'standard' | 'vegetable';
    delivery_date?: string;
    delivery_time?: string | null;
    vehicles?: Array<{
      vehicle_id: string;
      driver_id: string;
      quantity: number;
    }>;
  }) => {
    const { data } = await axiosClient.post<DeliveryOrder>('/delivery', payload);
    return data;
  },

  update: async (id: string, payload: Partial<DeliveryOrder>) => {
    const { data } = await axiosClient.put<DeliveryOrder>(`/delivery/${id}`, payload);
    return data;
  },

  assignVehicle: async (id: string, payload: { assignments: { vehicle_id: string; driver_id: string; loader_name?: string | null; quantity: number }[], image_url?: string, unit_price?: number }) => {
    const { data } = await axiosClient.put(`/delivery/${id}/assign-vehicle`, payload);
    return data;
  },

  updateQty: async (id: string, payload: { delivered_quantity: number }) => {
    const { data } = await axiosClient.put(`/delivery/${id}/update-qty`, payload);
    return data;
  },

  confirmOrders: async (ids: string[]) => {
    const { data } = await axiosClient.put('/delivery/confirm', { ids });
    return data;
  },

  deleteOrders: async (ids: string[]) => {
    const { data } = await axiosClient.post('/delivery/delete', { ids });
    return data;
  },

  revertVehicle: async (id: string, vehicleId: string) => {
    const { data } = await axiosClient.put(`/delivery/${id}/revert-vehicle`, { vehicle_id: vehicleId });
    return data;
  },
};
