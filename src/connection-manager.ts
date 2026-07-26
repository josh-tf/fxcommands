import net from "node:net";
import { randomUUID } from "node:crypto";
import streamDeck from "@elgato/streamdeck";

const logger = streamDeck.logger.createScope("ConnectionManager");

/** Protocol header bytes - used when sending commands. */
const CMND_MAGIC = Buffer.from([0x43, 0x4d, 0x4e, 0x44]);
const CMND_PROTOCOL = Buffer.from([0x00, 0xd3]); // 211 big-endian
const FRAME_HEADER_SIZE = 12; // magic(4) + protocol(2) + length(4) + padding(2)

/** Protocol header bytes - used when receiving console outputs. */
const PRNT_MAGIC = Buffer.from([0x50, 0x52, 0x4e, 0x54]); // "PRNT"
const CHAN_MAGIC = Buffer.from([0x43, 0x48, 0x41, 0x4e]); // "CHAN"
const CVAR_MAGIC = Buffer.from([0x43, 0x56, 0x41, 0x52]); // "CVAR"
const AINF_MAGIC = Buffer.from([0x41, 0x49, 0x4e, 0x46]); // "AINF" - handshake ack, skipped
const INCOMING_MAGICS = [PRNT_MAGIC, CHAN_MAGIC, CVAR_MAGIC, AINF_MAGIC];
const PRNT_PAYLOAD_OFFSET = 40;
const HANDSHAKE = Buffer.from([0x50, 0x50, 0x43, 0x52]); // "PPCR"

export const CAPTURE_TIMEOUT_MS = 1500;
const TOKEN_PREFIX = "@fxid:"; // Prefix for command responses e.g. "@fxid:ab12cd34"

// Minimum gap between outgoing frames to prevent some being silently dropped
const SEND_GAP_MS = 25;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Manages a persistent TCP connection to the FiveM/RedM console on localhost:29200.
 * Uses the CMND binary protocol (IceCon-style).
 */
export class ConnectionManager {
	private static readonly HOST = "127.0.0.1";
	private static readonly PORT = 29200;

	private socket: net.Socket | null = null;
	private connected = false;
	private connectPromise: Promise<void> | null = null;
	private recvBuffer = Buffer.alloc(0);
	private lineHandlers = new Set<(line: string) => void>();
	private sendQueue: Promise<void> = Promise.resolve();
	private defaultTimeoutMs = CAPTURE_TIMEOUT_MS;

	public setDefaultTimeout(timeoutMs: number): void {
		this.defaultTimeoutMs = timeoutMs > 0 ? Math.min(5000, timeoutMs) : CAPTURE_TIMEOUT_MS;
	}

	/**
	 * Open the TCP connection. Resolves when connected.
	 * Safe to call multiple times - reuses existing connection/attempt.
	 */
	public async connect(): Promise<void> {
		if (this.socket && this.connected) return;
		if (this.connectPromise) return this.connectPromise;

		logger.info(`Connecting to ${ConnectionManager.HOST}:${ConnectionManager.PORT}`);

		this.connectPromise = new Promise<void>((resolve) => {
			if (this.socket) {
				this.socket.removeAllListeners();
				this.socket.destroy();
			}

			const sock = new net.Socket();
			this.socket = sock;
			sock.setNoDelay(true);
			sock.setKeepAlive(true, 10000);

			sock.on("connect", () => {
				logger.info("Connected");
				sock.write(HANDSHAKE);
				this.connected = true;
				this.connectPromise = null;
				resolve();
			});

			sock.on("error", (err: Error) => {
				logger.error(`Connection error: ${err.message}`);
				this.connected = false;
				this.connectPromise = null;
				resolve();
			});

			sock.on("close", () => {
				logger.info(`Disconnected`);
				this.connected = false;
				this.socket = null;
				this.connectPromise = null;
				this.recvBuffer = Buffer.alloc(0);
			});

			sock.on("data", (chunk: Buffer) => {
				this.recvBuffer = Buffer.concat([this.recvBuffer, chunk]);

				while (this.recvBuffer.length >= FRAME_HEADER_SIZE) {
					const magic = this.recvBuffer.subarray(0, 4);
					if (!INCOMING_MAGICS.some((m) => magic.equals(m))) {
						const nextIndex = INCOMING_MAGICS.reduce((min, m) => {
							const idx = this.recvBuffer.indexOf(m);
							return idx === -1 ? min : Math.min(min, idx);
						}, -1);
						this.recvBuffer = nextIndex === -1 ? Buffer.alloc(0) : this.recvBuffer.subarray(nextIndex);
						if (this.recvBuffer.length < FRAME_HEADER_SIZE) break;
						continue;
					}

					const totalSize = this.recvBuffer.readUInt32BE(6);
					if (totalSize < FRAME_HEADER_SIZE) {
						this.recvBuffer = this.recvBuffer.subarray(4);
						continue;
					}
					if (this.recvBuffer.length < totalSize) break;

					if (magic.equals(PRNT_MAGIC) && totalSize > PRNT_PAYLOAD_OFFSET) {
						const payload = this.recvBuffer.subarray(PRNT_PAYLOAD_OFFSET, totalSize);
						const text = payload.toString("utf-8").replace(/\0+$/, "").trim();
						if (text) {
							this.dispatchLine(text);
						}
					}

					this.recvBuffer = this.recvBuffer.subarray(totalSize);
				}
			});

			sock.connect(ConnectionManager.PORT, ConnectionManager.HOST);
		});

		return this.connectPromise;
	}

	private dispatchLine(line: string): void {
		for (const handler of this.lineHandlers) handler(line);
	}

	/**
	 * Build and send a CMND protocol frame.
	 *
	 * Frame layout:
	 *   [4 bytes magic]     CMND (0x43 0x4d 0x4e 0x44)
	 *   [2 bytes protocol]  0x00 0xd3 (211 big-endian)
	 *   [4 bytes length]    big-endian, command length + 1
	 *   [2 bytes padding]   0x00 0x00
	 *   [N bytes command]   UTF-8 encoded + newline
	 *   [1 byte terminator] 0x00
	 */
	public async send(message: string): Promise<boolean> {
		if (!this.socket || !this.connected) {
			await this.connect();
		}

		if (!this.socket || !this.connected) {
			logger.error(`Failed to send (not connected): ${message}`);
			return false;
		}

		const socket = this.socket;
		const command = Buffer.from(message + "\n", "utf-8");
		const length = Buffer.alloc(4);
		length.writeUInt32BE(command.length + 1);

		const data = Buffer.concat([
			CMND_MAGIC,
			CMND_PROTOCOL,
			length,
			Buffer.from([0x00, 0x00]),
			command,
			Buffer.from([0x00])
		]);

		const write = this.sendQueue.then(() => {
			socket.write(data);
		});
		this.sendQueue = write.then(
			() => sleep(SEND_GAP_MS),
			() => sleep(SEND_GAP_MS)
		);
		await write;
		return true;
	}

	/**
	 * Send a command with a unique correlation token appended (e.g. "e sit @fxid:ab12cd34")
	 * and wait for a console line containing that same token to appear.
	 * `response` is null if no matching line appears before `timeoutMs` elapses.
	 */
	public async sendWithToken(command: string): Promise<{ sent: boolean; response: string | null }> {
		const tag = `${TOKEN_PREFIX}${randomUUID().slice(0, 8)}`;

		const responsePromise = new Promise<string | null>((resolve) => {
			const finish = (value: string | null): void => {
				this.lineHandlers.delete(handler);
				clearTimeout(timer);
				resolve(value);
			};

			const handler = (line: string): void => {
				if (line.includes(tag)) {
					finish(line.replace(tag, "").trim() || null);
				}
			};

			const timer = setTimeout(() => finish(null), this.defaultTimeoutMs);
			this.lineHandlers.add(handler);
		});

		const sent = await this.send(`${command} ${tag}`);
		const response = await responsePromise;
		return { sent, response };
	}

	/** Close the TCP connection. */
	public disconnect(): void {
		if (this.socket) {
			this.socket.removeAllListeners();
			this.socket.destroy();
			this.socket = null;
		}
		this.connected = false;
		this.connectPromise = null;
		this.recvBuffer = Buffer.alloc(0);
	}
}
