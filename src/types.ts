export type SupplierName = 'Supplier A' | 'Supplier B';

/** Shape returned by the mock supplier endpoints */
export interface SupplierHotel {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

/** Shape returned to API clients */
export interface Hotel {
  name: string;
  price: number;
  supplier: SupplierName;
  commissionPct: number;
}
