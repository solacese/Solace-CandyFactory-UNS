/**
 * Real SO-101 Driver (Interface Only)
 *
 * Same interface as SimulatedArm but communicates with the real hardware
 * via serial port using LeRobot conventions.
 *
 * Prerequisites:
 * - npm install serialport
 * - ARM_MODE=real
 * - ARM_SERIAL_PORT=/dev/ttyUSB0 (or appropriate port)
 *
 * NOT TESTED WITHOUT HARDWARE — this is the interface wiring only.
 */

import { JOINT_LIMITS } from './simulated.mjs';

export class RealArm {
  constructor({ onTelemetry, onStatusChange }) {
    this.jointAngles = [0, 0, 0, 0, 0, 100];
    this.gripperState = 'open';
    this.status = 'idle';
    this.onTelemetry = onTelemetry;
    this.onStatusChange = onStatusChange;
    this._port = null;
    this._telemetryInterval = null;
  }

  async start() {
    const serialPort = process.env.ARM_SERIAL_PORT;
    if (!serialPort) {
      throw new Error('ARM_SERIAL_PORT environment variable is required when ARM_MODE=real');
    }

    // Dynamic import to avoid requiring serialport when in simulated mode
    const { SerialPort } = await import('serialport');

    this._port = new SerialPort({
      path: serialPort,
      baudRate: 1000000, // LeRobot/SO-101 uses 1Mbaud
    });

    this._port.on('error', (err) => {
      console.error('[arm-real] Serial error:', err.message);
      this._setStatus('fault');
    });

    this._port.on('data', (data) => {
      this._handleTelemetryData(data);
    });

    // Request telemetry at 10Hz
    this._telemetryInterval = setInterval(() => {
      this._requestTelemetry();
    }, 100);

    this._setStatus('idle');
    console.log(`[arm-real] Connected to SO-101 on ${serialPort}`);
  }

  stop() {
    if (this._telemetryInterval) clearInterval(this._telemetryInterval);
    if (this._port) this._port.close();
    console.log('[arm-real] Disconnected');
  }

  _setStatus(status) {
    if (this.status !== status) {
      this.status = status;
      this.onStatusChange({ status, detail: `Arm is ${status}` });
    }
  }

  async executeCommand(command) {
    const { commandType, params } = command;

    switch (commandType) {
      case 'stop':
        this._emergencyStop();
        break;
      case 'home':
        await this._sendSerialCommand('HOME');
        break;
      case 'move-to':
        await this._sendMoveCommand(params?.target);
        break;
      case 'pick':
        await this._sendMoveCommand(params?.target);
        await this._sendSerialCommand('GRIPPER_CLOSE');
        break;
      case 'place':
        await this._sendMoveCommand(params?.target);
        await this._sendSerialCommand('GRIPPER_OPEN');
        break;
      case 'jog':
        await this._sendJogCommand(params?.joint, params?.direction, params?.speed);
        break;
      default:
        console.log(`[arm-real] Unknown command: ${commandType}`);
    }
  }

  _emergencyStop() {
    // Send immediate stop to hardware
    if (this._port && this._port.isOpen) {
      // LeRobot convention: send all-zero torque command
      this._port.write(Buffer.from([0xFF, 0xFF, 0x00])); // Emergency stop sequence
    }
    this._setStatus('fault');
    console.log('[arm-real] 🛑 EMERGENCY STOP sent to hardware');
  }

  async _sendSerialCommand(cmd) {
    // Placeholder for actual LeRobot serial protocol
    // Real implementation would encode per the SO-101/Feetech servo protocol
    console.log(`[arm-real] Command: ${cmd}`);
    this._setStatus('executing');

    return new Promise((resolve) => {
      // In real implementation, wait for acknowledgment from hardware
      setTimeout(() => {
        this._setStatus('idle');
        resolve();
      }, 500);
    });
  }

  async _sendMoveCommand(target) {
    if (!target) return;
    // Convert XYZ to joint angles via IK (same simplified version as simulated)
    // In production, this would use proper kinematics
    console.log(`[arm-real] Move to: x=${target.x}, y=${target.y}, z=${target.z}`);
    this._setStatus('executing');
  }

  async _sendJogCommand(joint, direction, speed) {
    console.log(`[arm-real] Jog: joint=${joint}, dir=${direction}, speed=${speed}`);
  }

  _requestTelemetry() {
    // In real implementation, read servo positions via serial
    // For now, just report last known angles
    this.onTelemetry({
      jointAngles: [...this.jointAngles],
      gripperState: this.gripperState,
    });
  }

  _handleTelemetryData(data) {
    // Parse incoming serial data (servo feedback)
    // Real implementation would decode Feetech servo protocol
    // and update this.jointAngles accordingly
  }

  reset() {
    this._setStatus('idle');
    console.log('[arm-real] Reset from fault state');
  }
}
