import { EventEmitter } from "node:events";

type ConnectionChangedPayload = { instance?: string; branch?: string };

interface EventMap {
	connectionChanged: (payload: ConnectionChangedPayload) => void;
}

class TypedEventEmitter {
	private emitter = new EventEmitter();

	on<K extends keyof EventMap>(event: K, listener: EventMap[K]) {
		this.emitter.on(event, listener as (...args: unknown[]) => void);
	}

	off<K extends keyof EventMap>(event: K, listener: EventMap[K]) {
		this.emitter.off(event, listener as (...args: unknown[]) => void);
	}

	emit<K extends keyof EventMap>(event: K, ...args: Parameters<EventMap[K]>) {
		this.emitter.emit(event, ...(args as unknown as unknown[]));
	}
}

const bus = new TypedEventEmitter();

export function onConnectionChanged(listener: EventMap["connectionChanged"]) {
	bus.on("connectionChanged", listener);
}

export function emitConnectionChanged(payload: ConnectionChangedPayload) {
	bus.emit("connectionChanged", payload);
}

export function offConnectionChanged(listener: EventMap["connectionChanged"]) {
	bus.off("connectionChanged", listener);
}
