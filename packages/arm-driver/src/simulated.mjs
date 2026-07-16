/**
 * Simulated SO-101 Arm Driver
 *
 * Simulates joint movement with realistic timing (lerp between positions).
 * Publishes telemetry at 10Hz and status on state changes.
 * Respects SO-101 joint limits.
 */

// SO-101 joint limits (degrees) - based on LeRobot conventions
export const JOINT_LIMITS = [
  [-180, 180],  // Joint 0: Base rotation
  [-90, 90],    // Joint 1: Shoulder
  [-90, 90],    // Joint 2: Elbow
  [-90, 90],    // Joint 3: Wrist pitch
  [-180, 180],  // Joint 4: Wrist roll
  [0, 100],     // Joint 5: Gripper (0=closed, 100=open)
];

const HOME_POSITION = [0, 0, 0, 0, 0, 100]; // All centered, gripper open
const MOVE_SPEED = 45; // degrees per second per joint
const TELEMETRY_INTERVAL = 100; // ms (10Hz)

export class SimulatedArm {
  constructor({ onTelemetry, onStatusChange }) {
    this.jointAngles = [...HOME_POSITION];
    this.gripperState = 'open';
    this.status = 'idle'; // idle | planning | executing | fault
    this.targetAngles = null;
    this.onTelemetry = onTelemetry;
    this.onStatusChange = onStatusChange;
    this._telemetryInterval = null;
    this._moveInterval = null;
    this._stopped = false;
  }

  start() {
    // Publish telemetry at 10Hz
    this._telemetryInterval = setInterval(() => {
      this.onTelemetry({
        jointAngles: [...this.jointAngles],
        gripperState: this.gripperState,
      });
    }, TELEMETRY_INTERVAL);

    this._setStatus('idle');
    console.log('[arm-sim] Simulated SO-101 started');
  }

  stop() {
    if (this._telemetryInterval) clearInterval(this._telemetryInterval);
    if (this._moveInterval) clearInterval(this._moveInterval);
    console.log('[arm-sim] Stopped');
  }

  _setStatus(status) {
    if (this.status !== status) {
      this.status = status;
      this.onStatusChange({ status, detail: `Arm is ${status}` });
    }
  }

  /**
   * Execute a command received from arm/command topic.
   */
  async executeCommand(command) {
    const { commandType, params } = command;

    if (this._stopped && commandType !== 'stop') {
      console.log('[arm-sim] Ignoring command - emergency stopped');
      return;
    }

    switch (commandType) {
      case 'stop':
        this._emergencyStop();
        break;
      case 'home':
        await this._moveTo(HOME_POSITION);
        break;
      case 'move-to':
        await this._moveToCoords(params?.target);
        break;
      case 'pick':
        await this._pick(params?.target);
        break;
      case 'place':
        await this._place(params?.target);
        break;
      case 'jog':
        this._jog(params?.joint, params?.direction, params?.speed || 10);
        break;
      default:
        console.log(`[arm-sim] Unknown command: ${commandType}`);
    }
  }

  _emergencyStop() {
    this._stopped = true;
    if (this._moveInterval) {
      clearInterval(this._moveInterval);
      this._moveInterval = null;
    }
    this._setStatus('fault');
    console.log('[arm-sim] 🛑 EMERGENCY STOP');
  }

  _jog(jointIndex, direction, speed) {
    if (jointIndex < 0 || jointIndex >= 6) return;
    const delta = direction * speed;
    const newAngle = this.jointAngles[jointIndex] + delta;
    this.jointAngles[jointIndex] = Math.max(
      JOINT_LIMITS[jointIndex][0],
      Math.min(JOINT_LIMITS[jointIndex][1], newAngle)
    );
  }

  /**
   * Convert XYZ coords to approximate joint angles (simplified IK).
   * For a demo simulation, we use a simple mapping.
   */
  _coordsToAngles(coords) {
    if (!coords) return HOME_POSITION;
    const { x = 0, y = 0, z = 0 } = coords;

    // Simplified inverse kinematics for demo
    const baseAngle = Math.atan2(y, x) * (180 / Math.PI);
    const reach = Math.sqrt(x * x + y * y);
    const shoulderAngle = Math.min(90, Math.max(-90, (reach / 400) * 60 - 30));
    const elbowAngle = Math.min(90, Math.max(-90, (z / 100) * 30));

    return [
      Math.max(JOINT_LIMITS[0][0], Math.min(JOINT_LIMITS[0][1], baseAngle)),
      Math.max(JOINT_LIMITS[1][0], Math.min(JOINT_LIMITS[1][1], shoulderAngle)),
      Math.max(JOINT_LIMITS[2][0], Math.min(JOINT_LIMITS[2][1], elbowAngle)),
      0, // wrist pitch
      0, // wrist roll
      this.jointAngles[5], // keep current gripper state
    ];
  }

  async _moveToCoords(coords) {
    const target = this._coordsToAngles(coords);
    await this._moveTo(target);
  }

  async _pick(coords) {
    // Move to position, then close gripper
    await this._moveToCoords(coords);
    await this._moveGripper(0); // close
    this.gripperState = 'closed';
  }

  async _place(coords) {
    // Move to position, then open gripper
    await this._moveToCoords(coords);
    await this._moveGripper(100); // open
    this.gripperState = 'open';
  }

  async _moveGripper(target) {
    // Animate gripper
    return new Promise((resolve) => {
      const startGripper = this.jointAngles[5];
      const distance = Math.abs(target - startGripper);
      const duration = (distance / 200) * 1000; // 200 units per second
      const startTime = Date.now();

      const interval = setInterval(() => {
        if (this._stopped) { clearInterval(interval); resolve(); return; }

        const elapsed = Date.now() - startTime;
        const t = Math.min(1, elapsed / Math.max(duration, 1));
        this.jointAngles[5] = startGripper + (target - startGripper) * t;

        if (t >= 1) {
          this.jointAngles[5] = target;
          clearInterval(interval);
          resolve();
        }
      }, 20);
    });
  }

  async _moveTo(target) {
    this._setStatus('executing');

    return new Promise((resolve) => {
      const startAngles = [...this.jointAngles];
      const distances = target.map((t, i) => Math.abs(t - startAngles[i]));
      const maxDistance = Math.max(...distances, 1);
      const duration = (maxDistance / MOVE_SPEED) * 1000;
      const startTime = Date.now();

      if (this._moveInterval) clearInterval(this._moveInterval);

      this._moveInterval = setInterval(() => {
        if (this._stopped) {
          clearInterval(this._moveInterval);
          this._moveInterval = null;
          resolve();
          return;
        }

        const elapsed = Date.now() - startTime;
        const t = Math.min(1, elapsed / duration);

        // Smooth easing
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        for (let i = 0; i < 6; i++) {
          this.jointAngles[i] = startAngles[i] + (target[i] - startAngles[i]) * eased;
        }

        if (t >= 1) {
          this.jointAngles = [...target];
          clearInterval(this._moveInterval);
          this._moveInterval = null;
          this._setStatus('idle');
          resolve();
        }
      }, 20);
    });
  }

  /** Reset from emergency stop */
  reset() {
    this._stopped = false;
    this._setStatus('idle');
    console.log('[arm-sim] Reset from emergency stop');
  }
}
