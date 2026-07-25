let uuid;
let websocket;
let currentSettings = {};

/**
 * Called by Stream Deck when the Property Inspector loads.
 */
function connectElgatoStreamDeckSocket(inPort, inPropertyInspectorUUID, inRegisterEvent, _inInfo, inActionInfo) {
	uuid = inPropertyInspectorUUID;

	var actionInfo = typeof inActionInfo === "string" ? JSON.parse(inActionInfo) : inActionInfo;
	var controller = actionInfo && actionInfo.payload && actionInfo.payload.controller;
	updateDialVisibility(controller);

	websocket = new WebSocket("ws://127.0.0.1:" + inPort);

	websocket.onopen = function () {
		websocket.send(
			JSON.stringify({
				event: inRegisterEvent,
				uuid: uuid
			})
		);

		websocket.send(
			JSON.stringify({
				event: "getSettings",
				context: uuid
			})
		);
	};

	websocket.onmessage = function (evt) {
		const data = JSON.parse(evt.data);
		if (data.event === "didReceiveSettings") {
			if (data.payload && data.payload.controller) {
				updateDialVisibility(data.payload.controller);
			}
			loadSettings(data.payload.settings);
		}
	};
}

/**
 * Show/hide the dial-only section based on the action's controller type.
 */
function updateDialVisibility(controller) {
	document.getElementById("dialSection").style.display = controller === "Encoder" ? "block" : "none";
}

/**
 * Populate UI fields from settings.
 */
function loadSettings(settings) {
	if (!settings) return;

	// Preserve plugin-side fields the PI doesn't render (e.g. currentState)
	currentSettings = Object.assign({}, settings);

	var desiredStates = settings.desiredStates || 1;
	document.getElementById("desiredStates").value = desiredStates;

	for (var i = 0; i < 5; i++) {
		var pressedEl = document.getElementById("commandPressed" + i);
		var releasedEl = document.getElementById("commandReleased" + i);
		if (pressedEl) pressedEl.value = settings["commandPressed" + i] || "";
		if (releasedEl) releasedEl.value = settings["commandReleased" + i] || "";
	}

	document.getElementById("commandTouch").value = settings.commandTouch || "";
	document.getElementById("commandRotateLeft").value = settings.commandRotateLeft || "";
	document.getElementById("commandRotateRight").value = settings.commandRotateRight || "";

	updateStateVisibility(desiredStates);
}

/**
 * Gather UI fields and send settings to the plugin.
 */
function saveSettings() {
	if (!websocket || websocket.readyState !== WebSocket.OPEN) return;

	var settings = Object.assign({}, currentSettings);
	settings.desiredStates = parseInt(document.getElementById("desiredStates").value) || 1;

	for (var i = 0; i < 5; i++) {
		settings["commandPressed" + i] = document.getElementById("commandPressed" + i).value;
		settings["commandReleased" + i] = document.getElementById("commandReleased" + i).value;
	}

	settings.commandTouch = document.getElementById("commandTouch").value;
	settings.commandRotateLeft = document.getElementById("commandRotateLeft").value;
	settings.commandRotateRight = document.getElementById("commandRotateRight").value;

	currentSettings = settings;

	websocket.send(
		JSON.stringify({
			event: "setSettings",
			context: uuid,
			payload: settings
		})
	);
}

/**
 * Handle the desired states number input change.
 */
function setDesiredState() {
	var ele = document.getElementById("desiredStates");
	if (ele.value > 5) ele.value = 5;
	else if (ele.value <= 0) ele.value = 1;

	updateStateVisibility(parseInt(ele.value));
	saveSettings();
}

/**
 * Show/hide state sections based on desired state count.
 */
function updateStateVisibility(desiredStates) {
	for (var i = 0; i < desiredStates; i++) {
		document.getElementById("State" + i).style.display = "inline";
	}
	for (var i = desiredStates; i < 5; i++) {
		document.getElementById("State" + i).style.display = "none";
	}
}
