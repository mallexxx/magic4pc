    /* eslint-disable no-unused-vars */

    import Button from '@enact/sandstone/Button';
    import {Dropdown} from '@enact/sandstone/Dropdown';
    import {SwitchItem} from '@enact/sandstone/SwitchItem';
    import Popup from '@enact/sandstone/Popup';
    import LS2Request from '@enact/webos/LS2Request';
    import React from 'react';

    const appId = 'me.wouterdek.magic4pc';

    class MainPanel extends React.Component {
        constructor(props) {
            super(props);

            this.startService = this.startService.bind(this);
            this.onButton = this.onButton.bind(this);
            this.onButtonDown = this.onButtonDown.bind(this);
            this.onButtonUp = this.onButtonUp.bind(this);
            this.stopService = this.stopService.bind(this);
            this.autostartToggle = this.autostartToggle.bind(this);
            this.queryServiceStatus = this.queryServiceStatus.bind(this);
            this.updateLog = this.updateLog.bind(this);
            this.onVisibilityChange = this.onVisibilityChange.bind(this);
            this.componentDidMount = this.componentDidMount.bind(this);
            this.componentWillUnmount = this.componentWillUnmount.bind(this);
            this.onInputSourceSelected = this.onInputSourceSelected.bind(this);
            this.handleOpenPopup = this.handleOpenPopup.bind(this);
            this.handleClosePopup = this.handleClosePopup.bind(this);
            this.onCursorVisibilityChange = this.onCursorVisibilityChange.bind(this);
            this.handleToggleLog = this.handleToggleLog.bind(this);

            this.state = {
                label: '',
                logLines: [],
                videoSource: 'ext://hdmi:1',
                popupOpen: false,
                logOpen: false,
                settingsButtonVisible: true,
                autostartEnabled: false,
            };
            this.logEndRef = React.createRef();
            this.restartUserActivityTimer();
            this.registerScreenSaverRequest(appId);
        }

       restartUserActivityTimer() {
          new LS2Request().send({
            service: 'luna://com.webos.surfacemanager.screenSaver/',
            method: 'restartUserActivityTimer',
            parameters: {},
            onSuccess: function onSuccess(res) {
              console.log('restartUserActivityTimer:', res);
            }
          });
        }

        respondToScreenSaverRequest(clientName, timestamp, ack) {
          new LS2Request().send({
            service: 'luna://com.webos.service.tvpower/',
            method: 'power/responseScreenSaverRequest',
            parameters: {
              clientName: clientName,
              timestamp: timestamp,
              ack: ack
            },
            onSuccess: function onSuccess(res) {
              console.log('respondToScreenSaverRequest:', res);
            }
          });
        }

        registerScreenSaverRequest(clientName) {
          let _this = this;
          new LS2Request().send({
            service: 'luna://com.webos.service.tvpower/',
            method: 'power/registerScreenSaverRequest',
            parameters: {
              clientName: clientName,
              subscribe: true
            },
            onSuccess: function onSuccess(res) {
              console.log('registerScreenSaverRequest:', res);
              if (res.timestamp) {
                _this.respondToScreenSaverRequest(clientName, res.timestamp, false); // Send NACK.
              }
            }
          });
        }

        appendLog(line) {
            const ts = new Date().toLocaleTimeString();
            this.setState(prev => ({
                logLines: [...prev.logLines.slice(-199), `[${ts}] ${line}`]
            }), () => {
                if (this.logEndRef.current) {
                    this.logEndRef.current.scrollIntoView({behavior: 'smooth'});
                }
            });
        }

        startService() {
            console.log('Requesting service start');
            this.appendLog('Starting service...');
            new LS2Request().send({
                service: 'luna://me.wouterdek.magic4pc.service/',
                method: 'start',
                onSuccess: (inResponse) => {
                    console.log('Service started');
                    this.appendLog('Service started OK');
                    this.updateLog();
                    return true;
                },
                onFailure: (inError) => {
                    const msg = 'Service start error: ' + JSON.stringify(inError);
                    console.log(msg);
                    this.appendLog(msg);
                    this.setState({label: 'Service start error'});
                    return;
                },
            });
        }

        onButton(keyCode, isDown) {
            this.appendLog('key ' + keyCode + (isDown ? ' down' : ' up'));
            new LS2Request().send({
                service: 'luna://me.wouterdek.magic4pc.service/',
                method: 'onInput',
                parameters: {
                    keyCode: keyCode,
                    isDown: isDown,
                },
                onSuccess: (inResponse) => {
                    return true;
                },
                onFailure: (inError) => {
                    this.appendLog('onInput error: ' + JSON.stringify(inError));
                    return;
                },
            });
        }

        onButtonDown(event) {
            // 13 (0xD) – enter
            // 37 (0x25) – left / 38 up / 39 right / 40 down
            // 48..57 – 0..9
            // 33 (0x21 pgup) – P+ / 34 P-
            // 403 – red / 404 – green / 405 – yellow / 406 – blue
            // 415 – play / 19 (0x13) – pause
            // 458 – GUIDE / 461 – back

            console.log(event.keyCode + ' down');

            // While settings panel is open: Back or Blue closes it, LIST toggles log, other keys blocked
            if (this.state.popupOpen) {
                if (event.keyCode === 461 /* BACK */ || event.keyCode === 406 /* BLUE */) {
                    this.handleClosePopup();
                } else if (event.keyCode === 1006 /* LIST */) {
                    this.handleToggleLog();
                }
                return;
            }

            if (event.keyCode === 406 /* BLUE */) {
                this.handleOpenPopup();
                return;
            }
            if (event.keyCode === 1006 /* LIST */) {
                this.handleToggleLog();
                return;
            }
            this.onButton(event.keyCode, true);
        }

        onButtonUp(event) {
            console.log(event.keyCode + ' up');
            if (this.state.popupOpen) {
                return;
            }
            this.onButton(event.keyCode, false);
        }

        stopService() {
            console.log('Requesting service stop');
            this.appendLog('Stopping service...');
            new LS2Request().send({
                service: 'luna://me.wouterdek.magic4pc.service/',
                method: 'stop',
                onSuccess: (inResponse) => {
                    console.log('Service stopped');
                    this.appendLog('Service stopped OK');
                    this.updateLog();
                    return true;
                },
                onFailure: (inError) => {
                    const msg = 'Service stop error: ' + JSON.stringify(inError);
                    console.log(msg);
                    this.appendLog(msg);
                    this.setState({label: 'Service stop error'});
                    return;
                },
            });
        }

        queryServiceStatus(onSuccess, onError) {
            new LS2Request().send({
                service: 'luna://me.wouterdek.magic4pc.service/',
                method: 'query',
                parameters: {},
                onSuccess: onSuccess,
                onFailure: onError,
            });
        }

        updateLog() {
            this.queryServiceStatus(
                (msg) => {
                    console.log(msg);
                    let label = '';
                    if (msg.isConnected) {
                        label =
                            'Connected to ' +
                            msg.unicastRInfo.address +
                            ':' +
                            msg.unicastRInfo.port;
                    } else if (msg.broadcastAdsActive) {
                        label = 'Waiting for client to connect';
                    } else if (!msg.serviceActive) {
                        label = 'Service disabled';
                    } else {
                        label = 'Service error';
                    }
                    this.setState({label: label});
                    if (msg.log) {
                        msg.log.forEach(line => this.appendLog('[svc] ' + line));
                    }
                },
                (inError) => {
                    const msg = 'Error retrieving service state: ' + JSON.stringify(inError);
                    console.log(msg);
                    this.appendLog(msg);
                    this.setState({label: 'Error retrieving service state'});
                }
            );
        }

        onVisibilityChange() {
            if (document.hidden) {
                this.appendLog('App hidden, stopping service');
                this.stopService();
                this.unregisterEIM();
            } else {
                this.appendLog('App visible, starting service');
                this.registerEIM();
                this.startService();
            }
        }

        onCursorVisibilityChange(e) {
            let isVisible = e.detail.visibility;
            this.setState({settingsButtonVisible: isVisible});
        }

        onMouse(e) {
            console.log(e.type);

            new LS2Request().send({
                service: 'luna://me.wouterdek.magic4pc.service/',
                method: 'onMouse',
                parameters: {
                    type: e.type, // mousedown, mouseup
                    x: e.screenX,
                    y: e.screenY,
                },
            });
        }

        onWheel(e) {
            const dir = e.wheelDelta > 0 ? 'up' : 'down';
            console.log('wheel', dir);
            this.appendLog('wheel ' + dir);

            new LS2Request().send({
                service: 'luna://me.wouterdek.magic4pc.service/',
                method: 'onWheel',
                parameters: {
                    x: e.screenX,
                    y: e.screenY,
                    delta: e.wheelDelta,
                },
            });
        }

        registerEIM() {
            new LS2Request().send({
                service: 'luna://com.webos.service.eim/',
                method: 'addDevice',
                parameters: {
                    appId,
                    pigImage: '',
                    mvpdIcon: '',
                    showPopup: false,
                    label: 'Magic4PC',
                },
                onSuccess: (resp) => {
                    console.log('EIM registered:', resp);
                    this.appendLog('EIM registered OK');
                    this.setState({autostartEnabled: true});
                },
                onFailure: (err) => {
                    this.appendLog('EIM register failed: ' + JSON.stringify(err));
                    console.warn('EIM register failed:', err);
                },
            });
        }

        unregisterEIM() {
            new LS2Request().send({
                service: 'luna://com.webos.service.eim/',
                method: 'deleteDevice',
                parameters: {appId},
                onSuccess: (resp) => {
                    console.log('EIM unregistered:', resp);
                    this.setState({autostartEnabled: false});
                },
                onFailure: (err) => {
                    console.warn('EIM unregister failed:', err);
                },
            });
        }

        componentDidMount() {
            document.addEventListener('keydown', this.onButtonDown, false);
            document.addEventListener('keyup', this.onButtonUp, false);
            document.addEventListener(
                'visibilitychange',
                this.onVisibilityChange,
                false
            );
            document.addEventListener(
                'cursorStateChange',
                this.onCursorVisibilityChange,
                false
            );
            document.addEventListener('mousedown', this.onMouse, false);
            document.addEventListener('mouseup', this.onMouse, false);
            document.addEventListener('wheel', this.onWheel, false);
            this.loadSettings();

            // Auto-register as EIM device so system keys reach the app
            this.registerEIM();

            // Start service immediately on mount (don't wait for visibilitychange)
            this.startService();
        }

        autostartToggle(evt) {
            console.info('autostart toggle:', evt);
            if (evt.selected) {
                new LS2Request().send({
                    service: 'luna://com.webos.service.eim/',
                    method: 'addDevice',
                    parameters: {
                        appId,
                        pigImage: '',
                        mvpdIcon: '',
                        showPopup: true,
                        label: 'Magic4PC',
                    },
                    onSuccess: (resp) => {
                        this.setState({autostartEnabled: evt.selected});
                    },
                    onFailure: (err) => {
                        console.warn(err);
                    },
                });
            } else {
                new LS2Request().send({
                    service: 'luna://com.webos.service.eim/',
                    method: 'deleteDevice',
                    parameters: {
                        appId,
                    },
                    onSuccess: (resp) => {
                        this.setState({autostartEnabled: evt.selected});
                    },
                    onFailure: (err) => {
                        console.warn(err);
                    },
                });
            }
        }

        componentWillUnmount() {
            document.removeEventListener('keydown', this.onButtonPress, false);
            document.removeEventListener('keyup', this.onButtonPress, false);
            document.removeEventListener(
                'visibilitychange',
                this.onVisibilityChange,
                false
            );
            document.removeEventListener(
                'cursorStateChange',
                this.onCursorVisibilityChange,
                false
            );
            this.unregisterEIM();
        }

        inputSourceLabels = [
            'HDMI 1',
            'HDMI 2',
            'HDMI 3',
            'HDMI 4',
            'Comp 1',
            'AV 1',
            'AV 2',
        ];

        inputSources = [
            'ext://hdmi:1',
            'ext://hdmi:2',
            'ext://hdmi:3',
            'ext://hdmi:4',
            'ext://comp:1',
            'ext://av:1',
            'ext://av:2',
        ];

        onInputSourceSelected({selected}) {
            let selectedSource = this.inputSources[selected];
            console.info('Switching sources to:', selectedSource, selected);
            this.setState(
                {
                    videoSource: selectedSource,
                },
                () => {
                    this.saveSettings();
                }
            );

            let vidElem = document.getElementById('vidElem');
            let vidSrcElem = document.getElementById('vidSrcElem');

            vidElem.pause();
            vidSrcElem.src = selectedSource;
            vidElem.load();
            vidElem.play();
        }

        saveSettings() {
            window.localStorage.magic4pcSettings = JSON.stringify({
                videoSource: this.state.videoSource,
            });
        }

        loadSettings() {
            let savedSettings;
            try {
                savedSettings = JSON.parse(window.localStorage.magic4pcSettings);
            } catch (err) {
                console.warn('Unable to parse:', err);
            }

            let settings = {
                videoSource: this.inputSources[0],
                ...savedSettings,
            };
            console.info('Settings:', settings);

            this.onInputSourceSelected({
                selected: this.inputSources.indexOf(settings.videoSource),
            });
        }

        overlayStyle = {
            position: 'fixed',
            width: '100%',
            height: '100%',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 2,
        };

        handleOpenPopup() {
            this.setState({popupOpen: true});
            this.updateLogTask = setInterval(() => this.updateLog(), 1000);
        }

        handleClosePopup() {
            this.setState({popupOpen: false});
            clearInterval(this.updateLogTask);
        }

        handleToggleLog() {
            this.setState(prev => ({logOpen: !prev.logOpen}));
        }

        logPanelStyle = {
            position: 'fixed',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            background: 'rgba(0,0,0,0.35)',
            color: '#0f0',
            fontFamily: 'monospace',
            fontSize: '0.75em',
            overflowY: 'auto',
            padding: '16px',
            paddingBottom: '35vh',
            zIndex: 10,
        };

        render() {
            const {logOpen, logLines, label, popupOpen, autostartEnabled, videoSource, settingsButtonVisible} = this.state;
            const version = '1.1.0 (' + process.env.BUILD_DATE + ')';

            return (
                <div>
                    <video id="vidElem" autoPlay>
                        <source
                            id="vidSrcElem"
                            type="service/webos-external"
                            src={videoSource}
                        />
                    </video>
                    <div style={this.overlayStyle}>
                        <Popup open={popupOpen} onClose={this.handleClosePopup}>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                <p id="status">{label}</p>
                                <span style={{opacity: 0.5, fontSize: '0.8em'}}>v{version}</span>
                            </div>
                            <div>
                                <Dropdown
                                    defaultSelected={this.inputSources.indexOf(videoSource)}
                                    title="Input source"
                                    onSelect={this.onInputSourceSelected}
                                >
                                    {this.inputSourceLabels}
                                </Dropdown>
                                <Button onClick={this.startService} size="small">
                                    Enable
                                </Button>
                                <Button onClick={this.stopService} size="small">
                                    Disable
                                </Button>
                                <div style={{width: '12em', display: 'inline-block'}}>
                                    <SwitchItem
                                        selected={autostartEnabled}
                                        onToggle={this.autostartToggle}
                                    >
                                        Autostart
                                    </SwitchItem>
                                </div>
                                <Button onClick={this.handleToggleLog} size="small">
                                    {logOpen ? 'Hide Log' : 'Show Log'}
                                </Button>
                            </div>
                        </Popup>
                    </div>

                    {logOpen && (
                        <div style={this.logPanelStyle}>
                            {logLines.length === 0
                                ? <span>No log entries yet</span>
                                : logLines.map((line, i) => <div key={i}>{line}</div>)
                            }
                            <div ref={this.logEndRef} />
                        </div>
                    )}
                </div>
            );
        }
    }

    export default MainPanel;
