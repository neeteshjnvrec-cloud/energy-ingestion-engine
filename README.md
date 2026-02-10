# Energy Ingestion Engine

A high-performance telemetry ingestion system for smart meters and EV fleet management, designed to handle 14.4 million records daily with sub-100ms query performance.

## 🎯 Project Overview

This system provides real-time ingestion and analytics for a fleet ecosystem managing 10,000+ devices (Smart Meters + EV Chargers). It correlates two independent data streams to provide insights into power efficiency and vehicle performance.

### Hardware Context

- **Smart Meter (Grid Side)**: Measures AC power consumed from the utility grid (`kwhConsumedAc`)
- **EV & Charger (Vehicle Side)**: Measures DC power delivered to battery (`kwhDeliveredDc`) and battery state (`SoC`, `batteryTemp`)
- **Power Loss Thesis**: AC consumed is always > DC delivered due to conversion losses. Efficiency below 85% indicates potential hardware faults.

## 🏗️ Architecture Decisions

### 1. Dual-Path Persistence Strategy

The system implements a **hot-cold data separation** pattern to optimize for both write-heavy ingestion and read-heavy analytics:

#### Hot Path (Current State)
- **Tables**: `meter_current_state`, `vehicle_current_state`
- **Operation**: UPSERT (INSERT ... ON CONFLICT UPDATE)
- **Purpose**: Fast dashboard queries without scanning millions of rows
- **Size**: One row per device (~10,000 rows total)
- **Access Pattern**: Random reads for "current status" queries

#### Cold Path (Historical Telemetry)
- **Tables**: `meter_telemetry`, `vehicle_telemetry` 
- **Operation**: INSERT only (append-only log)
- **Purpose**: Complete audit trail for analytics and compliance
- **Size**: 14.4M new rows daily (10,000 devices × 1,440 minutes)
- **Access Pattern**: Time-range scans with partitioning

### 2. Table Partitioning

Both historical tables use **PostgreSQL native partitioning** by day:

```sql
CREATE TABLE meter_telemetry (...) PARTITION BY RANGE (recorded_at);
CREATE TABLE meter_telemetry_2025_02_10 PARTITION OF meter_telemetry 
    FOR VALUES FROM ('2025-02-10') TO ('2025-02-11');
```

**Benefits**:
- **Partition Pruning**: Queries with time ranges only scan relevant partitions
- **Index Optimization**: Smaller indexes per partition improve cache hit rates
- **Maintenance**: Easy archival by detaching old partitions
- **Performance**: 24-hour queries scan ~1-2 partitions instead of entire table

### 3. Composite Indexes

```sql
CREATE INDEX idx_vehicle_telemetry_device_time 
    ON vehicle_telemetry (vehicle_id, recorded_at DESC);
```

This composite index enables efficient queries for a specific device over a time range, which is the primary access pattern for analytics.

### 4. Data Correlation Strategy

Meter and vehicle data are correlated by extracting device numbers:
- `meter_001` correlates with `vehicle_001`
- This is done via string matching in the application layer
- In production, this would use a dedicated `device_mapping` table

## 📊 Handling 14.4 Million Daily Records

### Scale Calculations

```
10,000 devices × 2 streams × 1,440 minutes/day = 28.8M writes/day
Per second: 28.8M / 86,400 = ~333 writes/second
Peak (assuming 2x burst): ~666 writes/second
```

### Write Optimization Strategies

1. **Batch Ingestion API**: `/v1/telemetry/{type}/bulk` accepts arrays of readings
2. **Transaction Batching**: 500 records per transaction to balance atomicity and throughput
3. **Connection Pooling**: 50 concurrent connections to handle burst traffic
4. **Prepared Statements**: Query plan caching via TypeORM query builders
5. **Async Processing**: HTTP 202 Accepted response before DB commit completes

### Read Optimization

The analytics endpoint `/v1/analytics/performance/:vehicleId` demonstrates:

```typescript
// Query uses composite index (vehicle_id, recorded_at)
// Partition pruning limits scan to 1-2 daily partitions
SELECT SUM(kwh_delivered_dc), AVG(battery_temp) 
FROM vehicle_telemetry 
WHERE vehicle_id = 'vehicle_001' 
  AND recorded_at BETWEEN '2025-02-09' AND '2025-02-10'
```

**Performance characteristics**:
- Index seek on `vehicle_id` (O(log n))
- Range scan on `recorded_at` within partition (O(k) where k = rows for this vehicle in 24h)
- Expected: ~1,440 rows scanned per vehicle per day
- **No full table scan**

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- npm or yarn

### 1. Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd energy-ingestion-engine

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```
Note: you can skip step 2 ,3 and 5 if you use my database creds that i shared in email

### 2. Setup Database

```bash
# Create database
createdb energy_platform

# Or using psql:
psql -U postgres -c "CREATE DATABASE energy_platform;"

# Run initialization script
psql -U postgres -d energy_platform -f db.sql

# Or if using a different user:
psql -U fleet_admin -d energy_platform -f db.sql
```

### 3. Configure Environment

Edit `.env` file with your database credentials:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=fleet_admin
DATABASE_PASSWORD=your_password
DATABASE_NAME=energy_platform
```

### 4. Start the Application

```bash
# Development mode (with hot reload)
npm run start:dev

#you can follow 
- `API_EXAMPLES.md` - More API examples
# Production mode
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3000`

### 5. Verify Database Setup

```bash
# Connect to PostgreSQL
psql -U fleet_admin -d energy_platform

# Check tables
\dt

# Check partitions
SELECT tablename FROM pg_tables WHERE tablename LIKE 'meter_telemetry_%';
```

### 6. Send Test Data

```bash
# Install axios for the test generator (if not already installed)
npm install axios

# Run the test data generator (100 devices, 1-second interval)
node test-data-generator.js

# Or customize:
NUM_DEVICES=1000 SEND_INTERVAL_MS=60000 node test-data-generator.js
```

### 7. Query Analytics

```bash
# Get vehicle performance (24-hour summary)
curl "http://localhost:3000/v1/analytics/performance/vehicle_001" | jq

# Get fleet-wide summary (note: URL must be quoted for query parameters)
curl "http://localhost:3000/v1/analytics/fleet/summary?hours=24" | jq
```

## 📡 API Endpoints

### Ingestion Endpoints

#### Single Meter Reading
```http
POST /v1/telemetry/meter
Content-Type: application/json

{
  "meterId": "meter_001",
  "kwhConsumedAc": 123.4567,
  "voltage": 234.5,
  "timestamp": "2025-02-10T10:30:00Z"
}
```

#### Single Vehicle Reading
```http
POST /v1/telemetry/vehicle
Content-Type: application/json

{
  "vehicleId": "vehicle_001",
  "soc": 75.5,
  "kwhDeliveredDc": 105.2345,
  "batteryTemp": 32.5,
  "timestamp": "2025-02-10T10:30:00Z"
}
```

#### Bulk Ingestion (Recommended for Production)
```http
POST /v1/telemetry/meter/bulk
Content-Type: application/json

{
  "readings": [
    { "meterId": "meter_001", ... },
    { "meterId": "meter_002", ... }
  ]
}
```

### Analytics Endpoints

#### Vehicle Performance (24-hour)
```http
GET /v1/analytics/performance/:vehicleId
```

**Response**:
```json
{
  "vehicleId": "vehicle_001",
  "timeRange": {
    "start": "2025-02-09T10:30:00Z",
    "end": "2025-02-10T10:30:00Z"
  },
  "energyMetrics": {
    "totalAcConsumed": 125.5,
    "totalDcDelivered": 112.95,
    "efficiencyRatio": 0.9,
    "efficiencyPercentage": 90.0,
    "powerLoss": 12.55
  },
  "batteryMetrics": {
    "averageTemp": 35.2,
    "minTemp": 28.5,
    "maxTemp": 42.1,
    "readingsCount": 1440
  },
  "dataPoints": 1440,
  "verdict": "Excellent - System operating at peak efficiency"
}
```

#### Fleet Summary
```http
GET /v1/analytics/fleet/summary?hours=24
```

## 🛠️ Development

### Development Commands

```bash
# Install dependencies
npm install

# Start in development mode (with hot reload)
npm run start:dev

# Build for production
npm run build

# Start production server
npm run start:prod

# Run migrations (if needed)
npm run migration:run
```

### Project Structure

```
src/
├── config/                  # Configuration files
│   └── typeorm.config.ts    # Database configuration
├── common/                  # Shared utilities
│   ├── dto/                 # Data Transfer Objects
│   ├── enums/               # Enumerations
│   └── filters/             # Exception filters
├── modules/
│   ├── telemetry/           # Ingestion module
│   │   ├── entities/        # Database entities (hot + cold)
│   │   ├── telemetry.service.ts
│   │   └── telemetry.controller.ts
│   └── analytics/           # Analytics module
│       ├── analytics.service.ts
│       └── analytics.controller.ts
├── app.module.ts            # Root module
└── main.ts                  # Application entry point
```

### Testing

```bash
# Unit tests
npm run test

# Test coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

## 🔍 Monitoring & Performance

### Key Metrics to Monitor

1. **Write Throughput**: Ingestion rate (records/second)
2. **Query Latency**: Analytics endpoint response time
3. **Database Connections**: Active pool connections
4. **Partition Count**: Number of active partitions
5. **Table Bloat**: Monitor vacuum operations

### Performance Benchmarks

Expected performance on modest hardware (4 CPU, 8GB RAM):

- **Ingestion**: 500-1000 records/second sustained
- **Bulk Ingestion**: 2000-5000 records/second in batches
- **Analytics Query**: <100ms for 24-hour vehicle summary
- **Fleet Summary**: <500ms for entire fleet

### Database Maintenance

```sql
-- Analyze tables for query planner
ANALYZE meter_telemetry;
ANALYZE vehicle_telemetry;

-- Check partition sizes
SELECT 
    schemaname || '.' || tablename as partition,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE tablename LIKE 'meter_telemetry_%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Detach old partitions (example: data older than 90 days)
ALTER TABLE meter_telemetry 
    DETACH PARTITION meter_telemetry_2024_11_01;
```

## 🚨 Production Considerations

### Security
- [ ] Enable SSL/TLS for database connections
- [ ] Implement API authentication (JWT, API keys)
- [ ] Rate limiting on ingestion endpoints
- [ ] Input validation and sanitization (already implemented via class-validator)

### Reliability
- [ ] Implement message queue (RabbitMQ, Kafka) for buffering
- [ ] Add retry logic with exponential backoff
- [ ] Dead letter queue for failed ingestions
- [ ] Health check endpoints for load balancers

### Scalability
- [ ] Horizontal scaling: Multiple API instances behind load balancer
- [ ] Read replicas for analytics queries
- [ ] Connection pooler (PgBouncer) for database connections
- [ ] Caching layer (Redis) for frequently accessed current states

### Automation
- [ ] Automatic partition creation (cronjob or trigger)
- [ ] Automated partition archival to S3/cold storage
- [ ] Monitoring alerts (Prometheus, Grafana)
- [ ] Automated backups and disaster recovery

## 📝 Design Decisions Log

### Why NestJS?
- Enterprise-grade architecture with dependency injection
- TypeScript for type safety and developer experience
- Built-in support for validation, pipes, and guards
- Active ecosystem and excellent documentation

### Why PostgreSQL?
- Native table partitioning (since v10)
- Excellent JSONB support for flexible schemas
- ACID compliance for data integrity
- Superior performance for time-series data with proper indexing

### Why Dual-Path Strategy?
- Separation of concerns: dashboards vs. analytics
- Query performance: O(1) for current state vs. O(log n) for historical
- Cost optimization: hot data in fast storage, cold data can be archived
- Flexibility: can independently scale/optimize each path

### Why Partitioning by Day?
- Matches query patterns (24-hour summaries)
- Manageable partition sizes (~14M rows/day split across 2 tables)
- Easy maintenance window: detach partitions during low-traffic hours
- Balance between too many partitions (overhead) and too few (scan size)



