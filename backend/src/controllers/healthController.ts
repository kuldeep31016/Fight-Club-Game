import type { Request, Response } from 'express';
import type { RoomManager } from '../rooms/RoomManager';

/** GET / and GET /health - used by Render/Railway health checks and uptime monitors. */
export function createHealthController(getRoomManager: () => RoomManager | null) {
  return (_req: Request, res: Response) => {
    const rm = getRoomManager();
    res.json({
      status: 'ok',
      service: 'fightcam-backend',
      uptimeSeconds: Math.round(process.uptime()),
      activeRooms: rm ? rm.roomCount() : 0,
    });
  };
}
