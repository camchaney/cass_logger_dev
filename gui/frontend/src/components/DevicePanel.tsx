import { useState } from 'react'
import type { DeviceStatus, PortInfo } from '../types'
import InfoTip from './InfoTip'

interface Props {
	status: DeviceStatus
	onConnected: () => void
}

type Msg = { ok: boolean; text: string } | null

function useMsg() {
	const [msg, setMsg] = useState<Msg>(null)
	const set = (ok: boolean, text: string) => setMsg({ ok, text })
	return { msg, set, clear: () => setMsg(null) }
}

const isWindows = navigator.platform.startsWith('Win')
const TEN_MONTHS_SEC = 10 * 30 * 24 * 60 * 60

export default function DevicePanel({ status, onConnected }: Props) {
	const api = window.pywebview?.api

	// ── Connection state ────────────────────────────────────────────────────────
	const [ports, setPorts] = useState<PortInfo[]>([])
	const [dataPort, setDataPort] = useState('')
	const [cmdPort, setCmdPort] = useState('')
	const [loadingPorts, setLoadingPorts] = useState(false)
	const [manualMsg, setManualMsg] = useState<Msg>(null)
	const [diagPorts, setDiagPorts] = useState<
		{ device: string; description: string; is_teensy: boolean }[]
	>([])

	// ── Config state ────────────────────────────────────────────────────────────
	const rtc = useMsg()
	const [rtcInfo, setRtcInfo] = useState<{
		unix: number
		datetime: string
		driftSec: number
	} | null>(null)

	const rtcTs = useMsg()
	const [rtcTsUnix, setRtcTsUnix] = useState<number | null>(null)

	const devId = useMsg()
	const [devIdVal, setDevIdVal] = useState<string | null>(null)
	const [devIdInput, setDevIdInput] = useState('')

	// ── Connection handlers ─────────────────────────────────────────────────────

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

	// ── RTC handlers ────────────────────────────────────────────────────────────

	const getRtcTime = async () => {
		if (!api) return
		rtc.clear()
		const beforeMs = Date.now()
		const res = await api.get_rtc_time()
		const afterMs = Date.now()
		if (!res.ok || !res.data) { rtc.set(false, res.error ?? 'Failed'); return }
		const deviceUnix = parseInt(res.data, 10)
		const computerUnix = Math.round((beforeMs + afterMs) / 2 / 1000)
		setRtcInfo({
			unix: deviceUnix,
			datetime: new Date(deviceUnix * 1000).toUTCString(),
			driftSec: deviceUnix - computerUnix,
		})
	}

	const doSyncRtc = async () => {
		if (!api) return
		rtc.clear()
		const res = await api.set_rtc_time()
		if (res.ok) {
			rtc.set(true, res.data ?? 'RTC synced')
			setRtcInfo(null)
			onConnected()
		} else {
			rtc.set(false, res.error ?? 'Failed')
		}
	}

	const getRtcTs = async () => {
		if (!api) return
		rtcTs.clear()
		const res = await api.get_rtc_install_timestamp()
		if (res.ok && res.data) setRtcTsUnix(parseInt(res.data, 10))
		else rtcTs.set(false, res.error ?? 'Failed')
	}

	const putRtcTs = async () => {
		if (!api) return
		rtcTs.clear()
		const res = await api.put_rtc_install_timestamp()
		if (res.ok) {
			rtcTs.set(true, res.data ?? 'Saved')
			setRtcTsUnix(Math.floor(Date.now() / 1000))
		} else {
			rtcTs.set(false, res.error ?? 'Failed')
		}
	}

	// ── Device ID handlers ──────────────────────────────────────────────────────

	const getDeviceId = async () => {
		if (!api) return
		devId.clear()
		const res = await api.get_device_id()
		if (res.ok) {
			setDevIdVal(res.data ?? null)
			setDevIdInput(res.data ?? '')
		} else {
			devId.set(false, res.error ?? 'Failed')
		}
	}

	const putDeviceId = async () => {
		if (!api || !devIdInput.trim()) return
		devId.clear()
		const res = await api.put_device_id(devIdInput.trim())
		if (res.ok) {
			devId.set(true, res.data ?? 'Saved')
			setDevIdVal(devIdInput.trim())
			onConnected()
		} else {
			devId.set(false, res.error ?? 'Failed')
		}
	}

	// ── Render ──────────────────────────────────────────────────────────────────

	return (
		<div>
			<h2 className="panel-title">Device</h2>

			{/* Status */}
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

			{/* ── Configuration ─────────────────────────────────────────────────────── */}

			{status.connected && (
				<>
					<h2 className="panel-title" style={{ marginTop: 8 }}>Configuration</h2>

					{/* RTC */}
					<div className="card">
						<div className="card-title">
						RTC Clock
						<InfoTip text="The device has a battery-backed real-time clock used to timestamp all logged data. Read the current time to check accuracy, then sync it to your computer's UTC time if it has drifted." />
					</div>
						<div className="row" style={{ marginBottom: 8 }}>
							<button className="btn btn-secondary" onClick={getRtcTime}>Read</button>
							<button className="btn btn-primary" onClick={doSyncRtc}>Sync to UTC Now</button>
						</div>

						{rtcInfo && (
							<>
								<div className="alert alert-info" style={{ marginBottom: 8 }}>
									<div style={{ marginBottom: 4 }}>
										<span className="muted" style={{ fontSize: 12 }}>Device time </span>
										<strong className="mono">{rtcInfo.datetime}</strong>
									</div>
									<div>
										<span className="muted" style={{ fontSize: 12 }}>Unix </span>
										<span className="mono">{rtcInfo.unix}</span>
									</div>
								</div>
								{Math.abs(rtcInfo.driftSec) > 1 && (
									<div className="alert alert-warning" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
										<span>
											⚠ RTC is <strong>{Math.abs(rtcInfo.driftSec)}s {rtcInfo.driftSec > 0 ? 'ahead of' : 'behind'} computer time</strong> — sync recommended.
										</span>
										<button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={doSyncRtc}>
											Sync Now
										</button>
									</div>
								)}
							</>
						)}

						{rtc.msg && (
							<div className={`alert ${rtc.msg.ok ? 'alert-success' : 'alert-error'}`}>
								{rtc.msg.text}
							</div>
						)}

						{/* Battery install — grouped under RTC */}
						<div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
							<div className="card-title">
								RTC Battery Install
								<InfoTip text="Records when the RTC coin battery was installed. The battery keeps the clock running when the device is unplugged. Replace it around the 10-month mark to avoid clock resets and incorrect timestamps." />
							</div>
							<div className="row" style={{ marginBottom: 8 }}>
								<button className="btn btn-secondary" onClick={getRtcTs}>Read</button>
								<button className="btn btn-primary" onClick={putRtcTs}>Set to Now</button>
							</div>

							{rtcTsUnix !== null && (() => {
								const ageSeconds = Math.floor(Date.now() / 1000) - rtcTsUnix
								const ageMonths = ageSeconds / (30 * 24 * 60 * 60)
								const dt = new Date(rtcTsUnix * 1000).toUTCString()
								return (
									<>
										<div className="alert alert-info" style={{ marginBottom: 8 }}>
											<span className="muted" style={{ fontSize: 12 }}>Installed </span>
											<strong className="mono">{dt}</strong>
											<span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
												({ageMonths.toFixed(1)} months ago)
											</span>
										</div>
										{ageSeconds > TEN_MONTHS_SEC && (
											<div className="alert alert-warning">
												⚠ Battery is <strong>{ageMonths.toFixed(1)} months old</strong> — consider replacing it soon to avoid RTC data loss.
											</div>
										)}
									</>
								)
							})()}

							{rtcTs.msg && (
								<div className={`alert ${rtcTs.msg.ok ? 'alert-success' : 'alert-error'}`}>
									{rtcTs.msg.text}
								</div>
							)}
						</div>
					</div>

					{/* Device ID */}
					<div className="card">
						<div className="card-title">Device ID</div>
						<div className="row" style={{ marginBottom: 10 }}>
							<button className="btn btn-secondary" onClick={getDeviceId}>Read</button>
						</div>
						{devIdVal !== null && (
							<div className="field-row" style={{ marginBottom: 8 }}>
								<div className="field">
									<label>Device ID (editable)</label>
									<input
										value={devIdInput}
										onChange={(e) => setDevIdInput(e.target.value)}
										placeholder="Enter device ID"
									/>
								</div>
								<button
									className="btn btn-primary"
									onClick={putDeviceId}
									disabled={!devIdInput.trim()}
								>
									Write to EEPROM
								</button>
							</div>
						)}
						{devId.msg && (
							<div className={`alert ${devId.msg.ok ? 'alert-success' : 'alert-error'}`}>
								{devId.msg.text}
							</div>
						)}
					</div>
				</>
			)}
		</div>
	)
}
