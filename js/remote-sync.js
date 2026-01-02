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
        const motorIdRaw = String(sourceData.motor_id || sourceData.motor || sourceData.id || '');
        const motorIdStr = motorIdRaw.replace(/[^0-9]/g, '') || motorIdRaw;
        const action = sourceData.action || sourceData.cmd || '';

        // Normalize values
        const degree = sourceData.degree !== undefined ? sourceData.degree : sourceData.deg;
        const rpm = sourceData.rpm !== undefined ? sourceData.rpm : sourceData.rpm_meas;
        const pwm = sourceData.pwm !== undefined ? sourceData.pwm :
            (sourceData.duty !== undefined ? sourceData.duty * 255 : sourceData.value);
        const motorAngles = window.motorAngles || (window.motorAngles = {});

        // 4. Update Telemetry Dashboard
        if (motorIdStr && motorIdStr === this.targetMotorId) {
            // Update gauges if feedback-like data is present
            if (rpm !== undefined || degree !== undefined || pwm !== undefined) {
                this.updateDashboard({ rpm, degree, pwm });

                // Also sync animation speed if it's a speed command or feedback
                if (rpm !== undefined && rpm !== 0) {
                    const animSpeedInput = document.getElementById('animSpeed');
                    if (animSpeedInput) {
                        animSpeedInput.value = Math.abs(Math.round(rpm));
                    }
                }
            } else if (action === 'pwm' || action === 'set_speed' || (data.status === 'ok' && sourceData.value !== undefined)) {
                // Special case for status:ok or specific PWM updates
                if (action === 'pwm' || sourceData.cmd === 'pwm') {
                    this.updateDashboard({ pwm: sourceData.value });
                }
            }
        }

        // 5. Update "Target Position" display from control events
        if (action === 'set_angle' || action === 'move_to') {
            // Stop animation if we are jumping to a position
            if (this.isSyncing && window.stopAnimation) {
                window.stopAnimation(this.onUpdate);
            }

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
                let boundStep = null;
                const topoArea = document.getElementById('topology');

                if (topoArea && topoArea.value) {
                    try {
                        const topo = JSON.parse(topoArea.value);
                        const steps = topo.steps || [];
                        boundStep = steps.find(s => s.type === 'input_crank' && String(s.physical_motor) === motorIdStr);

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
                    const actualAngle = parseFloat(degree);
                    const resolvedMotorId = motorIdStr || this.targetMotorId || '1';
                    const offsets = window.motorAngleZeroOffsets || {};
                    const offsetVal = Number(offsets[resolvedMotorId]) || 0;
                    const displayAngle = actualAngle - offsetVal;

                    if (resolvedMotorId) {
                        motorAngles[resolvedMotorId] = actualAngle;
                        const slider = document.getElementById(`motorAngle_M${resolvedMotorId}`);
                        const label = document.getElementById(`motorAngleValue_M${resolvedMotorId}`);
                        if (slider) slider.value = String(displayAngle);
                        if (label) label.textContent = `${Math.round(displayAngle)}°`;

                        const thetaInput = document.getElementById('theta');
                        if (thetaInput && resolvedMotorId === '1') {
                            thetaInput.value = String(displayAngle);
                            thetaInput.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }

                    if (!boundStep) {
                        const thetaSlider = document.getElementById('thetaSlider');
                        if (thetaSlider) {
                            thetaSlider.value = displayAngle;

                            // 1. Update Label manually (Immediate feedback)
                            const valLabel = document.getElementById('thetaSliderValue');
                            if (valLabel) valLabel.textContent = `${Math.round(displayAngle)}°`;

                            // 2. Dispatch event for other listeners (like hidden theta input)
                            thetaSlider.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }

                    // 3. Force simulation update
                    this.onUpdate();
                }
            }
        }

        // 7. Handle Animation Control (Speed Mode)
        if (this.isSyncing) {
            if (action === 'speed' || action === 'set_speed') {
                const targetRpm = sourceData.rpm !== undefined ? sourceData.rpm : sourceData.value;
                if (targetRpm !== undefined) {
                    const absRpm = Math.abs(parseFloat(targetRpm));
                    if (absRpm > 0.1) {
                        // Update animation speed input first
                        const animSpeedInput = document.getElementById('animSpeed');
                        if (animSpeedInput) animSpeedInput.value = Math.round(absRpm);

                        const resolvedMotorId = motorIdStr || this.targetMotorId || '1';
                        window.activeMotorForAnimation = resolvedMotorId;

                        // Start animation if not already playing
                        if (window.startAnimation) {
                            window.startAnimation(this.onUpdate, parseFloat(targetRpm), resolvedMotorId);
                        }
                    } else {
                        if (window.stopAnimation) window.stopAnimation(this.onUpdate);
                    }
                }
            } else if (action === 'mode' && sourceData.value === 'idle') {
                if (window.stopAnimation) window.stopAnimation(this.onUpdate);
            }

            if (motorIdStr && motorIdStr === this.targetMotorId && rpm !== undefined) {
                this.updateDashboard({ rpm });
            }
        }
    }

    updateDashboard(data) {
        const rpmEl = document.getElementById('valRpm');
        const degEl = document.getElementById('valDeg');
        const pwmText = document.getElementById('valPwmText');
        const pwmBar = document.getElementById('valPwmBar');

        if (rpmEl && data.rpm !== undefined) {
            rpmEl.textContent = data.rpm.toFixed(1);
        }
        if (degEl && data.degree !== undefined) {
            degEl.textContent = `${data.degree.toFixed(1)}°`;
        }

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

    setSync(enabled) {
        this.isSyncing = !!enabled;
        console.log(`[RemoteSync] Sync with hardware: ${this.isSyncing}`);

        // If syncing is disabled, stop any running animation
        if (!this.isSyncing && window.stopAnimation) {
            window.stopAnimation(this.onUpdate);
        }
    }

    setZero() {
        const motorId = this.targetMotorId || '1';
        if (!window.motorAngleZeroOffsets) window.motorAngleZeroOffsets = {};
        const offsets = window.motorAngleZeroOffsets;
        const oldOffset = Number(offsets[motorId]) || 0;

        const slider = document.getElementById(`motorAngle_M${motorId}`);
        const label = document.getElementById(`motorAngleValue_M${motorId}`);
        const displayVal = slider ? Number(slider.value) : NaN;

        const motorAngles = window.motorAngles || {};
        let actualVal = Number.isFinite(Number(motorAngles[motorId]))
            ? Number(motorAngles[motorId])
            : NaN;

        if (!Number.isFinite(actualVal) && Number.isFinite(displayVal)) {
            actualVal = oldOffset + displayVal;
        }

        if (!Number.isFinite(actualVal)) {
            // Fallback: use current hardware degree as actual
            const degEl = document.getElementById('valDeg');
            if (degEl) {
                actualVal = parseFloat(degEl.textContent);
            }
        }

        if (!Number.isFinite(actualVal)) return;

        // Use actual value as the new zero baseline to avoid stale slider state.
        const newOffset = actualVal;
        offsets[motorId] = Number.isFinite(newOffset) ? newOffset : oldOffset;
        window.motorAngleZeroOffsets = offsets;

        if (!window.motorAngles) window.motorAngles = {};
        window.motorAngles[motorId] = actualVal;

        if (slider) slider.value = '0';
        if (label) label.textContent = '0°';

        if (this.onUpdate) this.onUpdate();
        console.log(`[RemoteSync] Set Zero. Offset: ${offsets[motorId]}`);
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

