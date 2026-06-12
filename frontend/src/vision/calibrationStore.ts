import type { CalibrationResult } from '../types';

/**
 * Holds the local player's calibration baseline between the Calibration
 * screen and the Game screen. Deliberately not sent to the server — the
 * server never sees pose data of any kind.
 */
class CalibrationStore {
  private result: CalibrationResult | null = null;

  set(result: CalibrationResult): void {
    this.result = result;
  }

  get(): CalibrationResult | null {
    return this.result;
  }

  clear(): void {
    this.result = null;
  }
}

export const calibrationStore = new CalibrationStore();
