# API Request Examples

This file contains sample requests for testing the Energy Ingestion Engine.

## Base URL
```
http://localhost:3000
```

## 1. Ingest Single Meter Reading

```bash
curl -X POST http://localhost:3000/v1/telemetry/meter \
  -H "Content-Type: application/json" \
  -d '{
    "meterId": "meter_001",
    "kwhConsumedAc": 123.4567,
    "voltage": 234.5,
    "timestamp": "2025-02-10T10:30:00Z"
  }'
```

## 2. Ingest Single Vehicle Reading

```bash
curl -X POST http://localhost:3000/v1/telemetry/vehicle \
  -H "Content-Type: application/json" \
  -d '{
    "vehicleId": "vehicle_001",
    "soc": 75.5,
    "kwhDeliveredDc": 105.2345,
    "batteryTemp": 32.5,
    "timestamp": "2025-02-10T10:30:00Z"
  }'
```

## 3. Bulk Meter Ingestion

```bash
curl -X POST http://localhost:3000/v1/telemetry/meter/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "readings": [
      {
        "meterId": "meter_002",
        "kwhConsumedAc": 123.4567,
        "voltage": 234.5,
        "timestamp": "2025-02-10T10:30:00Z"
      },
      {
        "meterId": "meter_003",
        "kwhConsumedAc": 98.7654,
        "voltage": 238.2,
        "timestamp": "2025-02-10T10:30:00Z"
      }
    ]
  }'
```

## 4. Bulk Vehicle Ingestion

```bash
curl -X POST http://localhost:3000/v1/telemetry/vehicle/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "readings": [
      {
        "vehicleId": "vehicle_002",
        "soc": 75.5,
        "kwhDeliveredDc": 105.2345,
        "batteryTemp": 32.5,
        "timestamp": "2025-02-10T10:30:00Z"
      },
      {
        "vehicleId": "vehicle_003",
        "soc": 45.3,
        "kwhDeliveredDc": 85.6789,
        "batteryTemp": 28.9,
        "timestamp": "2025-02-10T10:30:00Z"
      }
    ]
  }'
```

## 5. Get Meter Current State

```bash
curl http://localhost:3000/v1/telemetry/meter/meter_001/current | jq
```

## 6. Get Vehicle Current State

```bash
curl http://localhost:3000/v1/telemetry/vehicle/vehicle_001/current | jq
```

## 7. Get Vehicle Performance Analytics (24-hour)

```bash
curl http://localhost:3000/v1/analytics/performance/vehicle_001 | jq   # try with other like vehicle_005 etc
```

Expected response:
```json
{
  "vehicleId": "vehicle_001",
  "timeRange": {
    "start": "2025-02-09T10:30:00.000Z",
    "end": "2025-02-10T10:30:00.000Z"
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
  "verdict": "Excellent - System operating at peak efficiency",
  "meta": {
    "queryTimeMs": 45,
    "message": "Data retrieved from partitioned historical tables"
  }
}
```

## 8. Get Fleet Summary

```bash
curl "http://localhost:3000/v1/analytics/fleet/summary?hours=24" | jq
```

## 9. Simulate Realistic Load

Use the test data generator:

```bash
# 100 devices sending data every second
node test-data-generator.js

# 1000 devices sending data every minute (production-like)
NUM_DEVICES=1000 SEND_INTERVAL_MS=60000 node test-data-generator.js

# 10000 devices (full scale)
NUM_DEVICES=10000 SEND_INTERVAL_MS=60000 node test-data-generator.js
```

## 10. Test Validation (Should Fail)

```bash
# Invalid voltage (exceeds max)
curl -X POST http://localhost:3000/v1/telemetry/meter \
  -H "Content-Type: application/json" \
  -d '{
    "meterId": "meter_001",
    "kwhConsumedAc": 123.4567,
    "voltage": 1500,
    "timestamp": "2025-02-10T10:30:00Z"
  }'

# Invalid SoC (exceeds 100%)
curl -X POST http://localhost:3000/v1/telemetry/vehicle \
  -H "Content-Type: application/json" \
  -d '{
    "vehicleId": "vehicle_001",
    "soc": 105.5,
    "kwhDeliveredDc": 105.2345,
    "batteryTemp": 32.5,
    "timestamp": "2025-02-10T10:30:00Z"
  }'
```

