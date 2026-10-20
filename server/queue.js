import { randomUUID } from 'node:crypto';
import { Match } from './match.js';

export class Matchmaker {
  constructor(data, { now = () => Date.now(), interval = 300000, duration = 300000, maxRooms = 8 } = {}) {
    this.data = data; this.now = now; this.interval = interval; this.duration = duration; this.maxRooms = maxRooms;
    this.nextStartAt = (Math.floor(now() / interval) + 1) * interval;
    this.sessions = new Map(); this.queue = []; this.matches = new Map();
  }
  connect(send) {
    const session = { id: randomUUID(), name: 'Operator', send, connected: true, queued: false, matchId: null };
    this.sessions.set(session.id, session);
    send({ type: 'welcome', id: session.id, nextStartAt: this.nextStartAt, serverNow: this.now(), capacity: 10, region: 'US West' }); return session;
  }
  join(session, name) {
    if (session.queued || session.matchId || this.queue.length >= 200) { session.send({ type: 'error', message: 'ALREADY QUEUED / IN MATCH, OR QUEUE FULL' }); return; }
    session.name = typeof name === 'string' ? name.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 20) || 'Operator' : 'Operator';
    session.queued = true; this.queue.push(session); this.queueUpdate();
  }
  leave(session) {
    this.queue = this.queue.filter(other => other !== session); session.queued = false;
    if (session.matchId) {
      this.matches.get(session.matchId)?.players.delete(session.id);
      session.matchId = null;
    }
    this.queueUpdate();
  }
  disconnect(session) { this.leave(session); session.connected = false; this.sessions.delete(session.id); }
  handle(session, message) {
    if (message.type === 'join') this.join(session, message.name);
    else if (message.type === 'leave') this.leave(session);
    else if (session.matchId) this.matches.get(session.matchId)?.handle(session, message, this.now());
  }
  queueUpdate() {
    for (const session of this.queue) session.send({ type: 'queued', count: this.queue.length, position: this.queue.indexOf(session) + 1, nextStartAt: this.nextStartAt, serverNow: this.now(), capacity: 10 });
  }
  tick() {
    const now = this.now();
    for (const [id, match] of this.matches) {
      if (now >= match.endsAt || ![...match.players.values()].some(player => player.session.connected)) { match.finish(now); this.matches.delete(id); }
      else match.tick(now);
    }
    if (now >= this.nextStartAt) {
      this.queue = this.queue.filter(session => session.connected && session.queued);
      while (this.queue.length >= 2 && this.matches.size < this.maxRooms) {
        const group = this.queue.splice(0, 10), match = new Match(group, this.data, now, this.duration); this.matches.set(match.id, match);
      }
      this.nextStartAt = (Math.floor(now / this.interval) + 1) * this.interval; this.queueUpdate();
    }
  }
}
