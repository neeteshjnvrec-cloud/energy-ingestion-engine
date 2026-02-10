# Testing Guide

This guide shows you how to test the Energy Ingestion Engine using both the test data generator and manual API requests.

## Prerequisites

1. **Start the application**:
   ```bash
   npm run start:dev
   ```

2. **Verify services are running**:
   ```bash
   # Check API is running
   curl http://localhost:3000/v1/telemetry/meter
   # Should return a validation error (expected - means API is up)

  
   ```

## Method 1: Using Test Data Generator (Recommended)

The `test-data-generator.js` script simulates realistic telemetry data from multiple devices.

### Basic Usage

```bash
# Install axios if not already installed
npm install axios

# Run with default settings (100 devices, 1-second interval)
node test-data-generator.js
```

### Custom Configuration

You can customize the generator using environment variables:

```bash
# Generate data for 1000 devices, sending every 60 seconds (realistic)
NUM_DEVICES=1000 SEND_INTERVAL_MS=60000 node test-data-generator.js

# Generate data for 10 devices, sending every 5 seconds (for quick testing)
NUM_DEVICES=10 SEND_INTERVAL_MS=5000 node test-data-generator.js

# Point to a different API URL
API_URL=http://localhost:3000 NUM_DEVICES=100 node test-data-generator.js
```

### What the Generator Does

- Creates simulated devices (meters + vehicles)
- Generates realistic telemetry data:
  - Meter readings: AC consumption, voltage
  - Vehicle readings: SoC, DC delivery, battery temperature
  - Maintains efficiency ratios (85-95%)
  - Simulates charging/standby states
- Sends data in bulk batches for efficiency
- Runs continuously until stopped (Ctrl+C)

### Example Output

```
🚀 Starting Telemetry Simulator
📊 Devices: 100
⏱️  Interval: 1000ms
🎯 Target: http://localhost:3000

✓ Sent 100 meter + 100 vehicle readings [Meter: 202, Vehicle: 202]
✓ Sent 100 meter + 100 vehicle readings [Meter: 202, Vehicle: 202]
...
```

## Method 2: Manual API Requests

### Single Meter Reading

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

**Expected Response**:
```json
{
  "status": "accepted",
  "message": "Meter telemetry ingested successfully",
  "meterId": "meter_001",
  "timestamp": "2025-02-10T10:30:00.000Z"
}
```

### Single Vehicle Reading

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

**Expected Response**:
```json
{
  "status": "accepted",
  "message": "Vehicle telemetry ingested successfully",
  "vehicleId": "vehicle_001",
  "soc": 75.5,
  "timestamp": "2025-02-10T10:30:00.000Z"
}
```

### Bulk Meter Readings (Recommended for Production)

```bash
curl -X POST http://localhost:3000/v1/telemetry/meter/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "readings": [
      {
        "meterId": "meter_001",
        "kwhConsumedAc": 123.4567,
        "voltage": 234.5,
        "timestamp": "2025-02-10T10:30:00Z"
      },
      {
        "meterId": "meter_002",
        "kwhConsumedAc": 456.7890,
        "voltage": 230.2,
        "timestamp": "2025-02-10T10:30:00Z"
      },
      {
        "meterId": "meter_003",
        "kwhConsumedAc": 789.0123,
        "voltage": 235.8,
        "timestamp": "2025-02-10T10:30:00Z"
      }
    ]
  }'
```

**Expected Response**:
```json
{
  "status": "accepted",
  "message": "Bulk meter telemetry ingested successfully",
  "count": 3
}
```

### Bulk Vehicle Readings

```bash
curl -X POST http://localhost:3000/v1/telemetry/vehicle/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "readings": [
      {
        "vehicleId": "vehicle_001",
        "soc": 75.5,
        "kwhDeliveredDc": 105.2345,
        "batteryTemp": 32.5,
        "timestamp": "2025-02-10T10:30:00Z"
      },
      {
        "vehicleId": "vehicle_002",
        "soc": 80.0,
        "kwhDeliveredDc": 110.5000,
        "batteryTemp": 35.2,
        "timestamp": "2025-02-10T10:30:00Z"
      }
    ]
  }'
```

## Method 3: Using a Script (Bash/PowerShell)

### Bash Script Example

Create `test-ingestion.sh`:

```bash
#!/bin/bash

API_URL="http://localhost:3000"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "Testing meter ingestion..."
curl -X POST "${API_URL}/v1/telemetry/meter" \
  -H "Content-Type: application/json" \
  -d "{
    \"meterId\": \"meter_001\",
    \"kwhConsumedAc\": 123.4567,
    \"voltage\": 234.5,
    \"timestamp\": \"${TIMESTAMP}\"
  }" | jq

echo -e "\nTesting vehicle ingestion..."
curl -X POST "${API_URL}/v1/telemetry/vehicle" \
  -H "Content-Type: application/json" \
  -d "{
    \"vehicleId\": \"vehicle_001\",
    \"soc\": 75.5,
    \"kwhDeliveredDc\": 105.2345,
    \"batteryTemp\": 32.5,
    \"timestamp\": \"${TIMESTAMP}\"
  }" | jq
```

Run it:
```bash
chmod +x test-ingestion.sh
./test-ingestion.sh
```

## Verifying Data Ingestion

### Check Current State (Hot Data)

```bash
# Check meter current state
curl http://localhost:3000/v1/telemetry/meter/meter_001/current | jq

# Check vehicle current state
curl http://localhost:3000/v1/telemetry/vehicle/vehicle_001/current | jq
```

### Check Historical Data (Cold Data)

```bash
# Connect to database
psql -U fleet_admin -d energy_platform

# Check meter telemetry count
SELECT COUNT(*) FROM meter_telemetry;

# Check vehicle telemetry count
SELECT COUNT(*) FROM vehicle_telemetry;

# Check recent meter readings
SELECT meter_id, kwh_consumed_ac, voltage, recorded_at 
FROM meter_telemetry 
ORDER BY recorded_at DESC 
LIMIT 10;

# Check recent vehicle readings
SELECT vehicle_id, soc, kwh_delivered_dc, battery_temp, recorded_at 
FROM vehicle_telemetry 
ORDER BY recorded_at DESC 
LIMIT 10;

# Check partitions created
SELECT tablename 
FROM pg_tables 
WHERE tablename LIKE 'meter_telemetry_%' 
ORDER BY tablename DESC;
```

### Test Analytics Endpoint

```bash
# Get vehicle performance (requires data from last 24 hours)
curl http://localhost:3000/v1/analytics/performance/vehicle_001 | jq

# Get fleet summary (note: URL must be quoted for query parameters in zsh/bash)
curl "http://localhost:3000/v1/analytics/fleet/summary?hours=24" | jq
```

## Testing Scenarios

### Scenario 1: Single Device Test

```bash
# Send a few readings for one device
for i in {1..5}; do
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  curl -X POST http://localhost:3000/v1/telemetry/meter \
    -H "Content-Type: application/json" \
    -d "{
      \"meterId\": \"meter_001\",
      \"kwhConsumedAc\": $((100 + i * 10)).4567,
      \"voltage\": 234.5,
      \"timestamp\": \"${TIMESTAMP}\"
    }"
  
  curl -X POST http://localhost:3000/v1/telemetry/vehicle \
    -H "Content-Type: application/json" \
    -d "{
      \"vehicleId\": \"vehicle_001\",
      \"soc\": $((70 + i)),
      \"kwhDeliveredDc\": $((90 + i * 8)).2345,
      \"batteryTemp\": $((30 + i)),
      \"timestamp\": \"${TIMESTAMP}\"
    }"
  
  sleep 1
done

# Check current state
curl http://localhost:3000/v1/telemetry/meter/meter_001/current | jq
curl http://localhost:3000/v1/telemetry/vehicle/vehicle_001/current | jq
```

### Scenario 2: Bulk Load Test

```bash
# Generate bulk data file
cat > bulk-test.json <<EOF
{
  "readings": [
EOF

for i in {1..100}; do
  DEVICE_ID=$(printf "%03d" $i)
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  if [ $i -gt 1 ]; then
    echo "," >> bulk-test.json
  fi
  
  cat >> bulk-test.json <<EOF
    {
      "meterId": "meter_${DEVICE_ID}",
      "kwhConsumedAc": $((100 + i)).4567,
      "voltage": $((220 + i % 20)),
      "timestamp": "${TIMESTAMP}"
    }
EOF
done

echo "  ]" >> bulk-test.json
echo "}" >> bulk-test.json

# Send bulk data
curl -X POST http://localhost:3000/v1/telemetry/meter/bulk \
  -H "Content-Type: application/json" \
  -d @bulk-test.json | jq
```

### Scenario 3: Stress Test

```bash
# Run test data generator with many devices
NUM_DEVICES=1000 SEND_INTERVAL_MS=100 node test-data-generator.js

# In another terminal, monitor the database
watch -n 1 'psql -U fleet_admin -d energy_platform -c "SELECT COUNT(*) FROM meter_telemetry;"'
```

## Common Issues and Solutions

### Issue: "no partition found" error

**Solution**: The partition will be created automatically. If it persists:
```bash
# Check if partition exists
psql -U fleet_admin -d energy_platform -c "
SELECT tablename FROM pg_tables WHERE tablename LIKE 'meter_telemetry_%';
"

# Manually create partition if needed (example for today)
psql -U fleet_admin -d energy_platform -c "
CREATE TABLE IF NOT EXISTS meter_telemetry_$(date +%Y_%m_%d) 
PARTITION OF meter_telemetry 
FOR VALUES FROM ('$(date +%Y-%m-%d)') TO ('$(date -d tomorrow +%Y-%m-%d)');
"
```

### Issue: Validation errors

**Check**:
- All required fields are present
- Data types are correct (numbers, not strings)
- Timestamp format is ISO 8601
- Values are within valid ranges (SoC: 0-100, voltage: reasonable range)

### Issue: Connection refused

**Solution**:
```bash
# Check if API is running
curl http://localhost:3000/v1/telemetry/meter

# Check API logs (if running with npm)
# Look at the terminal where npm run start:dev is running

# Restart the application
# Stop with Ctrl+C, then:
npm run start:dev
```

## Performance Testing

### Measure Ingestion Rate

```bash
# Start time
START=$(date +%s)

# Send 1000 records
for i in {1..1000}; do
  curl -X POST http://localhost:3000/v1/telemetry/meter \
    -H "Content-Type: application/json" \
    -d "{
      \"meterId\": \"meter_$(printf %03d $((i % 100)))\",
      \"kwhConsumedAc\": $((100 + i)).4567,
      \"voltage\": 234.5,
      \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }" > /dev/null 2>&1
done

# Calculate rate
END=$(date +%s)
DURATION=$((END - START))
echo "Ingested 1000 records in ${DURATION} seconds"
echo "Rate: $((1000 / DURATION)) records/second"
```



## Next Steps

After testing ingestion:

1. **Test Analytics**: Wait a few minutes, then query the analytics endpoint
2. **Verify Correlation**: Check that meter and vehicle data correlate correctly
3. **Check Efficiency**: Verify efficiency calculations are correct
4. **Monitor Performance**: Watch query times and database load

For more details, see:
- `README.md` - Full documentation
- `API_EXAMPLES.md` - More API examples
- `ARCHITECTURE.md` - System architecture details
