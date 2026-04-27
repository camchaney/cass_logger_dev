import { useState } from 'react'

interface Props {
	connected: boolean
	onRefresh: () => void
}

type Msg = { ok: boolean; text: string } | null

function useMsg() {
	const [msg, setMsg] = useState<Msg>(null)
	const set = (ok: boolean, text: string) => setMsg({ ok, text })
	return { msg, set, clear: () => setMsg(null) }
}

export default function ConfigPanel({ connected, onRefresh }: Props) {
	const api = window.pywebview?.api

	const rtc = useMsg()
	const [rtcInfo, setRtcInfo] = useState<{
		unix: number
		datetime: string
		driftSec: number
	} | null>(null)

	const devId = useMsg()
	const [devIdVal, setDevIdVal] = useState<string | null>(null)
	const [devIdInput, setDevIdInput] = useState('')

	const rtcTs = useMsg()
	const [rtcTsVal, setRtcTsVal] = useState<string | null>(null)

	const fw = useMsg()
	const [fwVal, setFwVal] = useState<string | null>(null)

	if (!connected) {
		return (
			<div>
				<h2 className="panel-title">Device Configuration</h2>
				<div className="alert alert-info">Connect to a device to access configuration.</div>
			</div>
		)
	}

	// ── RTC ──────────────────────────────────────────────────────────────────

	const driftMax = 3		// seconds

	const getRtcTime = async () => {
		if (!api) return
		rtc.clear()
		// Snapshot computer time as close to the device read as possible
		const beforeMs = Date.now()
		const res = await api.get_rtc_time()
		const afterMs = Date.now()
		if (!res.ok || !res.data) { rtc.set(false, res.error ?? 'Failed'); return }

		const deviceUnix = parseInt(res.data, 10)
		// Mid-point of the round-trip as best estimate of "now" when device was read
		const computerUnix = Math.round((beforeMs + afterMs) / 2 / 1000)
		const driftSec = deviceUnix - computerUnix

		setRtcInfo({
			unix: deviceUnix,
			datetime: new Date(deviceUnix * 1000).toUTCString(),
			driftSec,
		})
	}

	const doSyncRtc = async () => {
		if (!api) return
		rtc.clear()
		const res = await api.set_rtc_time()
		if (res.ok) {
			rtc.set(true, res.data ?? 'RTC synced')
			setRtcInfo(null)
			onRefresh()
		} else {
			rtc.set(false, res.error ?? 'Failed')
		}
	}

	// ── Device ID ─────────────────────────────────────────────────────────────

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
			onRefresh()
		} else {
			devId.set(false, res.error ?? 'Failed')
		}
	}

	// ── RTC install timestamp ─────────────────────────────────────────────────

	const getRtcTs = async () => {
		if (!api) return
		rtcTs.clear()
		const res = await api.get_rtc_install_timestamp()
		if (res.ok) {
			const ts = res.data
			if (ts) {
				const dt = new Date(parseInt(ts) * 1000)
				setRtcTsVal(`${ts} (${dt.toUTCString()})`)
			}
		} else {
			rtcTs.set(false, res.error ?? 'Failed')
		}
	}

	const putRtcTs = async (useNow: boolean) => {
		if (!api) return
		rtcTs.clear()
		const res = await api.put_rtc_install_timestamp(useNow ? undefined : undefined)
		if (res.ok) rtcTs.set(true, res.data ?? 'Saved')
		else rtcTs.set(false, res.error ?? 'Failed')
	}

	// ── Firmware version ──────────────────────────────────────────────────────

	const getFwVer = async () => {
		if (!api) return
		fw.clear()
		const res = await api.get_fw_ver()
		if (res.ok) setFwVal(res.data ?? null)
		else fw.set(false, res.error ?? 'Failed')
	}

	return (
		<div>
			<h2 className="panel-title">Device Configuration</h2>

			{/* RTC time */}
			<div className="card">
				<div className="card-title">RTC Clock</div>
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

						{Math.abs(rtcInfo.driftSec) > driftMax && (
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

			{/* RTC install timestamp */}
			<div className="card">
				<div className="card-title">RTC Battery Install Timestamp</div>
				<div className="row" style={{ marginBottom: 10 }}>
					<button className="btn btn-secondary" onClick={getRtcTs}>Read</button>
					<button className="btn btn-primary" onClick={() => putRtcTs(true)}>Set to Now</button>
				</div>
				{rtcTsVal && (
					<div className="alert alert-info" style={{ marginBottom: 8 }}>
						<span className="mono">{rtcTsVal}</span>
					</div>
				)}
				{rtcTs.msg && (
					<div className={`alert ${rtcTs.msg.ok ? 'alert-success' : 'alert-error'}`}>
						{rtcTs.msg.text}
					</div>
				)}
			</div>

			{/* Firmware version */}
			<div className="card">
				<div className="card-title">Firmware Version</div>
				<div className="row" style={{ marginBottom: 10 }}>
					<button className="btn btn-secondary" onClick={getFwVer}>Read</button>
				</div>
				{fwVal && (
					<div className="alert alert-info">
						Firmware: <strong className="mono">{fwVal}</strong>
					</div>
				)}
				{fw.msg && (
					<div className={`alert ${fw.msg.ok ? 'alert-success' : 'alert-error'}`}>
						{fw.msg.text}
					</div>
				)}
			</div>
		</div>
	)
}
