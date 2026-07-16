# Phan tich loi timeout `/api/market-dashboard`

## Loi dang gap

- Loi tren Vercel: `Vercel Runtime Timeout Error: Task timed out after 10 seconds`
- Endpoint bi anh huong: `/api/market-dashboard`

## Nguyen nhan goc

Request path cu rebuild dashboard ngay trong luc nguoi dung cho response:

1. API doc snapshot tu Supabase
2. Neu `stock_latest_snapshot` cham/timeout, code fallback sang scan `stock_indicators`
3. Sau do request tiep tuc tinh RS, screening, warnings, meta ngay trong Vercel function

Voi env that, duong fallback nay da mat khoang `8.8s`, rat sat budget 10s cua Vercel. Chi can Supabase cham hon mot chut la request se timeout.

## Phan nao gay cham

- `Supabase Query`: nut that lon nhat, dac biet khi fallback sang bang raw
- `Data Processing`: co ton chi phi them vi request con phai tinh payload sau khi lay raw rows
- `VNStock Fetch`: khong nam trong request path, no thuoc pipeline offline
- `Insert/Update`: khong nam trong request path

## Cach da sua

### 1. API chi doc cache nhanh

`/api/market-dashboard` bay gio:

- uu tien memory cache
- neu khong co thi doc 1 row moi nhat tu `market_dashboard_cache`
- neu cache chua san sang thi tra `503 MARKET_DASHBOARD_CACHE_MISS` nhanh

Request path khong con rebuild dashboard tu `stock_indicators`.

### 2. Tach luong cap nhat cache ra background job

Da them:

- `src/server/marketDashboardCacheService.js`
- `scripts/refresh-market-dashboard-cache.js`

Script nay rebuild payload o luong rieng roi upsert vao Supabase cache table.

### 3. Them migration SQL cho cache table

Da them file `sql/market_dashboard_cache.sql` de tao bang cache JSON precomputed.

### 4. Them timing log

Da co timing log cho:

- `Supabase Query`
- `Data Processing`
- `Insert/Update`
- `Total Request`

## Cach deploy

1. Chay `sql/market_dashboard_cache.sql` tren Supabase
2. Deploy code moi
3. Chay `npm run refresh:market-dashboard-cache` it nhat 1 lan de prime cache
4. Sau do `/api/market-dashboard` se doc payload precomputed thay vi rebuild trong request
