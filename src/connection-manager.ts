import net from "node:net";
import streamDeck from "@elgato/streamdeck";

const logger = streamDeck.logger.createScope("ConnectionManager");

/** CMND protocol header bytes. */
const CMND_MAGIC = Buffer.from([0x43, 0x4d, 0x4e, 0x44]);
const CMND_PROTOCOL = Buffer.from([0x00, 0xd3]); // 211 big-endian

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
				this.connected = false;
				this.socket = null;
				this.connectPromise = null;
			});

			sock.connect(ConnectionManager.PORT, ConnectionManager.HOST);
		});

		return this.connectPromise;
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

		this.socket.write(data);
		return true;
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
	}
}
