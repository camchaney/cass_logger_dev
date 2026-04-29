import { useCallback, useEffect, useRef, useState } from 'react'
import type { DeviceStatus, UpdateState } from './types'
import DataPanel from './components/DataPanel'
import DevicePanel from './components/DevicePanel'
import FilesPanel from './components/FilesPanel'
import UpdateBanner from './components/UpdateBanner'

type Panel = 'device' | 'files' | 'data'

const NAV: { id: Panel; label: string; icon: string }[] = [
	{ id: 'device', label: 'Device', icon: '🔌' },
	{ id: 'files', label: 'Files', icon: '📁' },
	{ id: 'data', label: 'Data', icon: '📊' },
]

function getApi() {
	return window.pywebview?.api ?? null
}

export default function App() {
	const [panel, setPanel] = useState<Panel>('device')
	const [status, setStatus] = useState<DeviceStatus>({ connected: false })
	const [connecting, setConnecting] = useState(false)
	const [updateState, setUpdateState] = useState<UpdateState | null>(null)
	const [updateDismissed, setUpdateDismissed] = useState(false)
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
	const updatePollRef = useRef<ReturnType<typeof setInterval> | null>(null)
	// Guards against concurrent connect attempts from overlapping poll ticks
	const connectingRef = useRef(false)
	// Set true after manual disconnect so polling doesn't immediately reconnect
	const manuallyDisconnectedRef = useRef(false)

	const refreshStatus = useCallback(async () => {
		const api = getApi()
		if (!api) return
		const res = await api.get_status()
		if (!res.ok || !res.data) return
		setStatus(res.data)

		if (!res.data.connected && !connectingRef.current && !manuallyDisconnectedRef.current) {
			connectingRef.current = true
			setConnecting(true)
			await api.connect()
			const s2 = await api.get_status()
			if (s2.ok && s2.data) setStatus(s2.data)
			setConnecting(false)
			connectingRef.current = false
		}
	}, [])

	useEffect(() => {
		const onReady = () => {
			refreshStatus()
			pollRef.current = setInterval(refreshStatus, 5000)

			// Poll update state until it resolves from 'unknown', then stop
			const checkUpdate = async () => {
				const api = window.pywebview?.api
				if (!api) return
				const res = await api.get_update_state()
				if (!res.ok || !res.data) return
				setUpdateState(res.data)
				if (res.data.state !== 'unknown' && updatePollRef.current) {
					clearInterval(updatePollRef.current)
					updatePollRef.current = null
				}
			}
			checkUpdate()
			updatePollRef.current = setInterval(checkUpdate, 3000)
		}
		window.addEventListener('pywebviewready', onReady)
		if (window.pywebview?.api) onReady()
		return () => {
			window.removeEventListener('pywebviewready', onReady)
			if (pollRef.current) clearInterval(pollRef.current)
			if (updatePollRef.current) clearInterval(updatePollRef.current)
		}
	}, [refreshStatus])

	const handleDismissUpdate = useCallback(async () => {
		const api = window.pywebview?.api
		if (api) await api.dismiss_update()
		setUpdateDismissed(true)
	}, [])

	const handleSkipUpdate = useCallback(async (version: string) => {
		const api = window.pywebview?.api
		if (api) await api.skip_update_version(version)
		setUpdateDismissed(true)
	}, [])

	const handleConnect = async () => {
		const api = getApi()
		if (!api || connectingRef.current) return
		manuallyDisconnectedRef.current = false
		connectingRef.current = true
		setConnecting(true)
		const res = await api.connect()
		if (res.ok) {
			const s = await api.get_status()
			if (s.ok && s.data) setStatus(s.data)
		} else {
			setStatus({ connected: false, error: res.error ?? undefined })
		}
		setConnecting(false)
		connectingRef.current = false
	}

	const handleDisconnect = async () => {
		const api = getApi()
		if (!api) return
		manuallyDisconnectedRef.current = true
		await api.disconnect()
		setStatus({ connected: false })
	}

	return (
		<div className="layout">
			<header className="header">
				<span className="header-title">Cass Logger</span>
				<div className="header-status">
					<div
						className={`status-dot ${
							connecting ? 'connecting' : status.connected ? 'connected' : 'disconnected'
						}`}
					/>
					{connecting ? (
						<span className="status-text">Connecting…</span>
					) : status.connected ? (
						<span className="status-text" style={{ display: 'flex', gap: 16 }}>
							<span>
								<span className="muted" style={{ fontSize: 12, marginRight: 4 }}>FW</span>
								<strong>{status.fw_ver ?? '—'}</strong>
							</span>
							<span>
								<span className="muted" style={{ fontSize: 12, marginRight: 4 }}>ID</span>
								<strong>{status.device_id ?? '—'}</strong>
							</span>
						</span>
					) : (
						<span className="status-text">{status.error ?? 'Not connected'}</span>
					)}
					{status.connected ? (
						<button className="btn btn-secondary" onClick={handleDisconnect}>
							Disconnect
						</button>
					) : (
						<button
							className="btn btn-primary"
							onClick={handleConnect}
							disabled={connecting}
						>
							{connecting ? <span className="spinner" /> : null}
							{connecting ? 'Connecting…' : 'Connect'}
						</button>
					)}
				</div>
			</header>

			<nav className="sidebar">
				{NAV.map((n) => (
					<button
						key={n.id}
						className={`nav-item${panel === n.id ? ' active' : ''}`}
						onClick={() => setPanel(n.id)}
					>
						<span className="nav-icon">{n.icon}</span>
						{n.label}
					</button>
				))}
			</nav>

			<main className="content">
				{updateState && !updateDismissed &&
					(updateState.state === 'soft_update' || updateState.state === 'hard_update') && (
					<UpdateBanner
						updateState={updateState}
						onDismiss={handleDismissUpdate}
						onSkip={handleSkipUpdate}
					/>
				)}
				<div style={{ display: panel === 'device' ? undefined : 'none' }}>
					<DevicePanel status={status} onConnected={refreshStatus} />
				</div>
				<div style={{ display: panel === 'files' ? undefined : 'none' }}>
					<FilesPanel connected={status.connected} />
				</div>
				<div style={{ display: panel === 'data' ? undefined : 'none' }}>
					<DataPanel />
				</div>
			</main>
		</div>
	)
}
