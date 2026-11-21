import { Router } from 'express';
import { SupplierHotel } from './types';

// Static mock data. Hotel names deliberately overlap between A and B.
export const supplierAData: SupplierHotel[] = [
  { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
  { hotelId: 'a2', name: 'Radison', price: 5900, city: 'delhi', commissionPct: 13 },
  { hotelId: 'a3', name: 'Taj Palace', price: 12000, city: 'delhi', commissionPct: 12 },
  { hotelId: 'a4', name: 'Lemon Tree', price: 4500, city: 'delhi', commissionPct: 9 },
  { hotelId: 'a5', name: 'Trident', price: 9500, city: 'mumbai', commissionPct: 11 },
  { hotelId: 'a6', name: 'Holtin', price: 6500, city: 'mumbai', commissionPct: 10 },
];

export const supplierBData: SupplierHotel[] = [
  { hotelId: 'b1', name: 'Holtin', price: 5340, city: 'delhi', commissionPct: 20 },
  { hotelId: 'b2', name: 'Radison', price: 6100, city: 'delhi', commissionPct: 15 },
  { hotelId: 'b3', name: 'Oberoi', price: 15000, city: 'delhi', commissionPct: 14 },
  { hotelId: 'b4', name: 'Lemon Tree', price: 4700, city: 'delhi', commissionPct: 8 },
  { hotelId: 'b5', name: 'Trident', price: 9100, city: 'mumbai', commissionPct: 12 },
  { hotelId: 'b6', name: 'Ginger', price: 3200, city: 'mumbai', commissionPct: 7 },
];

/**
 * Mock supplier endpoints:
 *   GET /supplierA/hotels?city=delhi
 *   GET /supplierB/hotels?city=delhi
 * Add `?fail=true` to simulate the supplier being down (HTTP 503).
 */
export function supplierRouter(): Router {
  const router = Router();

  const handler = (data: SupplierHotel[]) => (req: any, res: any) => {
    if (req.query.fail === 'true') {
      return res.status(503).json({ error: 'Supplier unavailable (simulated)' });
    }
    const city = typeof req.query.city === 'string' ? req.query.city.toLowerCase() : undefined;
    res.json(city ? data.filter((h) => h.city === city) : data);
  };

  router.get('/supplierA/hotels', handler(supplierAData));
  router.get('/supplierB/hotels', handler(supplierBData));
  return router;
}
