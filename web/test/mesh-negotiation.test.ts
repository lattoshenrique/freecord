import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mesh } from '../src/lib/mesh';

class Connection {
  signalingState = 'stable';
  iceConnectionState = 'new';
  connectionState = 'new';
  localDescription: { type: string; toJSON(): { type: string } } | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  calls: string[] = [];
  restartIce = vi.fn();
  onnegotiationneeded: (() => void) | null = null;
  createDataChannel() { return { close() {} }; }
  getSenders() { return []; }
  addTransceiver() {}
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.calls.push('remote'); this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
  async addIceCandidate() {
    if (!this.remoteDescription) throw new Error('No remote SDP');
    this.calls.push('candidate');
  }
  async setLocalDescription() {
    this.calls.push('local');
    const type = this.signalingState === 'have-remote-offer' ? 'answer' : 'offer';
    this.localDescription = { type, toJSON: () => ({ type }) };
    this.signalingState = type === 'offer' ? 'have-local-offer' : 'stable';
  }
  close() { this.signalingState = 'closed'; }
}
let mesh: Mesh;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10_000); vi.stubGlobal('RTCPeerConnection', Connection); mesh = new Mesh('a', vi.fn()); });
afterEach(() => { mesh.close(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('native connection recovery during route activation', () => {
  it('retains trickle candidates that overtake their remote description', async () => {
    mesh.handleSignal('b', { candidate: { candidate: 'candidate:test' } });
    mesh.handleSignal('b', { description: { type: 'offer', sdp: 'test' } });
    await vi.advanceTimersByTimeAsync(1);
    const pc = mesh.getPeerConnection('b') as unknown as Connection;
    expect(pc.calls).toEqual(['remote', 'candidate', 'local']);
  });
  it('recovers stable SDP with ICE stuck new, then leaves a healthy connection alone', async () => {
    mesh.handleSignal('b', { description: { type: 'offer', sdp: 'test' } });
    await vi.advanceTimersByTimeAsync(2000);
    const pc = mesh.getPeerConnection('b') as unknown as Connection;
    expect(pc.restartIce).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(pc.restartIce).toHaveBeenCalledTimes(1);
    pc.iceConnectionState = 'connected'; pc.connectionState = 'connected';
    await vi.advanceTimersByTimeAsync(10000);
    expect(pc.restartIce).toHaveBeenCalledTimes(1);
  });
});
