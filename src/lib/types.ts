export type Product = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  cost_price: number;
  sale_price: number;
  stock: number;
  min_stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  credit_limit: number;
  created_at: string;
};

export type Supplier = {
  id: string;
  name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  contact: string | null;
  created_at: string;
};

export type Purchase = {
  id: string;
  supplier_id: string;
  invoice_number: string | null;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
  purchase_date: string;
  created_at: string;
};

export type PurchaseItem = {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
};

export type Sale = {
  id: string;
  customer_id: string;
  invoice_number: string | null;
  status: string;
  delivery_status: string;
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
  sale_date: string;
  created_at: string;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export type Delivery = {
  id: string;
  sale_id: string;
  status: string;
  delivery_date: string | null;
  address: string | null;
  driver: string | null;
  notes: string | null;
  created_at: string;
};

export type Collection = {
  id: string;
  customer_id: string;
  sale_id: string | null;
  amount: number;
  payment_method: string;
  reference: string | null;
  collection_date: string;
  notes: string | null;
  created_at: string;
};

export type SupplierPayment = {
  id: string;
  supplier_id: string;
  purchase_id: string | null;
  amount: number;
  payment_method: string;
  reference: string | null;
  payment_date: string;
  notes: string | null;
  created_at: string;
};

export type CustomerBalance = {
  id: string;
  name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  credit_limit: number;
  total_purchased: number;
  total_paid: number;
  balance: number;
};

export type SupplierBalance = {
  id: string;
  name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  contact: string | null;
  total_purchased: number;
  total_paid: number;
  balance: number;
};

export type PurchaseWithItems = Purchase & {
  supplier?: Supplier;
  items?: (PurchaseItem & { product?: Product })[];
};

export type SaleWithItems = Sale & {
  customer?: Customer;
  items?: (SaleItem & { product?: Product })[];
};

export type DeliveryWithSale = Delivery & {
  sale?: Sale & { customer?: Customer };
};

export type CollectionWithCustomer = Collection & {
  customer?: Customer;
  sale?: Sale;
};

export type SupplierPaymentWithSupplier = SupplierPayment & {
  supplier?: Supplier;
  purchase?: Purchase;
};

export type InventoryLog = {
  id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string;
  action: 'created' | 'edited' | 'deleted' | 'purchase' | 'sale';
  stock_before: number | null;
  stock_after: number | null;
  delta: number | null;
  changed_by: string | null;
  notes: string | null;
  created_at: string;
};
