#!/usr/bin/env node
/**
 * FiveM/RedM Console Emulator
 *
 * Listens on TCP port 29200 and speaks enough of the FiveM devcon protocol to
 * exercise the plugin without the game running:
 *
 *   - decodes outgoing CMND frames (commands sent by the plugin)
 *   - answers the PPCR handshake with an AINF frame
 *   - replies to commands carrying an "@fxid:" token with a PRNT frame, so the
 *     command-response feature can be tested end to end
 *
 * Run: node fivem-emulator.cjs [options]
 *
 * Options:
 *   --percent        Append "%" to values so the dial switches to the bar layout
 *   --delay=<ms>     Wait before replying (use >1500 to exercise the capture timeout)
 *   --drop           Never reply, to exercise the no-response path
 *   --garbage        Prefix replies with junk bytes, to exercise frame resync
 *   --split          Send each reply in two TCP chunks, to exercise buffering
 *   --value=<n>      Starting value for the simulated setting (default 50)
 *   --port=<n>       Listen on a different port (default 29200)
 *   --cl2            Shorthand for --port=29300, the port a -cl2 client uses
 *   --host=<ip>      Bind a different address (default 127.0.0.1). Use 0.0.0.0 to
 *                    accept connections from another machine, which is what the
 *                    plugin's Server IP override talks to
 */

const net = require("net");

const DEFAULT_PORT = 29200;
const CL2_PORT = 29300;
const DEFAULT_HOST = "127.0.0.1";

const CMND_MAGIC = Buffer.from("CMND", "ascii");
const PRNT_MAGIC = Buffer.from("PRNT", "ascii");
const AINF_MAGIC = Buffer.from("AINF", "ascii");
const HANDSHAKE = Buffer.from("PPCR", "ascii");
const PROTOCOL = Buffer.from([0x00, 0xd3]); // 211 big-endian

const HEADER_SIZE = 12; // magic(4) + protocol(2) + length(4) + padding(2)
const PRNT_PAYLOAD_OFFSET = 40; // PRNT carries 28 extra bytes of channel metadata
const TOKEN_PATTERN = /@fxid:[0-9a-f]+/i;

const opts = parseArgs(process.argv.slice(2));
const state = { value: opts.value };

function parseArgs(argv) {
	const o = {
		percent: false,
		delay: 0,
		drop: false,
		garbage: false,
		split: false,
		value: 50,
		port: DEFAULT_PORT,
		host: DEFAULT_HOST
	};
	for (const arg of argv) {
		const [key, val] = arg.replace(/^--/, "").split("=");
		if (key === "percent") o.percent = true;
		else if (key === "drop") o.drop = true;
		else if (key === "garbage") o.garbage = true;
		else if (key === "split") o.split = true;
		else if (key === "delay") o.delay = parseInt(val, 10) || 0;
		else if (key === "value") o.value = parseFloat(val) || 0;
		else if (key === "cl2") o.port = CL2_PORT;
		else if (key === "host") o.host = val || DEFAULT_HOST;
		else if (key === "port") {
			const port = parseInt(val, 10);
			// Bad ports make net.listen throw ERR_SOCKET_BAD_PORT from inside the
			// server, which reads as a crash rather than a typo. Reject it here.
			if (!(port > 0 && port <= 65535)) {
				console.error(`Invalid --port=${val}, expected 1-65535`);
				process.exit(1);
			}
			o.port = port;
		}
	}
	return o;
}

/**
 * Build an incoming frame.
 *
 * NOTE: the length field here is the TOTAL frame size, which is what the plugin's
 * receive parser expects. This is the opposite of the outgoing CMND convention
 * below, where the same field is the payload size. If a real client ever proves
 * otherwise, this is the line to change.
 */
function buildFrame(magic, text) {
	const payload = Buffer.from(text + "\0", "utf-8");
	const total = PRNT_PAYLOAD_OFFSET + payload.length;
	const frame = Buffer.alloc(total);
	magic.copy(frame, 0);
	PROTOCOL.copy(frame, 4);
	frame.writeUInt32BE(total, 6);
	payload.copy(frame, PRNT_PAYLOAD_OFFSET);
	return frame;
}

/**
 * Parse all complete CMND messages from a buffer, plus the PPCR handshake.
 *
 * CMND frame layout (outgoing, written by the plugin):
 *   [4 bytes magic]     CMND
 *   [2 bytes protocol]  big-endian uint16 (211 = 0x00D3)
 *   [4 bytes length]    big-endian uint32 - PAYLOAD size, not total
 *   [2 bytes padding]   0x00 0x00
 *   [N bytes command]   UTF-8 + newline
 *   [1 byte terminator] 0x00
 */
function parseFrames(buf) {
	const messages = [];
	let offset = 0;

	while (offset < buf.length) {
		// The plugin opens with a bare 4-byte PPCR handshake, not a framed message.
		if (buf.length - offset >= 4 && buf.subarray(offset, offset + 4).equals(HANDSHAKE)) {
			messages.push({ type: "handshake" });
			offset += 4;
			continue;
		}

		if (buf.length - offset < HEADER_SIZE) break;

		if (!buf.subarray(offset, offset + 4).equals(CMND_MAGIC)) {
			// Unknown byte - skip it rather than discarding the whole buffer, so a
			// stray byte cannot swallow the valid frames that follow it.
			offset += 1;
			continue;
		}

		const declaredLength = buf.readUInt32BE(offset + 6);
		const frameSize = HEADER_SIZE + declaredLength;
		if (buf.length - offset < frameSize) break; // incomplete, wait for more

		const command = buf
			.subarray(offset + HEADER_SIZE, offset + frameSize - 1)
			.toString("utf-8")
			.replace(/\n$/, "");
		messages.push({ type: "command", text: command });
		offset += frameSize;
	}

	return { messages, remainder: buf.subarray(offset) };
}

/**
 * Update the simulated value from a command, mimicking a server-side handler.
 * A command containing "set" treats its number as absolute, anything else as a delta.
 */
function applyCommand(command) {
	const withoutToken = command.replace(TOKEN_PATTERN, "").trim();
	const number = withoutToken.match(/(-?\d+(?:\.\d+)?)\s*$/);
	if (number) {
		const n = parseFloat(number[1]);
		state.value = /set/i.test(withoutToken) ? n : state.value + n;
	} else if (/up|right|inc/i.test(withoutToken)) {
		state.value += 1;
	} else if (/down|left|dec/i.test(withoutToken)) {
		state.value -= 1;
	}
	state.value = Math.min(100, Math.max(0, state.value));
	return state.value;
}

function send(socket, frame) {
	if (!opts.split || frame.length < 8) {
		socket.write(frame);
		return;
	}
	// Deliberately straddle a frame across two TCP chunks.
	const cut = Math.floor(frame.length / 2);
	socket.write(frame.subarray(0, cut));
	setTimeout(() => socket.write(frame.subarray(cut)), 10);
}

function respond(socket, command) {
	const match = command.match(TOKEN_PATTERN);
	if (!match) return; // no token: fire-and-forget command, nothing to reply

	const token = match[0];
	const value = applyCommand(command);
	const text = `${token} ${value}${opts.percent ? "%" : ""}`;

	if (opts.drop) {
		console.log(`\x1b[90m       (dropping reply for ${token})\x1b[0m`);
		return;
	}

	setTimeout(() => {
		if (socket.destroyed) return;
		// The junk must share a TCP chunk with the frame, otherwise the parser just
		// discards it on its own and the resync path is never exercised.
		const frame = opts.garbage
			? Buffer.concat([Buffer.from("!!junk!!not-a-frame!!", "ascii"), buildFrame(PRNT_MAGIC, text)])
			: buildFrame(PRNT_MAGIC, text);
		send(socket, frame);
		console.log(`\x1b[35m     < ${text}\x1b[0m`);
	}, opts.delay);
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
			if (msg.type === "handshake") {
				console.log(`\x1b[34m[${timestamp}] handshake (PPCR) -> AINF\x1b[0m`);
				send(socket, buildFrame(AINF_MAGIC, "emulator"));
				continue;
			}
			console.log(`\x1b[36m[${timestamp}]\x1b[0m \x1b[1m> ${msg.text}\x1b[0m`);
			respond(socket, msg.text);
		}
	});

	socket.on("close", () => {
		console.log(`\x1b[31m[-] Disconnected: ${remote}\x1b[0m`);
	});

	socket.on("error", (err) => {
		console.log(`\x1b[31m[!] Error (${remote}): ${err.message}\x1b[0m`);
	});
});

server.listen(opts.port, opts.host, () => {
	const flags = [
		opts.percent && "percent",
		opts.drop && "drop",
		opts.garbage && "garbage",
		opts.split && "split",
		opts.delay && `delay=${opts.delay}ms`,
		opts.port === CL2_PORT && "cl2"
	].filter(Boolean);

	console.log(`\x1b[1m========================================\x1b[0m`);
	console.log(`\x1b[1m  FiveM/RedM Console Emulator\x1b[0m`);
	console.log(`\x1b[1m  Listening on ${opts.host}:${opts.port}\x1b[0m`);
	console.log(`\x1b[1m  Value: ${state.value}${flags.length ? `  Flags: ${flags.join(", ")}` : ""}\x1b[0m`);
	console.log(`\x1b[1m========================================\x1b[0m`);
	console.log(`Waiting for Stream Deck plugin connections...\n`);
});

server.on("error", (err) => {
	if (err.code === "EADDRINUSE") {
		console.error(`\x1b[31mPort ${opts.port} is already in use. Is FiveM running?\x1b[0m`);
	} else if (err.code === "EADDRNOTAVAIL") {
		console.error(`\x1b[31m${opts.host} is not an address on this machine. Use 0.0.0.0 to accept remote connections.\x1b[0m`);
	} else {
		console.error(`\x1b[31mServer error: ${err.message}\x1b[0m`);
	}
	process.exit(1);
});
