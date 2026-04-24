import { Request, Response } from 'express';
import { DeliveryService } from './delivery.service';
import { successResponse, errorResponse } from '../../utils/response';
import { z } from 'zod';

const deliveryOrderSchema = z.object({
  import_order_id: z.string().uuid(),
  product_name: z.string().min(1),
  total_quantity: z.number().int().positive(),
  unit_price: z.number().optional(),
  import_cost: z.number().optional(),
  order_category: z.enum(['standard', 'vegetable']).optional().default('standard'),
  delivery_date: z.string().optional(),
  /** HH:mm (24h), optional */
  delivery_time: z.string().optional().nullable(),
  vehicles: z.array(z.object({
    vehicle_id: z.string().uuid(),
    driver_id: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).optional(),
});

const assignVehicleSchema = z.array(z.object({
  vehicle_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  quantity: z.number().int().positive(),
}));

const deliveryOrderUpdateSchema = z.object({
  product_name: z.string().min(1).optional(),
  total_quantity: z.number().int().positive().optional(),
  unit_price: z.number().optional(),
  import_cost: z.number().optional(),
  delivery_date: z.string().optional(),
  delivery_time: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  image_urls: z.array(z.string()).optional().nullable(),
});

export class DeliveryController {
  static async getAllToday(req: Request, res: Response) {
    try {
      const { startDate, endDate, order_category } = req.query as { startDate?: string; endDate?: string; order_category?: string; };
      const data = await DeliveryService.getAllToday(startDate, endDate, order_category, req.user);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const validated = deliveryOrderSchema.parse(req.body);
      const data = await DeliveryService.create(validated, req.user?.id);
      return res.status(201).json(successResponse(data, 'Delivery order created'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const validated = deliveryOrderUpdateSchema.parse(req.body);
      const data = await DeliveryService.update(req.params.id, validated);
      return res.status(200).json(successResponse(data, 'Delivery order updated'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async assignVehicle(req: Request, res: Response) {
    try {
      const singleSchema = z.object({
        vehicle_id: z.string().uuid(),
        driver_id: z.string().uuid(),
        loader_name: z.string().optional().nullable(),
        assigned_quantity: z.number().positive().optional(),
        quantity: z.number().positive().optional(),
        expected_amount: z.number().nonnegative().optional(),
        image_urls: z.array(z.string()).optional(),
      });

      const body = req.body;
      let assignments: any[] = [];
      let image_url: string | null | undefined = undefined;
      let image_urls: string[] | undefined = undefined;
      let export_payment_status: 'unpaid' | 'paid' | undefined = undefined;
      let unit_price: number | undefined = undefined;

      const extractExtras = (src: any) => {
        if (Object.prototype.hasOwnProperty.call(src, 'image_url')) {
          image_url = src.image_url ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(src, 'image_urls')) {
          image_urls = z.array(z.string()).parse(src.image_urls);
        }
        if (Object.prototype.hasOwnProperty.call(src, 'export_payment_status')) {
          export_payment_status = z.enum(['unpaid', 'paid']).parse(src.export_payment_status);
        }
        if (Object.prototype.hasOwnProperty.call(src, 'unit_price')) {
          unit_price = z.number().nonnegative().parse(src.unit_price);
        }
      };

      if (Array.isArray(body)) {
        assignments = z.array(singleSchema).parse(body);
      } else if (body && body.assignments && Array.isArray(body.assignments)) {
        assignments = z.array(singleSchema).parse(body.assignments);
        extractExtras(body);
      } else {
        assignments = [singleSchema.parse(body)];
        if (body) extractExtras(body);
      }

      // Normalize fields for service (use quantity)
      const normalized = assignments.map(a => ({
        vehicle_id: a.vehicle_id,
        driver_id: a.driver_id,
        loader_name: a.loader_name,
        quantity: a.quantity || a.assigned_quantity,
        expected_amount: a.expected_amount || 0,
        image_urls: Array.isArray(a.image_urls) ? a.image_urls.filter(Boolean) : [],
      }));

      const data = await DeliveryService.assignVehicles(
        req.params.id as string,
        normalized,
        image_url,
        req.user?.id,
        export_payment_status,
        unit_price,
        image_urls
      );
      return res.status(200).json(successResponse(data, 'Vehicles assigned'));
    } catch (err: any) {
      console.error('Assign vehicle error:', err);
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async updateQty(req: Request, res: Response) {
    try {
      const { delivered_quantity } = z.object({ delivered_quantity: z.number() }).parse(req.body);
      const data = await DeliveryService.updateQuantity(req.params.id as string, delivered_quantity);
      return res.status(200).json(successResponse(data, 'Delivery quantity updated'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async confirmOrders(req: Request, res: Response) {
    try {
      const { ids } = z.object({ ids: z.array(z.string().uuid()) }).parse(req.body);
      const data = await DeliveryService.confirmOrders(ids);
      return res.status(200).json(successResponse(data, 'Đã xác nhận giao hàng'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getInventory(req: Request, res: Response) {
    try {
      const { order_category } = req.query as { order_category?: string };
      const data = await DeliveryService.getInventory(order_category, req.user);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async revertVehicle(req: Request, res: Response) {
    try {
      const { vehicle_id } = z.object({ vehicle_id: z.string().uuid() }).parse(req.body);
      const data = await DeliveryService.revertVehicle(req.params.id, vehicle_id);
      return res.status(200).json(successResponse(data, 'Đã hoàn tác xe'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async deleteOrders(req: Request, res: Response) {
    try {
      const { ids } = z.object({ ids: z.array(z.string().uuid()) }).parse(req.body);
      const data = await DeliveryService.deleteOrders(ids);
      return res.status(200).json(successResponse(data, 'Đã xóa đơn giao hàng'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }
}
