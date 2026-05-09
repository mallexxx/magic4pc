var pkgInfo = require('./package.json');
var Service = require('webos-service');
var os = require('os');
var dgram = require('dgram');
var service = new Service(pkgInfo.name);

const broadcastPort = 42830;
const subscriptionPort = 42831;

const broadcastInterval = 1000; //ms

var modelName = 'Name unavailable';
service.call(
	'luna://com.webos.service.tv.systemproperty/getSystemInfo',
	{
		keys: ['modelName'],
	},
	function (inResponse) {
		var isSucceeded = inResponse.returnValue;

		if (isSucceeded) {
			modelName = inResponse.modelName;
		} else {
		}
	}
);

function getMACAddress() {
	var ifaces = os.networkInterfaces();
	for (var ifaceName of Object.keys(ifaces)) {
		if (
			ifaceName.indexOf('wlan') === 0 ||
			ifaceName.indexOf('eth') === 0 ||
			ifaceName.indexOf('Ethernet') === 0
		) {
			var iface = ifaces[ifaceName];
			for (var ifaceProps of iface) {
				if ('mac' in ifaceProps && ifaceProps.mac != '00:00:00:00:00:00') {
					return ifaceProps.mac;
				}
			}
		}
	}
	return null;
}

var unicastDataActive = false;
const clientTimeout = 3000;
const sendKeepaliveFrequency = 1000;
var unicastClient = null;
var unicastRInfo = null;
function startUnicastingData(client, rinfo, request) {
	unicastDataActive = true;
	unicastClient = client;
	unicastRInfo = rinfo;

	// Settings
	var settings = {};

	if ('updateFreq' in request) settings.updateFrequency = request.updateFreq;
	else settings.updateFrequency = 33;

	if ('filter' in request) settings.filter = request.filter;
	else
		settings.filter = [
			'returnValue',
			'deviceId',
			'coordinate',
			'gyroscope',
			'acceleration',
			'quaternion',
		];

	var clientKeepaliveTs = Date.now();
	client.on('message', function (msgBuf, rinfoKl) {
		if (rinfo.address === rinfoKl.address && rinfo.port === rinfoKl.port) {
			clientKeepaliveTs = Date.now();
		}
		//TODO: parse any incoming msg
	});

	var serviceKeepaliveTs = Date.now();
	var sendKeepalive = function () {
		var msg = JSON.stringify({t: 'keepalive'});
		client.send(msg, 0, msg.length, rinfo.port, rinfo.address);
		serviceKeepaliveTs = Date.now();
	};
	sendKeepalive();
	var ival = setInterval(function () {
		if (!unicastDataActive) {
			clearInterval(ival);
			return;
		}

		if (Date.now() - clientKeepaliveTs > clientTimeout) {
			// client timed out
			//TODO: enable keepalive
			unicastDataActive = false;

			var waitTimer = setInterval(function () {
				if (client == null) {
					clearInterval(waitTimer);
					startBroadcastingAdvertisement();
				}
			}, 100);
		} else if (Date.now() - serviceKeepaliveTs > sendKeepaliveFrequency) {
			sendKeepalive();
		}
	}, 1000);

	var options = {};
	options.callbackInterval = 1;
	options.subscribe = true;
	options.sleep = true;
	options.autoAlign = false;

	var lastUpdateTs = Date.now();

	var setupSensorSubscription = function () {
		var subscriptionHandle = service.subscribe(
			'luna://com.webos.service.mrcu/sensor/getSensorData',
			options
		);
		subscriptionHandle.on('response', function (inResponse) {
			if (!unicastDataActive) {
				subscriptionHandle.cancel();
				client.close();
				client = null;
				return;
			}
			if (Date.now() - lastUpdateTs < 1000 / settings.updateFrequency) {
				return true;
			}

			var payloadData = '';
			try {
				payloadData = buildUpdatePayload(inResponse.payload, settings).toString(
					'base64'
				);
				} catch (ex) {
					// Sensor data may be missing fields (e.g. no coordinate when remote lifted) — ignore silently
					return true;
			}

			var msg = {
				t: 'remote_update',
				payload: payloadData,
			};
			var msgStr = JSON.stringify(msg);
			client.send(msgStr, 0, msgStr.length, rinfo.port, rinfo.address);
			lastUpdateTs = Date.now();
			return true;
		});
		subscriptionHandle.on('cancel', function (msg) {
			if (!unicastDataActive) {
				return;
			}
			setupSensorSubscription();
		});
	};
	setupSensorSubscription();
}

function sendToClient(msg) {
	const data = JSON.stringify(msg);
	unicastClient.send(
		data,
		0,
		data.length,
		unicastRInfo.port,
		unicastRInfo.address
	);
}

function onInput(parameters) {
	sendToClient({
		t: 'input',
		parameters: parameters,
	});
}

function onMouse(parameters) {
	sendToClient({
		t: 'mouse',
		mouse: parameters,
	});
}

function onWheel(parameters) {
	sendToClient({
		t: 'wheel',
		wheel: parameters,
	});
}

function buildUpdatePayload(data, settings) {
	var size = 0;
	for (var entry of settings.filter) {
		switch (entry) {
			case 'returnValue':
				size += 1;
				break;
			case 'deviceId':
				size += 1;
				break;
			case 'coordinate':
				size += 4 * 2;
				break;
			case 'gyroscope':
				size += 4 * 3;
				break;
			case 'acceleration':
				size += 4 * 3;
				break;
			case 'quaternion':
				size += 4 * 4;
				break;
		}
	}

	var buffer = new Buffer(size);
	var offset = 0;
	for (var entry of settings.filter) {
		switch (entry) {
			case 'returnValue':
				buffer.writeUInt8(data.returnValue ? 1 : 0, offset++);
				break;
			case 'deviceId':
				buffer.writeUInt8(data.deviceId, offset++);
				break;
			case 'coordinate':
				{
					buffer.writeInt32LE(data.coordinate.x, offset);
					offset += 4;
					buffer.writeInt32LE(data.coordinate.y, offset);
					offset += 4;
				}
				break;
			case 'gyroscope':
				{
					buffer.writeFloatLE(data.gyroscope.x, offset);
					offset += 4;
					buffer.writeFloatLE(data.gyroscope.y, offset);
					offset += 4;
					buffer.writeFloatLE(data.gyroscope.z, offset);
					offset += 4;
				}
				break;
			case 'acceleration':
				{
					buffer.writeFloatLE(data.acceleration.x, offset);
					offset += 4;
					buffer.writeFloatLE(data.acceleration.y, offset);
					offset += 4;
					buffer.writeFloatLE(data.acceleration.z, offset);
					offset += 4;
				}
				break;
			case 'quaternion':
				{
					buffer.writeFloatLE(data.quaternion.q0, offset);
					offset += 4;
					buffer.writeFloatLE(data.quaternion.q1, offset);
					offset += 4;
					buffer.writeFloatLE(data.quaternion.q2, offset);
					offset += 4;
					buffer.writeFloatLE(data.quaternion.q3, offset);
					offset += 4;
				}
				break;
		}
	}
	return buffer;
}

var log = [];
var fs = require('fs');

function addLog(line) {
	var ts = new Date().toLocaleTimeString();
	var entry = '[' + ts + '] ' + line;
	console.log(entry);
	log.push(entry);
	if (log.length > 200) log.shift();
	// Debug: write to file so we can inspect from shell
	try { fs.appendFileSync('/tmp/m4p_debug.log', entry + '\n'); } catch(e) {}
}

// Persistent storage directory (survives reboot, writable by service)
var PERSISTENT_DIR = '/media/developer/apps/usr/palm/services/me.wouterdek.magic4pc.service';

// Track last used foreground app (excluding magic4pc itself)
var lastUsedAppId = null;
service.subscribe(
	'luna://com.webos.applicationManager/getForegroundAppInfo',
	{ subscribe: true },
	function (res) {
		if (res.returnValue && res.appId && res.appId !== 'me.wouterdek.magic4pc') {
			lastUsedAppId = res.appId;
			try { fs.writeFileSync(PERSISTENT_DIR + '/magic4pc-last-app', res.appId); } catch(e) {}
			addLog('foreground app: ' + res.appId);
		}
	}
);

var broadcastAdsActive = false;
function startBroadcastingAdvertisement() {
	broadcastAdsActive = true;

	var subscriptionClient = dgram.createSocket('udp4');
	var subscribeMsgHandler = function (msgBuf, rinfo) {
		try {
			var msg = JSON.parse(msgBuf.toString('utf8'));
			if ('t' in msg && msg.t == 'sub_sensor') {
				//todo: parse msg [Buffer] (pkt id, any config options)
				//subscriptionClient.off("message", subscribeMsgHandler);
				broadcastAdsActive = false;
				startUnicastingData(subscriptionClient, rinfo, msg);
			}
		} catch (ex) {}
	};
	subscriptionClient.on('message', subscribeMsgHandler);

	subscriptionClient.bind(subscriptionPort, undefined, function () {
		var broadcastClient = dgram.createSocket('udp4');
		broadcastClient.bind(broadcastPort, undefined, function () {
			broadcastClient.setBroadcast(true);

			var ival = setInterval(function () {
				if (broadcastAdsActive) {
					var msg = JSON.stringify({
						t: 'magic4pc_ad',
						version: 1,
						model: modelName,
						port: subscriptionPort,
						mac: getMACAddress(),
						//todo: mac addr or uuid, (modelname)
						//todo: ip addr+port
					});
					broadcastClient.send(
						msg,
						0,
						msg.length,
						broadcastPort,
						'255.255.255.255'
					);
				} else {
					broadcastClient.close();
					clearInterval(ival);
				}
			}, broadcastInterval);
		});
	});
}

var serviceActive = false;
var keepAliveActivity = null;
var pendingStart = false;
service.register('start', function (message) {
	if (serviceActive) {
		addLog('start called but already active');
		message.respond({});
		return;
	}
	pendingStart = true;

	addLog('Service starting v1.1.1');
	serviceActive = true;
	service.activityManager.create('keepAlive', function (activity) {
		keepAliveActivity = activity;
		addLog('keepAlive activity created');
	});
	startBroadcastingAdvertisement();
	addLog('Broadcasting started');
	pendingStart = false;
	message.respond({});
});

service.register('onInput', function (message) {
	if (unicastDataActive) {
		onInput(message.payload);
	}
	message.respond({
		//TODO
	});
});

service.register('onMouse', function (message) {
	if (unicastDataActive) {
		onMouse(message.payload);
	}
	message.respond({
		//TODO
	});
});

service.register('onWheel', function (message) {
	if (unicastDataActive) {
		onWheel(message.payload);
	}
	message.respond({
		//TODO
	});
});

service.register('stop', function (message) {
	if (!serviceActive) {
		addLog('stop called but not active');
		message.respond({});
		return;
	}

	addLog('Service stopping');
	serviceActive = false;
	service.activityManager.complete(keepAliveActivity, function (activity) {});
	keepAliveActivity = null;
	broadcastAdsActive = false;
	unicastDataActive = false;
	addLog('Service stopped');
	message.respond({});
	// If start was called while stop was in-flight, honour it now
	if (pendingStart) {
		pendingStart = false;
		addLog('Executing deferred start after stop');
		serviceActive = true;
		service.activityManager.create('keepAlive', function (activity) {
			keepAliveActivity = activity;
			addLog('keepAlive activity created');
		});
		startBroadcastingAdvertisement();
		addLog('Broadcasting started');
	}
});

service.register('query', function (message) {
	var newLog = log.splice(0);  // drain accumulated log entries
	message.respond({
		serviceActive: serviceActive,
		broadcastAdsActive: broadcastAdsActive,
		isConnected: unicastDataActive,
		unicastRInfo: unicastDataActive ? unicastRInfo : null,
		lastUsedAppId: (function() {
			if (lastUsedAppId) return lastUsedAppId;
			try { return fs.readFileSync(PERSISTENT_DIR + '/magic4pc-last-app', 'utf8').trim() || null; } catch(e) { return null; }
		})(),
		log: newLog,
	});
});

// Check if magic4pc should auto-launch default app on startup
// No state file = fresh boot → should launch
// After reading, writes 'running' marker to prevent double-launch
service.register('checkAutoLaunch', function (message) {
	try {
		var stateFile = '/tmp/magic4pc-run-state';
		var isFreshStart = false;
		try {
			var runState = fs.readFileSync(stateFile, 'utf8').trim();
			isFreshStart = (runState !== 'running');
		} catch(e) {
			// File doesn't exist = fresh start
			isFreshStart = true;
		}
		// Mark as running to prevent double-launch
		try { fs.writeFileSync(stateFile, 'running'); } catch(e) {}

		var appId = null;
		var resolvedAppId = null;
		try {
			var chosen = fs.readFileSync(PERSISTENT_DIR + '/magic4pc-settings', 'utf8').trim();
			if (chosen === '__last_used__') {
				try { chosen = fs.readFileSync(PERSISTENT_DIR + '/magic4pc-last-app', 'utf8').trim(); } catch(e2) { chosen = null; }
				if (!chosen) {
					try { chosen = fs.readFileSync('/tmp/magic4pc-last-app', 'utf8').trim(); } catch(e3) { chosen = null; }
				}
			}
			if (chosen && chosen !== 'none' && chosen !== '' && chosen !== 'me.wouterdek.magic4pc') {
				resolvedAppId = chosen;
			}
		} catch(e) {}

		if (isFreshStart) {
			appId = resolvedAppId;
		}
		addLog('checkAutoLaunch: freshStart=' + isFreshStart + ' appId=' + appId);
		message.respond({ returnValue: true, shouldLaunch: !!appId, appId: appId, resolvedAppId: resolvedAppId, isFreshStart: isFreshStart });
	} catch(e) {
		message.respond({ returnValue: false, errorText: e.message });
	}
});

// Persist chosen default app (persistent, survives reboot)
// Values: appId string, '__last_used__', or 'none'
service.register('setDefaultApp', function (message) {
	var appId = (message.payload && message.payload.appId) ? message.payload.appId : 'none';
	try {
		fs.writeFileSync(PERSISTENT_DIR + '/magic4pc-settings', appId);
		addLog('setDefaultApp: ' + appId);
		message.respond({ returnValue: true });
	} catch (e) {
		message.respond({ returnValue: false, errorText: e.message });
	}
});

// UI log relay — UI calls this to persist log lines to /tmp/m4p_debug.log
service.register('uiLog', function (message) {
	var line = (message.payload && message.payload.line) ? message.payload.line : '';
	addLog('[ui] ' + line);
	message.respond({ returnValue: true });
});

// Relay listApps — reads from /tmp/magic4pc-apps.json written by init.d (root, outside jail)
service.register('listApps', function (message) {
	try {
		var raw = JSON.parse(fs.readFileSync('/tmp/magic4pc-apps.json', 'utf8'));
		var srcApps = (raw.apps) ? raw.apps : [];
		var apps = srcApps
			.filter(function(a) { return a.id && a.title && a.visible !== false; })
			.map(function(a) { return { id: a.id, title: a.title }; })
			.sort(function(a, b) { return a.title.localeCompare(b.title); });
		addLog('listApps: returned ' + apps.length + ' apps');
		message.respond({ returnValue: true, apps: apps });
	} catch(e) {
		addLog('listApps: apps file not ready: ' + e.message);
		message.respond({ returnValue: false, apps: [], error: e.message });
	}
});
