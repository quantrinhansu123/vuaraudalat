-- Giờ giao hàng theo đơn (tùy chọn, 24h).
ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS delivery_time TIME WITHOUT TIME ZONE;
