import { useState } from 'react'
import type { DeviceStatus, PortInfo } from '../types'

interface Props {
	status: DeviceStatus
	onConnected: () => void
}

const isWindows = navigator.platform.startsWith('Win')

export default function DevicePanel({ status, onConnected }: Props) {
	const api = window.pywebview?.api

	const [ports, setPorts] = useState<PortInfo[]>([])
	const [dataPort, setDataPort] = useState('')
	const [cmdPort, setCmdPort] = useState('')
	const [loadingPorts, setLoadingPorts] = useState(false)
	const [manualMsg, setManualMsg] = useState<{ ok: boolean; text: string } | null>(null)
	const [diagPorts, setDiagPorts] = useState<
		{ device: string; description: string; is_teensy: boolean }[]
	>([])

	const loadPorts = async () => {
		if (!api) return
		setLoadingPorts(true)
		const res = await api.list_ports()
		if (res.ok && res.data) setPorts(res.data)
		setLoadingPorts(false)
	}

	const connectManual = async () => {
		if (!api || !dataPort || !cmdPort) return
		setManualMsg(null)
		const res = await api.connect_manual(dataPort, cmdPort)
		if (res.ok) {
			setManualMsg({ ok: true, text: res.data ?? 'Connected' })
			onConnected()
		} else {
			setManualMsg({ ok: false, text: res.error ?? 'Connection failed' })
		}
	}

	const runDiag = async () => {
		if (!api) return
		const res = await api.diagnose_windows_ports()
		if (res.ok && Array.isArray(res.data)) setDiagPorts(res.data)
	}

	return (
		<div>
			<h2 className="panel-title">Device Connection</h2>

			{/* Current status */}
			<div className="card">
				<div className="card-title">Status</div>
				{status.connected ? (
					<>
						<div className="row" style={{ marginBottom: 6 }}>
							<span className="status-dot connected" />
							<strong>Connected</strong>
						</div>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
							<div>
								<div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>Firmware</div>
								<div className="mono">{status.fw_ver ?? '—'}</div>
							</div>
							<div>
								<div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>Device ID</div>
								<div className="mono">{status.device_id ?? '—'}</div>
							</div>
						</div>
					</>
				) : (
					<div className="row">
						<span className="status-dot disconnected" />
						<span className="muted">
							{status.error ?? 'No device connected — use the Connect button in the header.'}
						</span>
					</div>
				)}
			</div>

			{/* Manual port selection */}
			<div className="card">
				<div className="card-title">Manual Port Selection</div>
				<p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
					If auto-detection fails, list available ports and specify them manually.
				</p>
				<button
					className="btn btn-secondary"
					onClick={loadPorts}
					disabled={loadingPorts}
					style={{ marginBottom: 12 }}
				>
					{loadingPorts ? <span className="spinner spinner-dark" /> : '↺'}
					{loadingPorts ? ' Scanning…' : ' List Available Ports'}
				</button>

				{ports.length > 0 && (
					<div className="table-wrap" style={{ marginBottom: 12 }}>
						<table>
							<thead>
								<tr>
									<th>Device</th>
									<th>Description</th>
									<th>VID</th>
									<th>PID</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{ports.map((p) => (
									<tr key={p.device}>
										<td className="mono">{p.device}</td>
										<td>{p.description}</td>
										<td className="mono">{p.vid ?? '—'}</td>
										<td className="mono">{p.pid ?? '—'}</td>
										<td>
											<div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
												<button
													className="btn btn-secondary"
													style={{ padding: '3px 8px', fontSize: 11 }}
													onClick={() => setDataPort(p.device)}
												>
													Data
												</button>
												<button
													className="btn btn-secondary"
													style={{ padding: '3px 8px', fontSize: 11 }}
													onClick={() => setCmdPort(p.device)}
												>
													Cmd
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				<div className="field-row" style={{ marginBottom: 8 }}>
					<div className="field">
						<label>Data port</label>
						<input
							placeholder="/dev/cu.usbmodem1 or COM3"
							value={dataPort}
							onChange={(e) => setDataPort(e.target.value)}
						/>
					</div>
					<div className="field">
						<label>Command port</label>
						<input
							placeholder="/dev/cu.usbmodem2 or COM4"
							value={cmdPort}
							onChange={(e) => setCmdPort(e.target.value)}
						/>
					</div>
					<button
						className="btn btn-primary"
						onClick={connectManual}
						disabled={!dataPort || !cmdPort}
					>
						Connect
					</button>
				</div>

				{manualMsg && (
					<div className={`alert ${manualMsg.ok ? 'alert-success' : 'alert-error'}`}>
						{manualMsg.text}
					</div>
				)}
			</div>

			{/* Windows diagnostics */}
			<div className="card" style={!isWindows ? { opacity: 0.45, pointerEvents: 'none' } : undefined}>
				<div className="row" style={{ marginBottom: 8 }}>
					<span className="card-title" style={{ margin: 0 }}>Windows Diagnostics</span>
					{!isWindows && <span className="muted" style={{ fontSize: 12 }}>Windows only</span>}
				</div>
				<p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
					Shows detailed COM port info to help identify the correct ports on Windows.
				</p>
				<button className="btn btn-secondary" onClick={runDiag} style={{ marginBottom: 12 }}>
					Run Diagnostics
				</button>
				{diagPorts.length > 0 && (
					<div className="table-wrap">
						<table>
							<thead>
								<tr>
									<th>Device</th>
									<th>Description</th>
									<th>VID</th>
									<th>Likely Teensy?</th>
								</tr>
							</thead>
							<tbody>
								{diagPorts.map((p) => (
									<tr key={p.device}>
										<td className="mono">{p.device}</td>
										<td>{p.description}</td>
										<td className="mono">{p.is_teensy ? '✓' : ''}</td>
										<td>{p.is_teensy ? '✅ Yes' : '—'}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	)
}
