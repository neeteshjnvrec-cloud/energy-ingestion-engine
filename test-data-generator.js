#!/usr/bin/env node

/**
 * Test Data Generator for Energy Ingestion Engine
 * 
 * This script simulates realistic telemetry data from smart meters and EV fleets.
 * It generates data that demonstrates the system's ability to handle:
 * - 10,000 devices sending data every 60 seconds
 * - Realistic power conversion efficiency (85-95%)
 * - Battery temperature variations
 * - Time-series correlation between meter and vehicle data
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const NUM_DEVICES = parseInt(process.env.NUM_DEVICES, 10) || 100;
const SEND_INTERVAL_MS = parseInt(process.env.SEND_INTERVAL_MS, 10) || 1000;

class TelemetrySimulator {
  constructor() {
    this.devices = this.initializeDevices();
    this.isRunning = false;
  }

  initializeDevices() {
    const devices = [];
    
    for (let i = 1; i <= NUM_DEVICES; i++) {
      const deviceId = String(i).padStart(3, '0');
      devices.push({
        meterId: `meter_${deviceId}`,
        vehicleId: `vehicle_${deviceId}`,
        
        // Initial state
        totalKwhAc: 0,
        totalKwhDc: 0,
        batteryTemp: 25 + Math.random() * 10, // 25-35°C initial
        soc: 20 + Math.random() * 60, // 20-80% initial charge
        voltage: 220 + Math.random() * 20, // 220-240V
        
        // Efficiency factor for this device (85-95%)
        efficiencyFactor: 0.85 + Math.random() * 0.10,
        
        // Charging state
        isCharging: Math.random() > 0.3, // 70% charging initially
      });
    }
    
    return devices;
  }

  generateMeterReading(device) {
    // Simulate AC consumption (grid side)
    const kwhIncrement = device.isCharging 
      ? 0.1 + Math.random() * 0.05  // 0.1-0.15 kWh per minute when charging
      : 0.001; // Minimal standby consumption
    
    device.totalKwhAc += kwhIncrement;
    device.voltage = 220 + Math.random() * 20; // Voltage fluctuation
    
    return {
      meterId: device.meterId,
      kwhConsumedAc: parseFloat(device.totalKwhAc.toFixed(4)),
      voltage: parseFloat(device.voltage.toFixed(2)),
      timestamp: new Date().toISOString(),
    };
  }

  generateVehicleReading(device) {
    // Simulate DC delivery (vehicle side)
    // DC is always less than AC due to conversion losses
    const acIncrement = device.isCharging 
      ? 0.1 + Math.random() * 0.05 
      : 0;
    
    const dcIncrement = acIncrement * device.efficiencyFactor;
    device.totalKwhDc += dcIncrement;
    
    // Update State of Charge (assuming 60 kWh battery)
    const BATTERY_CAPACITY = 60;
    device.soc = Math.min(100, device.soc + (dcIncrement / BATTERY_CAPACITY) * 100);
    
    // Battery temperature increases during charging
    if (device.isCharging) {
      device.batteryTemp = Math.min(45, device.batteryTemp + Math.random() * 0.5);
    } else {
      device.batteryTemp = Math.max(20, device.batteryTemp - Math.random() * 0.2);
    }
    
    // Randomly stop/start charging
    if (device.soc >= 95) {
      device.isCharging = false;
    } else if (device.soc <= 30 && Math.random() > 0.7) {
      device.isCharging = true;
    }
    
    return {
      vehicleId: device.vehicleId,
      soc: parseFloat(device.soc.toFixed(2)),
      kwhDeliveredDc: parseFloat(device.totalKwhDc.toFixed(4)),
      batteryTemp: parseFloat(device.batteryTemp.toFixed(2)),
      timestamp: new Date().toISOString(),
    };
  }

  async sendBulkData() {
    try {
      const meterReadings = [];
      const vehicleReadings = [];
      
      this.devices.forEach(device => {
        meterReadings.push(this.generateMeterReading(device));
        vehicleReadings.push(this.generateVehicleReading(device));
      });
      
      // Send meter data
      const meterResponse = await axios.post(
        `${BASE_URL}/v1/telemetry/meter/bulk`,
        { readings: meterReadings },
        { timeout: 30000 }
      );
      
      // Send vehicle data
      const vehicleResponse = await axios.post(
        `${BASE_URL}/v1/telemetry/vehicle/bulk`,
        { readings: vehicleReadings },
        { timeout: 30000 }
      );
      
      console.log(
        `✓ Sent ${meterReadings.length} meter + ${vehicleReadings.length} vehicle readings ` +
        `[Meter: ${meterResponse.status}, Vehicle: ${vehicleResponse.status}]`
      );
      
    } catch (error) {
      console.error('✗ Failed to send bulk data:', error.message);
    }
  }

  async start() {
    console.log('🚀 Starting Telemetry Simulator');
    console.log(`📊 Devices: ${NUM_DEVICES}`);
    console.log(`⏱️  Interval: ${SEND_INTERVAL_MS}ms`);
    console.log(`🎯 Target: ${BASE_URL}`);
    console.log('');
    
    this.isRunning = true;
    
    while (this.isRunning) {
      await this.sendBulkData();
      await this.sleep(SEND_INTERVAL_MS);
    }
  }

  stop() {
    this.isRunning = false;
    console.log('\n👋 Simulator stopped');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
if (require.main === module) {
  const simulator = new TelemetrySimulator();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    simulator.stop();
    process.exit(0);
  });
  
  simulator.start().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = TelemetrySimulator;
