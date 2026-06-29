import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server } from "socket.io";

@WebSocketGateway({ cors: { origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true } })
export class QueueGateway {
  @WebSocketServer()
  server!: Server;

  emitQueueEvent(event: string, payload: unknown) {
    this.server.emit(event, payload);
  }
}

