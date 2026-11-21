# Hotel Offer Orchestrator

Aggregates overlapping hotel offers from two mock suppliers, de-duplicates by hotel name, keeps the best (cheapest) offer per hotel, and supports price-range filtering.

**Stack:** Node.js (TypeScript), Express, Temporal, Redis, Docker Compose

## Architecture

```
Client ──GET /api/hotels──► Express API ──start workflow──► Temporal ──► Worker
                                                                        │
                      ┌─────────────────────────────────────────────────┤
                      ▼ (parallel activities)                            ▼
         GET /supplierA/hotels   GET /supplierB/hotels      dedupe (cheaper wins)
                                                                        │
                                                          save list ──► Redis
                                                                        │
                                                   price filter (ZRANGEBYSCORE) ◄─ Redis
```

- **API service** (`src/server.ts`): public endpoint, mock supplier endpoints, `/health`.
- **Worker** (`src/worker.ts`): runs the workflow and activities.
- **Workflow** (`src/workflows.ts`): calls Supplier A and B in parallel, dedupes by `name`, selects the cheaper offer (or the only one available), saves to Redis, filters by price in Redis.
- **Redis layout** (per city): `hotels:<city>:data` (hash name → JSON) and `hotels:<city>:prices` (sorted set, score = price). Price filtering uses `ZRANGEBYSCORE`, so it happens inside Redis.

## Run (Docker Compose)

```bash
docker compose up --build
```

| Service      | URL / Port              |
|--------------|-------------------------|
| API          | http://localhost:3000   |
| Temporal UI  | http://localhost:8080   |
| Temporal     | localhost:7233          |
| Redis        | localhost:6379          |

The worker retries until Temporal is ready, so the first start may take ~30 seconds.

## Run locally (without Docker for the app)

```bash
docker compose up -d postgresql temporal redis temporal-ui
npm install
npm run dev:api      # terminal 1
npm run dev:worker   # terminal 2
```

## API

### `GET /api/hotels?city=delhi`
```json
[
  { "name": "Holtin", "price": 5340, "supplier": "Supplier B", "commissionPct": 20 },
  { "name": "Radison", "price": 5900, "supplier": "Supplier A", "commissionPct": 13 }
]
```

### `GET /api/hotels?city=delhi&minPrice=5000&maxPrice=6000`
Same response, filtered by price range (`minPrice` and `maxPrice` are each optional).

### `GET /health`
Returns `200` with the status of Supplier A, Supplier B and Redis, or `503` if any is down.
```json
{ "status": "UP", "suppliers": { "Supplier A": "UP", "Supplier B": "UP" }, "redis": "UP" }
```

### Mock suppliers
`GET /supplierA/hotels?city=delhi` and `GET /supplierB/hotels?city=delhi` return static JSON (`hotelId`, `name`, `price`, `city`, `commissionPct`). Hotel names overlap between the two suppliers. Cities available: `delhi`, `mumbai`.

### Simulating a supplier outage
Add `&simulateDown=A` or `&simulateDown=B` to `/api/hotels`. The activity gets a 503, Temporal retries (3 attempts), then the workflow continues with the remaining supplier. The `X-Failed-Suppliers` response header lists the failed supplier. If both are down the API returns `502`.

## Logging & error handling
- Structured JSON logs in all activities (supplier calls, Redis save/filter, failures) and workflow-level error logs.
- Activities throw on failure so Temporal applies its retry policy (exponential backoff, 3 attempts).
- Workflow uses `Promise.allSettled`, so a single supplier failure degrades gracefully.
- Input validation returns `400` for missing city or invalid/inverted price range.

## Postman
Import `postman/hotel-offer-orchestrator.postman_collection.json`. It covers: valid city with overlaps, price filter, city with no results, missing city, simulated supplier A/B outage, health check, and the raw mock suppliers. Collection variable `baseUrl` defaults to `http://localhost:3000`.

## Environment variables
| Variable | Default |
|----------|---------|
| `PORT` | `3000` |
| `TEMPORAL_ADDRESS` | `localhost:7233` |
| `REDIS_URL` | `redis://localhost:6379` |
| `SUPPLIER_BASE_URL` | `http://localhost:$PORT` |
| `TASK_QUEUE` | `hotel-offers` |
| `CACHE_TTL_SECONDS` | `3600` |

## Deployment steps
1. Push this repo to GitHub.
2. On any Docker host: `git clone <repo> && cd hotel-offer-orchestrator && docker compose up --build -d`.
3. Verify: `curl localhost:3000/health` and `curl "localhost:3000/api/hotels?city=delhi"`.
