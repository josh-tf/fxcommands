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
const HEADER = Buffer.from([0x43, 0x4d, 0x4e, 0x44, 0x00, 0xd2, 0x00, 0x00]);

/**
 * Parse all complete CMND messages from a buffer.
 * Returns { messages: string[], remainder: Buffer }
 *
 * Frame: [8 header][4 length BE][2 padding][command + \n][0x00]
 * The length field = command.length + 13
 * Total frame size = 8 + 4 + 2 + command.length + 1 + 1 = command.length + 16
 *                  = (length - 13) + 16 = length + 3
 */
function parseFrames(buf) {
	const messages = [];
	let offset = 0;

	while (offset < buf.length) {
		// Need at least 14 bytes for header + length + padding
		if (buf.length - offset < 14) break;

		// Check CMND header
		if (!buf.subarray(offset, offset + 8).equals(HEADER)) {
			// Not a valid frame, dump rest as raw
			messages.push({ raw: true, text: buf.subarray(offset).toString("utf-8").trim() });
			offset = buf.length;
			break;
		}

		// Read declared length
		const declaredLength = buf.readUInt32BE(offset + 8);
		// Total frame size: header(8) + length_field(4) + padding(2) + command_bytes + terminator(1)
		// declaredLength = command.length + 13, so command.length = declaredLength - 13
		// frame size = 8 + 4 + 2 + (declaredLength - 13) + 1 + 1 = declaredLength + 3
		const frameSize = declaredLength + 3;

		if (buf.length - offset < frameSize) break; // Incomplete frame, wait for more

		const commandBytes = buf.subarray(offset + 14, offset + frameSize - 1);
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
