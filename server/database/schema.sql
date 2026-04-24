-- 1. USERS & AUTH (đăng nhập qua API + JWT; password_hash = bcrypt)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  password_hash TEXT, -- bcrypt, do server tạo
  date_of_birth DATE,
  gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other')),
  citizen_id VARCHAR(50),
  job_title VARCHAR(120),
  department VARCHAR(120),
  email TEXT,
  personal_email TEXT,
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(20),
  emergency_contact_relationship VARCHAR(120),
  city VARCHAR(120),
  district VARCHAR(120),
  ward VARCHAR(120),
  address_line TEXT,
  temporary_address TEXT,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin','manager','staff','driver','customer')),
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. WAREHOUSES
CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  capacity INTEGER,
  current_stock INTEGER DEFAULT 0,
  manager_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PRICE SETTINGS
CREATE TABLE public.price_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  value NUMERIC(15,2) NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CUSTOMERS
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES public.profiles(id),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  customer_type VARCHAR(20) DEFAULT 'retail' CHECK (customer_type IN ('retail', 'wholesale', 'grocery')),
  total_orders INTEGER DEFAULT 0,
  total_revenue NUMERIC(15,2) DEFAULT 0,
  debt NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. IMPORT ORDERS (Hàng nhập)
CREATE TABLE public.import_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code VARCHAR(20) NOT NULL,
  order_date DATE NOT NULL,
  order_time TIME NOT NULL,
  sender_name VARCHAR(255),
  receiver_name VARCHAR(255),
  receiver_phone VARCHAR(20),
  receiver_address TEXT,
  license_plate VARCHAR(20),
  driver_name VARCHAR(100),
  supplier_name VARCHAR(255),
  sheet_number VARCHAR(50),
  total_amount NUMERIC(15,2) DEFAULT 0,
  paid_amount NUMERIC(15,2) DEFAULT 0,
  debt_amount NUMERIC(15,2) DEFAULT 0,
  is_custom_amount BOOLEAN DEFAULT false,
  payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  received_by UUID REFERENCES public.profiles(id),
  warehouse_id UUID REFERENCES public.warehouses(id),
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','processing','delivered','returned')),
  customer_id UUID REFERENCES public.customers(id),
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  sg_cash_handover_confirmed_at TIMESTAMPTZ,
  sg_cash_handover_confirmed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.1 IMPORT ORDER ITEMS
CREATE TABLE public.import_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_order_id UUID REFERENCES public.import_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  package_type VARCHAR(50),
  item_note TEXT,
  package_quantity INTEGER,
  weight_kg NUMERIC(10,2),
  quantity INTEGER,
  unit_price NUMERIC(15,2),
  total_amount NUMERIC(15,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.2 VEGETABLE ORDERS (Hàng rau)
CREATE TABLE public.vegetable_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code VARCHAR(20) NOT NULL,
  order_date DATE NOT NULL,
  order_time TIME NOT NULL,
  sender_name VARCHAR(255),
  receiver_name VARCHAR(255),
  receiver_phone VARCHAR(20),
  receiver_address TEXT,
  license_plate VARCHAR(20),
  driver_name VARCHAR(100),
  supplier_name VARCHAR(255),
  sheet_number VARCHAR(50),
  total_amount NUMERIC(15,2) DEFAULT 0,
  paid_amount NUMERIC(15,2) DEFAULT 0,
  debt_amount NUMERIC(15,2) DEFAULT 0,
  is_custom_amount BOOLEAN DEFAULT false,
  payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  received_by UUID REFERENCES public.profiles(id),
  warehouse_id UUID REFERENCES public.warehouses(id),
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','processing','delivered','returned')),
  customer_id UUID REFERENCES public.customers(id),
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.3 VEGETABLE ORDER ITEMS
CREATE TABLE public.vegetable_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vegetable_order_id UUID REFERENCES public.vegetable_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  package_type VARCHAR(50),
  item_note TEXT,
  package_quantity INTEGER,
  weight_kg NUMERIC(10,2),
  quantity INTEGER,
  unit_price NUMERIC(15,2),
  total_amount NUMERIC(15,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. EXPORT ORDERS
CREATE TABLE public.export_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_date DATE NOT NULL,
  export_time TEXT,
  product_id TEXT,                                -- delivery_order_id reference (no FK)
  product_name TEXT,
  quantity NUMERIC(10,2) NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  debt_amount NUMERIC(15,2) DEFAULT 0,
  payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  paid_amount NUMERIC(15,2) DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. DELIVERY ORDERS
CREATE TABLE public.delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_order_id UUID REFERENCES public.import_orders(id),
  vegetable_order_id UUID REFERENCES public.vegetable_orders(id),
  product_name VARCHAR(255) NOT NULL,
  total_quantity INTEGER NOT NULL,
  delivered_quantity INTEGER DEFAULT 0,
  remaining_quantity INTEGER GENERATED ALWAYS AS (total_quantity - delivered_quantity) STORED,
  unit_price NUMERIC(15,2),
  import_cost NUMERIC(15,2),
  order_category VARCHAR(50) DEFAULT 'standard' CHECK (order_category IN ('standard','vegetable')),
  status VARCHAR(30) DEFAULT 'hang_o_sg' CHECK (status IN ('hang_o_sg','can_giao','da_giao')),
  delivery_date DATE,
  delivery_time TIME WITHOUT TIME ZONE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. VEHICLES
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_plate VARCHAR(20) UNIQUE NOT NULL,
  vehicle_type VARCHAR(50),
  load_capacity_ton NUMERIC(10,2),
  goods_categories TEXT[] DEFAULT ARRAY['grocery','vegetable'],
  driver_id UUID REFERENCES public.profiles(id),
  in_charge_id UUID REFERENCES public.profiles(id),
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available','in_transit','maintenance')),
  CONSTRAINT vehicles_goods_categories_check CHECK (
    goods_categories IS NOT NULL
    AND cardinality(goods_categories) > 0
    AND goods_categories <@ ARRAY['grocery','vegetable']::TEXT[]
  ),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. DELIVERY VEHICLES
CREATE TABLE public.delivery_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_order_id UUID REFERENCES public.delivery_orders(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id),
  driver_id UUID REFERENCES public.profiles(id),
  loader_name TEXT,
  assigned_quantity INTEGER,
  expected_amount NUMERIC(15,2) DEFAULT 0,
  image_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
  status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned','in_transit','completed')),
  assigned_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. VEHICLE CHECKINS
CREATE TABLE public.vehicle_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID REFERENCES public.vehicles(id),
  driver_id UUID REFERENCES public.profiles(id),
  checkin_type VARCHAR(10) CHECK (checkin_type IN ('in','out')),
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  address_snapshot TEXT,
  checkin_time TIMESTAMPTZ DEFAULT NOW()
);

-- 11. PAYMENT COLLECTIONS
CREATE TABLE public.payment_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_order_id UUID NOT NULL REFERENCES public.delivery_orders(id),
  customer_id UUID REFERENCES public.customers(id),
  driver_id UUID NOT NULL REFERENCES public.profiles(id),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id),
  expected_amount NUMERIC(15,2) NOT NULL,
  collected_amount NUMERIC(15,2) NOT NULL,
  difference NUMERIC(15,2) GENERATED ALWAYS AS (collected_amount - expected_amount) STORED,
  collected_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','confirmed','self_confirmed')),
  submitted_at TIMESTAMPTZ,
  receiver_id UUID REFERENCES public.profiles(id),
  receiver_type VARCHAR(10) CHECK (receiver_type IN ('staff','manager')),
  confirmed_at TIMESTAMPTZ,
  self_confirm_reason TEXT,
  notes TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_pc_driver_id ON public.payment_collections(driver_id);
CREATE INDEX idx_pc_status ON public.payment_collections(status);
CREATE INDEX idx_pc_collected_at ON public.payment_collections(collected_at);
CREATE INDEX idx_pc_vehicle_id ON public.payment_collections(vehicle_id);

-- Constraint for uniqueness
CREATE UNIQUE INDEX unique_active_collection 
  ON public.payment_collections(delivery_order_id) 
  WHERE status IN ('submitted','confirmed','self_confirmed');

-- 12. LEAVE REQUESTS
CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.profiles(id),
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. SALARY ADVANCES
CREATE TABLE public.salary_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.profiles(id),
  amount NUMERIC(15,2) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  week_start DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. ATTENDANCE
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.profiles(id),
  work_date DATE NOT NULL,
  is_present BOOLEAN DEFAULT false,
  check_in_time TIME,
  check_out_time TIME,
  note TEXT,
  UNIQUE(employee_id, work_date)
);

-- 15. COMPENSATORY ATTENDANCES
CREATE TABLE public.compensatory_attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  check_in_time TIME,
  check_out_time TIME,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, work_date)
);

-- 16. PAYROLL
CREATE TABLE public.payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.profiles(id),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  days_worked INTEGER DEFAULT 0,
  daily_wage NUMERIC(15,2),
  gross_salary NUMERIC(15,2) GENERATED ALWAYS AS (days_worked * daily_wage) STORED,
  total_advances NUMERIC(15,2) DEFAULT 0,
  net_salary NUMERIC(15,2) GENERATED ALWAYS AS (days_worked * daily_wage - total_advances) STORED,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','confirmed','paid')),
  created_by UUID REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. RECEIPTS
CREATE TABLE public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  payment_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view receipts" ON public.receipts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Staff, managers, admins can insert receipts" ON public.receipts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND role IN ('admin', 'manager', 'staff')
    )
  );

CREATE POLICY "Managers and admins can update receipts" ON public.receipts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

-- RPC for Customer Payment FIFO
CREATE OR REPLACE FUNCTION public.handle_customer_payment_fifo_atomic(
    p_customer_id UUID,
    p_amount NUMERIC,
    p_payment_date TIMESTAMPTZ,
    p_notes TEXT,
    p_created_by UUID
) RETURNS JSONB AS $$
DECLARE
    r_export RECORD;
    r_import RECORD;
    v_remaining NUMERIC;
    v_total_offset NUMERIC := 0;
    v_offset_amount NUMERIC;
    v_receipt_id UUID;
    v_payment_for_order NUMERIC;
BEGIN
    -- 0. Auto Offset Import vs Export
    FOR r_import IN 
        SELECT id, debt_amount, paid_amount 
        FROM public.import_orders 
        WHERE customer_id = p_customer_id 
          AND payment_status != 'paid' 
        ORDER BY created_at ASC
    LOOP
        v_remaining := r_import.debt_amount - r_import.paid_amount;
        
        FOR r_export IN 
            SELECT id, debt_amount, paid_amount 
            FROM public.export_orders 
            WHERE customer_id = p_customer_id 
              AND payment_status != 'paid' 
            ORDER BY export_date ASC, created_at ASC
        LOOP
            EXIT WHEN v_remaining <= 0;
            
            v_offset_amount := LEAST(v_remaining, r_export.debt_amount - r_export.paid_amount);
            
            IF v_offset_amount > 0 THEN
                UPDATE public.export_orders 
                SET paid_amount = paid_amount + v_offset_amount
                WHERE id = r_export.id;
                
                UPDATE public.import_orders 
                SET paid_amount = paid_amount + v_offset_amount
                WHERE id = r_import.id;

                v_remaining := v_remaining - v_offset_amount;
                v_total_offset := v_total_offset + v_offset_amount;
            END IF;
        END LOOP;
    END LOOP;

    -- 1. Create Receipt Entry (using TIMESTAMPTZ)
    IF p_amount > 0 THEN
        INSERT INTO public.receipts (customer_id, amount, payment_date, notes, created_by)
        VALUES (p_customer_id, p_amount, p_payment_date, p_notes, p_created_by)
        RETURNING id INTO v_receipt_id;

        -- 2. Distribute payment to remaining old Export Orders (FIFO)
        v_remaining := p_amount;
        FOR r_export IN 
            SELECT id, debt_amount, paid_amount 
            FROM public.export_orders 
            WHERE customer_id = p_customer_id 
              AND payment_status != 'paid' 
            ORDER BY export_date ASC, created_at ASC
        LOOP
            EXIT WHEN v_remaining <= 0;

            v_payment_for_order := LEAST(v_remaining, r_export.debt_amount - r_export.paid_amount);
            
            IF v_payment_for_order > 0 THEN
                UPDATE public.export_orders 
                SET paid_amount = paid_amount + v_payment_for_order
                WHERE id = r_export.id;

                v_remaining := v_remaining - v_payment_for_order;
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'receipt_id', COALESCE(v_receipt_id, NULL),
        'offset_amount', v_total_offset,
        'remaining_unallocated', COALESCE(v_remaining, 0)
    );
END;
$$ LANGUAGE plpgsql;
