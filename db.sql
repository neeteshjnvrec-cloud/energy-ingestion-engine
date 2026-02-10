-- 0. INITIAL SETUP (Ensures the user exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'fleet_admin') THEN
        CREATE ROLE fleet_admin WITH LOGIN PASSWORD 'fleet_secure_2024';
    END IF;
END $$;

-- 1. CLEAN UP
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE tablename LIKE 'meter_telemetry_y%') LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
    FOR r IN (SELECT tablename FROM pg_tables WHERE tablename LIKE 'vehicle_telemetry_y%') LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;

-- 2. HOT DATA TABLES
CREATE TABLE IF NOT EXISTS public.meter_current_state (
    meter_id VARCHAR(50) PRIMARY KEY,
    kwh_consumed_ac DECIMAL(12, 4) NOT NULL,
    voltage DECIMAL(8, 2) NOT NULL,
    last_reading_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.vehicle_current_state (
    vehicle_id VARCHAR(50) PRIMARY KEY,
    soc DECIMAL(5, 2) NOT NULL CHECK (soc >= 0 AND soc <= 100),
    kwh_delivered_dc DECIMAL(12, 4) NOT NULL,
    battery_temp DECIMAL(5, 2),
    last_reading_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. COLD DATA PARENTS
CREATE TABLE IF NOT EXISTS public.meter_telemetry (
    id BIGSERIAL,
    meter_id VARCHAR(50) NOT NULL,
    kwh_consumed_ac DECIMAL(12, 4) NOT NULL,
    voltage DECIMAL(8, 2) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ingested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (recorded_at, id)
) PARTITION BY RANGE (recorded_at);

CREATE TABLE IF NOT EXISTS public.vehicle_telemetry (
    id BIGSERIAL,
    vehicle_id VARCHAR(50) NOT NULL,
    soc DECIMAL(5, 2) NOT NULL,
    kwh_delivered_dc DECIMAL(12, 4) NOT NULL,
    battery_temp DECIMAL(5, 2),
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ingested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (recorded_at, id)
) PARTITION BY RANGE (recorded_at);

-- 4. EMERGENCY SAFETY NET
CREATE TABLE IF NOT EXISTS public.meter_telemetry_default 
    PARTITION OF public.meter_telemetry DEFAULT;

CREATE TABLE IF NOT EXISTS public.vehicle_telemetry_default 
    PARTITION OF public.vehicle_telemetry DEFAULT;

-- 5. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_meter_telemetry_lookup ON public.meter_telemetry (meter_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_telemetry_lookup ON public.vehicle_telemetry (vehicle_id, recorded_at DESC);

-- 6. PERMISSIONS
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fleet_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fleet_admin;