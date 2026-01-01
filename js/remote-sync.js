/**
 * RemoteSync - Handles WebSocket communication with the PyQt Master
 * Acts as a slave/digital twin receiver.
 */
export class RemoteSync {
    constructor(options = {}) {
        this.onUpdate = options.update || (() => { });
        this.targetMotorId = '1';
        this.degreeOffset = 0;
        this.isSyncing = false;

        this.ws = null;
        this.statusText = null;
        this.statusDot = null;
        this.onStatusChange = options.onStatusChange || null;

        this.init();
    }

    init() {
        const url = 'ws://127.0.0.1:8765';
        console.log(`[RemoteSync] Connecting to ${url}...`);

        try {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                console.log('[RemoteSync] WebSocket Connected');
                if (this.onStatusChange) this.onStatusChange(true);
                this.updateRemoteStatusBadge('CONNECTED', '#2ecc71');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleIncomingData(data);
                } catch (e) {
                    console.error('[RemoteSync] Error parsing JSON:', e);
                }
            };

            this.ws.onclose = () => {
                console.log('[RemoteSync] WebSocket Closed');
                if (this.onStatusChange) this.onStatusChange(false);
                this.updateRemoteStatusBadge('OFFLINE', '#e74c3c');
            };

            this.ws.onerror = (err) => {
                console.error('[RemoteSync] WebSocket Error:', err);
                this.updateRemoteStatusBadge('ERROR', '#e74c3c');
            };
        } catch (e) {
            console.error('[RemoteSync] Failed to initialize WebSocket:', e);
        }
    }

    handleIncomingData(data) {
        if (window.DEBUG_SYNC) console.log('[RemoteSync] Processing:', data);

        // 1. Unpack Payload if present (Common in Control Events)
        const sourceData = data.payload || data;

        // 2. Handle array of motors (Common in Hardware Feedback)
        if (Array.isArray(sourceData.motors)) {
            sourceData.motors.forEach(m => {
                // Recursively handle each motor as a flat object
                this.handleIncomingData({
                    ...data,
                    payload: null, // Clear payload to avoid infinite loop
                    ...m
                });
            });
            return;
        }

        // 3. Normalize Keys (motor vs motor_id, value vs degree)
        const motorIdStr = String(sourceData.motor_id || sourceData.motor || sourceData.id || '');
        const action = sourceData.action || sourceData.cmd || '';

        // Normalize values
        const degree = sourceData.degree !== undefined ? sourceData.degree : sourceData.deg;
        const rpm = sourceData.rpm !== undefined ? sourceData.rpm : sourceData.rpm_meas;
        const pwm = sourceData.pwm !== undefined ? sourceData.pwm :
            (sourceData.duty !== undefined ? sourceData.duty * 255 : sourceData.value);

        // 4. Update Telemetry Dashboard
        if (motorIdStr && motorIdStr === this.targetMotorId) {
            // Update gauges if feedback-like data is present
            if (rpm !== undefined || degree !== undefined || pwm !== undefined) {
                this.updateDashboard({ rpm, degree, pwm });
            } else if (action === 'pwm' || action === 'set_speed' || (data.status === 'ok' && sourceData.value !== undefined)) {
                // Special case for status:ok or specific PWM updates
                if (action === 'pwm' || sourceData.cmd === 'pwm') {
                    this.updateDashboard({ pwm: sourceData.value });
                }
            }
        }

        // 5. Update "Target Position" display from control events
        if (action === 'set_angle' || action === 'move_to') {
            if (!motorIdStr || motorIdStr === this.targetMotorId) {
                const targetEl = document.getElementById('valTargetDeg');
                const targetVal = sourceData.deg !== undefined ? sourceData.deg : sourceData.value;
                if (targetEl && targetVal !== undefined) {
                    targetEl.textContent = `${parseFloat(targetVal).toFixed(1)}°`;
                }
            }
        }

        // 6. Drive Simulation if Syncing is enabled
        if (this.isSyncing && degree !== undefined) {
            // Only drive if it's a position update or motor feedback
            const isPositionUpdate = (action === 'set_angle' || action === 'move_to' || data.type === 'motor_feedback' || degree !== undefined);

            if (isPositionUpdate) {
                let shouldDriveSim = false;
                const topoArea = document.getElementById('topology');

                if (topoArea && topoArea.value) {
                    try {
                        const topo = JSON.parse(topoArea.value);
                        const steps = topo.steps || [];
                        const boundStep = steps.find(s => s.type === 'input_crank' && String(s.physicalMotor) === motorIdStr);

                        if (boundStep) {
                            shouldDriveSim = true;
                        } else if (motorIdStr === this.targetMotorId || (!motorIdStr && this.targetMotorId === '1')) {
                            shouldDriveSim = true;
                        }
                    } catch (e) {
                        if (motorIdStr === this.targetMotorId) shouldDriveSim = true;
                    }
                } else if (motorIdStr === this.targetMotorId) {
                    shouldDriveSim = true;
                }

                if (shouldDriveSim) {
                    const thetaSlider = document.getElementById('thetaSlider');
                    if (thetaSlider) {
                        const newAngle = (parseFloat(degree) - this.degreeOffset);
                        thetaSlider.value = newAngle;

                        // 1. Update Label manually (Immediate feedback)
                        const valLabel = document.getElementById('thetaSliderValue');
                        if (valLabel) valLabel.textContent = `${Math.round(newAngle)}°`;

                        // 2. Dispatch event for other listeners (like hidden theta input)
                        thetaSlider.dispatchEvent(new Event('input', { bubbles: true }));

                        // 3. Force simulation update
                        this.onUpdate();
                    }
                }
            }
        }
    }

    updateDashboard(data) {
        const rpmEl = document.getElementById('valRpm');
        const degEl = document.getElementById('valDeg');
        const pwmText = document.getElementById('valPwmText');
        const pwmBar = document.getElementById('valPwmBar');

        if (rpmEl) rpmEl.textContent = data.rpm !== undefined ? data.rpm.toFixed(1) : '---';
        if (degEl) degEl.textContent = data.degree !== undefined ? `${data.degree.toFixed(1)}°` : '---';

        if (pwmText && data.pwm !== undefined) {
            const percent = Math.min(100, Math.max(0, (data.pwm / 255) * 100));
            pwmText.textContent = `${Math.round(percent)}%`;
            if (pwmBar) pwmBar.style.width = `${percent}%`;
        }
    }

    setTargetMotor(id) {
        this.targetMotorId = String(id);
        console.log(`[RemoteSync] Target motor changed to M${id}`);
    }

    setZero() {
        // Use current hardware degree as offset
        const degEl = document.getElementById('valDeg');
        if (degEl) {
            const currentDeg = parseFloat(degEl.textContent);
            if (!isNaN(currentDeg)) {
                this.degreeOffset = currentDeg;
                console.log(`[RemoteSync] Set Zero. Offset: ${this.degreeOffset}`);
            }
        }
    }

    setSync(enabled) {
        this.isSyncing = enabled;
        console.log(`[RemoteSync] Motor Sync tracking: ${enabled}`);
    }

    updateRemoteStatusBadge(text, color) {
        const badge = document.getElementById('remoteStatusBadge');
        if (badge) {
            badge.textContent = text;
            badge.style.background = color;
            badge.style.color = '#fff';
        }
    }

    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
