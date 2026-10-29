-- =========================================================================
-- HỆ THỐNG QUẢN LÝ THẺ KHO & KITTING KHO (THE KHO SMART WMS)
-- SUPABASE SQL DATABASE SCHEMA
-- Chạy toàn bộ file này trong phần SQL Editor trên Supabase Dashboard.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. BẢNG TỔNG HỢP DỮ LIỆU KEY-VALUE (THEKHO_APP_DATA)
-- Bảng này hỗ trợ đồng bộ toàn bộ trạng thái ứng dụng một cách nhanh chóng.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.thekho_app_data (
    key VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kích hoạt Row Level Security (RLS)
ALTER TABLE public.thekho_app_data ENABLE ROW LEVEL SECURITY;

-- Cho phép đọc/ghi dữ liệu công khai (Anonymously Accessible)
CREATE POLICY "Allow public read access on thekho_app_data"
    ON public.thekho_app_data FOR SELECT USING (true);

CREATE POLICY "Allow public insert/update/delete access on thekho_app_data"
    ON public.thekho_app_data FOR ALL USING (true) WITH CHECK (true);


-- -------------------------------------------------------------------------
-- 2. BẢNG LINH KIỆN & VẬT TƯ (PARTS)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parts (
    id VARCHAR(255) PRIMARY KEY,
    code VARCHAR(100) NOT NULL,
    name TEXT NOT NULL,
    group_name VARCHAR(100) DEFAULT 'Khác',
    unit VARCHAR(50) DEFAULT 'Cái',
    current_stock NUMERIC(15, 2) DEFAULT 0,
    qty_ng NUMERIC(15, 2) DEFAULT 0,
    min_stock NUMERIC(15, 2) DEFAULT 0,
    max_stock NUMERIC(15, 2) DEFAULT 0,
    location TEXT DEFAULT 'Kho chính',
    locations JSONB DEFAULT '[]'::jsonb,
    unit_price NUMERIC(15, 2) DEFAULT 0,
    supplier TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tự động thêm cột qty_ng nếu bảng đã tồn tại từ trước:
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS qty_ng NUMERIC(15, 2) DEFAULT 0;

ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on parts" ON public.parts FOR ALL USING (true) WITH CHECK (true);


-- -------------------------------------------------------------------------
-- 3. BẢNG GIAO DỊCH NHẬP / XUẤT KHO (TRANSACTIONS)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
    id VARCHAR(255) PRIMARY KEY,
    part_id VARCHAR(255) REFERENCES public.parts(id) ON DELETE CASCADE,
    part_code VARCHAR(100) NOT NULL,
    part_name TEXT NOT NULL,
    unit VARCHAR(50) DEFAULT 'Cái',
    type VARCHAR(30) NOT NULL,
    quantity NUMERIC(15, 2) NOT NULL,
    date TIMESTAMPTZ DEFAULT NOW(),
    person VARCHAR(255) NOT NULL,
    production_order VARCHAR(255) DEFAULT '',
    reason_or_purpose TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    location_id VARCHAR(255) DEFAULT '',
    stock_before NUMERIC(15, 2) DEFAULT 0,
    stock_after NUMERIC(15, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nới lỏng hoặc cập nhật ràng buộc type nếu có
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check 
  CHECK (type IN ('IN', 'OUT', 'AUDIT_ADJUSTMENT', 'TRANSFER_TO_NG', 'IMPORT_NG', 'EXPORT_NG_RTV', 'EXPORT_NG_SCRAP'));

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);


-- -------------------------------------------------------------------------
-- 4. BẢNG CẤU HÌNH HỆ THỐNG (SETTINGS)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
    id VARCHAR(100) PRIMARY KEY DEFAULT 'app_settings',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);


-- -------------------------------------------------------------------------
-- 5. BẢNG KIỂM KÊ KHO (STOCK_CHECKS)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_checks (
    id VARCHAR(255) PRIMARY KEY,
    part_id VARCHAR(255) NOT NULL,
    system_stock NUMERIC(15, 2) NOT NULL,
    actual_stock NUMERIC(15, 2) NOT NULL,
    difference NUMERIC(15, 2) NOT NULL,
    check_date TIMESTAMPTZ DEFAULT NOW(),
    performed_by VARCHAR(255) NOT NULL,
    note TEXT DEFAULT ''
);

ALTER TABLE public.stock_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on stock_checks" ON public.stock_checks FOR ALL USING (true) WITH CHECK (true);


-- -------------------------------------------------------------------------
-- 6. BẢNG HÀNG CONT / BATCH NHẬP KHO (CONTAINER_BATCHES)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.container_batches (
    id VARCHAR(255) PRIMARY KEY,
    container_number VARCHAR(100) NOT NULL,
    part_code VARCHAR(100) NOT NULL,
    part_name TEXT NOT NULL,
    unit VARCHAR(50) DEFAULT 'Cái',
    quantity NUMERIC(15, 2) NOT NULL,
    received_date TIMESTAMPTZ DEFAULT NOW(),
    supplier VARCHAR(255) DEFAULT '',
    status VARCHAR(50) DEFAULT 'IN_PROGRESS',
    notes TEXT DEFAULT ''
);

ALTER TABLE public.container_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on container_batches" ON public.container_batches FOR ALL USING (true) WITH CHECK (true);


-- -------------------------------------------------------------------------
-- 7. BẢNG HÀNG ĐỢI BÓC TÁCH KITTING (KITTING_QUEUE)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitting_queue (
    id VARCHAR(255) PRIMARY KEY,
    transaction_id VARCHAR(255) DEFAULT '',
    part_code VARCHAR(100) NOT NULL,
    part_name TEXT NOT NULL,
    unit VARCHAR(50) DEFAULT 'Cái',
    raw_quantity NUMERIC(15, 2) NOT NULL,
    kitted_quantity NUMERIC(15, 2) DEFAULT 0,
    scrap_quantity NUMERIC(15, 2) DEFAULT 0,
    buffer_location VARCHAR(255) DEFAULT '',
    status VARCHAR(50) DEFAULT 'PENDING_KITTING',
    operator_name VARCHAR(255) DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.kitting_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on kitting_queue" ON public.kitting_queue FOR ALL USING (true) WITH CHECK (true);


-- -------------------------------------------------------------------------
-- 8. INDEX TỐI ƯU HÓA HIỆU NĂNG TRUY VẤN
-- -------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_parts_code ON public.parts(code);
CREATE INDEX IF NOT EXISTS idx_transactions_part_id ON public.transactions(part_id);
CREATE INDEX IF NOT EXISTS idx_transactions_part_code ON public.transactions(part_code);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(date);
CREATE INDEX IF NOT EXISTS idx_kitting_part_code ON public.kitting_queue(part_code);

-- -------------------------------------------------------------------------
-- 9. RPC FUNCTION: TỔNG HỢP BÁO CÁO XUẤT - NHẬP - TỒN (XNT) TẠI SERVER
-- Triệt tiêu hoàn toàn việc kéo toàn bộ transactions về client để cộng trừ.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_xnt_summary(
    p_from_date TIMESTAMPTZ DEFAULT NULL,
    p_to_date TIMESTAMPTZ DEFAULT NULL,
    p_part_code VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    total_in NUMERIC,
    total_out NUMERIC,
    total_transactions BIGINT,
    distinct_parts BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(CASE WHEN t.type IN ('IN', 'IMPORT_NG') THEN t.quantity ELSE 0 END), 0)::NUMERIC AS total_in,
        COALESCE(SUM(CASE WHEN t.type IN ('OUT', 'EXPORT_NG_RTV', 'EXPORT_NG_SCRAP') THEN t.quantity ELSE 0 END), 0)::NUMERIC AS total_out,
        COUNT(*)::BIGINT AS total_transactions,
        COUNT(DISTINCT t.part_code)::BIGINT AS distinct_parts
    FROM public.transactions t
    WHERE (p_from_date IS NULL OR t.date >= p_from_date)
      AND (p_to_date IS NULL OR t.date <= p_to_date)
      AND (p_part_code IS NULL OR t.part_code = p_part_code);
END;
$$;

-- Cấp quyền gọi hàm cho client
GRANT EXECUTE ON FUNCTION public.get_xnt_summary TO anon, authenticated, service_role;

