import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private connectedClients = 0;

  afterInit() {
    this.logger.log('🔌 Socket.IO Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.connectedClients++;
    this.logger.log(
      `Client connected: ${client.id} (total: ${this.connectedClients})`,
    );
  }

  handleDisconnect(client: Socket) {
    this.connectedClients--;
    this.logger.log(
      `Client disconnected: ${client.id} (total: ${this.connectedClients})`,
    );
  }

  /**
   * Emit new accident to all connected dashboard clients
   */
  emitAccident(accident: any) {
    this.server.emit('new-accident', {
      ...accident.toJSON?.() ?? accident,
      _event: 'new',
    });
    this.logger.log(`📡 Emitted new-accident to ${this.connectedClients} clients`);
  }

  /**
   * Emit accident update (ML verification, status change)
   */
  emitAccidentUpdate(accident: any) {
    this.server.emit('accident-update', {
      ...accident.toJSON?.() ?? accident,
      _event: 'update',
    });
    this.logger.log(`📡 Emitted accident-update: ${accident._id}`);
  }

  /**
   * Client can subscribe to specific severity alerts
   */
  @SubscribeMessage('subscribe-severity')
  handleSubscribeSeverity(client: Socket, severity: string) {
    client.join(`severity-${severity}`);
    this.logger.log(`Client ${client.id} subscribed to severity: ${severity}`);
    return { event: 'subscribed', data: { severity } };
  }

  /**
   * Ping/pong for connection health
   */
  @SubscribeMessage('ping')
  handlePing(client: Socket) {
    return { event: 'pong', data: { timestamp: Date.now() } };
  }
}
