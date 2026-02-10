# System Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         10,000+ Devices                          │
│  ┌─────────────────┐              ┌─────────────────┐           │
│  │  Smart Meters   │              │   EV Chargers   │           │
│  │  (Grid Side)    │              │  (Vehicle Side) │           │
│  │                 │              │                 │           │
│  │  - kwhConsumedAc│              │  - soc          │           │
│  │  - voltage      │              │  - kwhDeliveredDc│          │
│  │                 │              │  - batteryTemp  │           │
│  └────────┬────────┘              └────────┬────────┘           │
│           │ 60s heartbeat                  │ 60s heartbeat      │
└───────────┼────────────────────────────────┼────────────────────┘
            │                                │
            ▼                                ▼
   ┌────────────────────────────────────────────────┐
   │          API Gateway / Load Balancer           │
   │         (Future: nginx, AWS ALB, etc.)         │
   └────────────────────┬───────────────────────────┘
                        │
                        ▼
   ┌─────────────────────────────────────────────────┐
   │           NestJS Application Layer              │
   │  ┌──────────────────┐   ┌──────────────────┐   │
   │  │ Telemetry Module │   │ Analytics Module │   │
   │  │                  │   │                  │   │
   │  │ - Validation     │   │ - Aggregation    │   │
   │  │ - Dual-path      │   │ - Correlation    │   │
   │  │   persistence    │   │ - Efficiency     │   │
   │  │ - Batch handling │   │   calculation    │   │
   │  └─────────┬────────┘   └────────┬─────────┘   │
   └────────────┼─────────────────────┼──────────────┘
                │                     │
                ▼                     ▼
   ┌──────────────────────────────────────────────────┐
   │            PostgreSQL Database                   │
   │                                                   │
   │  ┌─────────────────────────────────────────┐    │
   │  │          HOT DATA (Current State)       │    │
   │  │                                          │    │
   │  │  ┌─────────────────────────────────┐    │    │
   │  │  │  meter_current_state (~10K rows)│    │    │
   │  │  │  - UPSERT on every heartbeat    │    │    │
   │  │  │  - Fast O(1) lookups            │    │    │
   │  │  └─────────────────────────────────┘    │    │
   │  │                                          │    │
   │  │  ┌─────────────────────────────────┐    │    │
   │  │  │ vehicle_current_state (~10K rows)│   │    │
   │  │  │  - UPSERT on every heartbeat    │    │    │
   │  │  │  - Dashboard queries            │    │    │
   │  │  └─────────────────────────────────┘    │    │
   │  └─────────────────────────────────────────┘    │
   │                                                   │
   │  ┌─────────────────────────────────────────┐    │
   │  │      COLD DATA (Historical Audit)       │    │
   │  │                                          │    │
   │  │  ┌─────────────────────────────────┐    │    │
   │  │  │  meter_telemetry (partitioned)  │    │    │
   │  │  │  - INSERT only (append-only)    │    │    │
   │  │  │  - Daily partitions             │    │    │
   │  │  │  - 14.4M rows/day               │    │    │
   │  │  │                                 │    │    │
   │  │  │  ├─ meter_telemetry_2025_02_10 │    │    │
   │  │  │  ├─ meter_telemetry_2025_02_09 │    │    │
   │  │  │  ├─ meter_telemetry_2025_02_08 │    │    │
   │  │  │  └─ ... (older partitions)      │    │    │
   │  │  └─────────────────────────────────┘    │    │
   │  │                                          │    │
   │  │  ┌─────────────────────────────────┐    │    │
   │  │  │ vehicle_telemetry (partitioned) │    │    │
   │  │  │  - INSERT only (append-only)    │    │    │
   │  │  │  - Daily partitions             │    │    │
   │  │  │  - 14.4M rows/day               │    │    │
   │  │  │                                 │    │    │
   │  │  │  ├─ vehicle_telemetry_2025_02_10│    │    │
   │  │  │  ├─ vehicle_telemetry_2025_02_09│    │    │
   │  │  │  └─ ...                         │    │    │
   │  │  └─────────────────────────────────┘    │    │
   │  └─────────────────────────────────────────┘    │
   └──────────────────────────────────────────────────┘
```

## Data Flow Diagram

### Ingestion Flow (Write Path)

```
Device → API Endpoint → Validation → Transaction → [HOT + COLD] → Response
                         (DTO)         (ACID)       Dual Write      (202)

Detailed Steps:
1. HTTP POST /v1/telemetry/{meter|vehicle}
2. class-validator validates payload
3. Begin database transaction
4. UPSERT to current_state table (HOT)
   └─ INSERT ... ON CONFLICT (device_id) DO UPDATE
5. INSERT to telemetry table (COLD)
   └─ Partition routing based on timestamp
6. Commit transaction
7. Return HTTP 202 Accepted

Performance: ~10-50ms per single record
Performance (bulk): ~100-200ms per 500-record batch
```

### Analytics Flow (Read Path)

```
API Request → Query Builder → [Partition Pruning] → Aggregation → Response
                              Index Seek            (SUM, AVG)     (JSON)

Detailed Steps:
1. GET /v1/analytics/performance/:vehicleId
2. Calculate time range (now - 24 hours)
3. Query vehicle_telemetry:
   WHERE vehicle_id = :id 
     AND recorded_at BETWEEN :start AND :end
   - Uses composite index (vehicle_id, recorded_at)
   - Scans only relevant partitions (~1-2 days)
   - Returns ~1,440 rows for 24 hours
4. Query meter_telemetry (correlated meter)
5. Calculate efficiency metrics in application layer
6. Return JSON with verdict

Performance: <100ms for 24-hour query
```

## Database Schema Details

### Entity Relationships

```
┌──────────────────────┐        ┌──────────────────────┐
│ meter_current_state  │        │ vehicle_current_state│
├──────────────────────┤        ├──────────────────────┤
│ meter_id (PK)        │        │ vehicle_id (PK)      │
│ kwh_consumed_ac      │        │ soc                  │
│ voltage              │        │ kwh_delivered_dc     │
│ last_reading_at      │        │ battery_temp         │
│ created_at           │        │ last_reading_at      │
│ updated_at           │        │ created_at           │
└──────────────────────┘        │ updated_at           │
                                └──────────────────────┘
         │                               │
         │ Correlation via              │
         │ device number                │
         │ (meter_001 ↔ vehicle_001)   │
         │                               │
         ▼                               ▼
┌──────────────────────┐        ┌──────────────────────┐
│ meter_telemetry      │        │ vehicle_telemetry    │
│ (partitioned)        │        │ (partitioned)        │
├──────────────────────┤        ├──────────────────────┤
│ id (PK)              │        │ id (PK)              │
│ meter_id             │        │ vehicle_id           │
│ kwh_consumed_ac      │        │ soc                  │
│ voltage              │        │ kwh_delivered_dc     │
│ recorded_at (PK)     │        │ battery_temp         │
│ ingested_at          │        │ recorded_at (PK)     │
└──────────────────────┘        │ ingested_at          │
                                └──────────────────────┘

Indexes:
├─ idx_meter_current_last_reading (last_reading_at DESC)
├─ idx_vehicle_current_last_reading (last_reading_at DESC)
├─ idx_meter_telemetry_device_time (meter_id, recorded_at DESC)
└─ idx_vehicle_telemetry_device_time (vehicle_id, recorded_at DESC)
```

## Scaling Considerations

### Vertical Scaling (Current Implementation)
- Database: Increase RAM for larger buffer pool
- API: Increase CPU cores for concurrent request handling
- Connection Pool: Tune based on available resources

### Horizontal Scaling (Future)
```
                    ┌─────────────┐
                    │Load Balancer│
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ API Node │    │ API Node │    │ API Node │
    │    1     │    │    2     │    │    3     │
    └─────┬────┘    └─────┬────┘    └─────┬────┘
          │               │               │
          └───────────────┼───────────────┘
                          ▼
                  ┌───────────────┐
                  │   PgBouncer   │
                  │ (Connection   │
                  │   Pooler)     │
                  └───────┬───────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │PostgreSQL│    │PostgreSQL│    │PostgreSQL│
    │  Primary │───▶│ Replica  │    │ Replica  │
    │  (Write) │    │ (Read)   │    │ (Read)   │
    └──────────┘    └──────────┘    └──────────┘
```

### Caching Layer (Future)
```
API Request
    │
    ▼
┌────────────┐     Cache Miss      ┌──────────┐
│   Redis    │◄───────────────────▶│PostgreSQL│
│   Cache    │                      │          │
└────────────┘                      └──────────┘
    │
    │ Cache Hit
    ▼
Fast Response (current_state queries)
```

## Technology Stack Rationale

| Component | Technology | Reason |
|-----------|-----------|--------|
| **Framework** | NestJS | Enterprise architecture, DI, TypeScript, scalability |
| **Language** | TypeScript | Type safety, IDE support, maintainability |
| **Database** | PostgreSQL 16 | Native partitioning, ACID, excellent time-series support |
| **Validation** | class-validator | Declarative validation, type-safe |
| **ORM** | TypeORM | Query builder, migrations, entity management |
| **Container** | Docker | Reproducible environments, easy deployment |

## Performance Characteristics

### Write Performance
- Single insert: ~10-20ms
- Batch insert (500): ~100-200ms
- Theoretical max: 5,000 writes/second (with batching)
- Actual sustainable: 1,000-2,000 writes/second

### Read Performance
- Current state lookup: <5ms (indexed primary key)
- 24-hour analytics: <100ms (partition pruning + index)
- Fleet summary: <500ms (parallel aggregation)

### Storage Growth
- Daily: ~14.4M rows × 2 tables = 28.8M rows
- Monthly: ~864M rows
- Yearly: ~10.5B rows
- With partitioning: Each partition ~200-500MB
- Compression: TOAST compression reduces by ~30-50%

## Monitoring Points

```
┌─────────────────────────────────────────┐
│           Prometheus Metrics             │
├─────────────────────────────────────────┤
│ - http_requests_total                   │
│ - http_request_duration_seconds         │
│ - database_query_duration_seconds       │
│ - database_connection_pool_size         │
│ - ingestion_batch_size                  │
│ - partition_count                       │
│ - table_size_bytes                      │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│            Grafana Dashboard             │
│                                          │
│  ┌────────────────┐  ┌────────────────┐ │
│  │ Ingestion Rate │  │  Query Latency │ │
│  └────────────────┘  └────────────────┘ │
│  ┌────────────────┐  ┌────────────────┐ │
│  │ Active Devices │  │  DB Conn Pool  │ │
│  └────────────────┘  └────────────────┘ │
└─────────────────────────────────────────┘
```
