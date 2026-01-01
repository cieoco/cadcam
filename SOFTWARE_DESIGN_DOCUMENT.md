# Software Design Document (SDD) - Mechanism Digital Twin & Motor Control System

## 1. System Overview
The system is designed to provide a real-time digital twin and control interface for physical motor mechanisms. It bridges the gap between high-level GUI control, real-time mechanism simulation, and low-level motor firmware.

### 1.1 Core Components
- **Master End (PyQt6 GUI):** The central command hub (`main.py`). It manages the physical connection to motors, initiates control sequences, and broadcasts command data to web-based digital twins.
- **Slave End (Web Interface):** The digital twin simulation (`mechanism.html`). It provides a visual 2D simulation of the mechanism, displays real-time telemetry from physical motors, and can track the master's movements.
- **Hardware End (ESP32 Firmware):** Controls the physical DC motors, monitors encoders, and reports telemetry (RPM, Position, PWM Duty) back to the Master/Slaves.

---

## 2. Communication Protocol
The system uses **JSON over WebSockets** for low-latency, real-time synchronization.

### 2.1 Network Topology
- The **PyQt Master** acts as a WebSocket server.
- The **Web Interface** acts as a WebSocket client (Slave/Digital Twin).
- The **ESP32** communicates with the Master via Serial or WiFi (TCP/UDP).

### 2.2 Data Structures
#### 2.2.1 Motor Feedback (`motor_feedback`)
Sent from Master to Slaves to update the real-time dashboard.
```json
{
  "type": "motor_feedback",
  "motor_id": 1,
  "rpm": 120.5,
  "degree": 45.2,
  "pwm": 128
}
```

#### 2.2.2 Control Events (`control_event`)
Broadcasted by Master when a control action is taken (e.g., slider moved).
```json
{
  "type": "control_event",
  "action": "set_angle",
  "value": 90.0
}
```

---

## 3. Web Interface (Digital Twin) Design
The web interface serves as a high-fidelity visualizer and diagnostic dashboard.

### 3.1 Mechanism Wizard
Allows interactive design of mechanisms using:
- **Add Point:** Create grounded or floating joints on the canvas.
- **Draw Link:** Connect joints with bars or multi-point bodies.
- **Select/Edit:** Modify component properties like length, color, and attachment points.

### 3.2 Motor Sync Dashboard
A specialized UI component in the web interface that provides:
- **Real-time Gauges:** Visualizing RPM, Angle, and PWM.
- **Motor Selector:** Choose which physical motor (M1-M4) to track in the simulation.
- **Set Zero:** Trigger an angle recalibration for the selected motor.
- **Remote Status:** Indicate connection health between the web client and the Master application.

---

## 4. Operational Modes
### 4.1 Standalone Simulation
The web interface operates independently, allowing users to design and simulate mechanisms without hardware connection.

### 4.2 Remote Sync Mode (Digital Twin)
When enabled via the "Enable Remote Sync" checkbox:
1. The web interface connects to the PyQt Master.
2. The simulation's drive parameter (e.g., $\theta$) is automatically updated based on incoming `control_event` or `motor_feedback`.
3. The dashboard displays the live state of the physical hardware.

---

## 5. Security & Stability
- **Connection Guards:** Prevents multiple WebSocket initializations to avoid port conflicts.
- **Error Handling:** Graceful degradation if the WebSocket connection is lost (dashboard reflects "Offline" status).
- **Coordinate Transformation:** Precise mapping between screen/SVG coordinates and CAD world coordinates for accurate drawing.
