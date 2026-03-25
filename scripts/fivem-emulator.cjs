#!/usr/bin/env node
/**
 * FiveM/RedM Console Emulator
 * Listens on TCP port 29200 and decodes CMND protocol messages.
 * Handles multiple messages per TCP chunk and partial messages.
 * Run: node fivem-emulator.cjs
 */

const net = require("net");

const PORT = 29200;
const HOST = "127.0.0.1";
const CMND_MAGIC = Buffer.from([0x43, 0x4d, 0x4e, 0x44]); // 'CMND'

/**
 * Parse all complete CMND messages from a buffer.
 * Returns { messages: [], remainder: Buffer }
 *
 * Frame layout (matches FiveM devcon protocol):
 *   [4 bytes magic]     CMND (0x43 0x4D 0x4E 0x44)
 *   [2 bytes protocol]  big-endian uint16 (211 = 0x00D3)
 *   [4 bytes length]    big-endian uint32
 *   [2 bytes padding]   0x00 0x00
 *   [N bytes command]   UTF-8 + newline
 *   [1 byte terminator] 0x00
 *
 * Minimum frame: 12 header bytes + 1 command byte + 1 terminator = 14 bytes
 * FiveM ignores the length field for CMND, reading all remaining bytes.
 * We use it here for proper frame boundary detection when multiple
 * messages arrive in a single TCP chunk.
 */
function parseFrames(buf) {
	const messages = [];
	let offset = 0;

	while (offset < buf.length) {
		// Need at least 12 bytes for magic + protocol + length + padding
		if (buf.length - offset < 12) break;

		// Check CMND magic (first 4 bytes)
		if (!buf.subarray(offset, offset + 4).equals(CMND_MAGIC)) {
			// Not a valid frame, dump rest as raw
			messages.push({ raw: true, text: buf.subarray(offset).toString("utf-8").trim() });
			offset = buf.length;
			break;
		}

		// Read length field at offset +6 (after 4 magic + 2 protocol)
		const declaredLength = buf.readUInt32BE(offset + 6);

		// Total frame = 4 magic + 2 protocol + 4 length + 2 padding + command + terminator
		//             = 12 + (declaredLength - 1) + 1  [length includes terminator]
		//             = 12 + declaredLength
		const frameSize = 12 + declaredLength;

		if (buf.length - offset < frameSize) break; // Incomplete frame, wait for more

		// Command starts at offset +12, ends before terminator
		const commandBytes = buf.subarray(offset + 12, offset + frameSize - 1);
		const command = commandBytes.toString("utf-8").replace(/\n$/, "");
		messages.push({ raw: false, text: command });

		offset += frameSize;
	}

	return { messages, remainder: buf.subarray(offset) };
}

const server = net.createServer((socket) => {
	const remote = `${socket.remoteAddress}:${socket.remotePort}`;
	console.log(`\x1b[32m[+] Connected: ${remote}\x1b[0m`);

	let buffer = Buffer.alloc(0);

	socket.on("data", (data) => {
		buffer = Buffer.concat([buffer, data]);
		const { messages, remainder } = parseFrames(buffer);
		buffer = remainder;

		for (const msg of messages) {
			const timestamp = new Date().toLocaleTimeString();
			if (msg.raw) {
				console.log(`\x1b[33m[${timestamp}] (raw) ${msg.text}\x1b[0m`);
			} else {
				console.log(`\x1b[36m[${timestamp}]\x1b[0m \x1b[1m> ${msg.text}\x1b[0m`);
			}
		}
	});

	socket.on("close", () => {
		console.log(`\x1b[31m[-] Disconnected: ${remote}\x1b[0m`);
	});

	socket.on("error", (err) => {
		console.log(`\x1b[31m[!] Error (${remote}): ${err.message}\x1b[0m`);
	});
});

server.listen(PORT, HOST, () => {
	console.log(`\x1b[1m========================================\x1b[0m`);
	console.log(`\x1b[1m  FiveM/RedM Console Emulator\x1b[0m`);
	console.log(`\x1b[1m  Listening on ${HOST}:${PORT}\x1b[0m`);
	console.log(`\x1b[1m========================================\x1b[0m`);
	console.log(`Waiting for Stream Deck plugin connections...\n`);
});

server.on("error", (err) => {
	if (err.code === "EADDRINUSE") {
		console.error(`\x1b[31mPort ${PORT} is already in use. Is FiveM running?\x1b[0m`);
	} else {
		console.error(`\x1b[31mServer error: ${err.message}\x1b[0m`);
	}
	process.exit(1);
});
