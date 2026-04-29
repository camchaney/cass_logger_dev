import { useCallback, useEffect, useRef, useState } from 'react'
import type { UpdateDownloadStatus, UpdateState } from '../types'

function getApi() {
	return window.pywebview?.api ?? null
}

interface Props {
	updateState: UpdateState
	onDismiss: () => void
	onSkip: (version: string) => void
}

export default function UpdateBanner({ updateState, onDismiss, onSkip }: Props) {
	const [taskId, setTaskId] = useState<string | null>(null)
	const [dlStatus, setDlStatus] = useState<UpdateDownloadStatus | null>(null)
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const startDownload = useCallback(async () => {
		const api = getApi()
		if (!api) return
		const res = await api.start_update_download()
		if (res.ok && res.data) setTaskId(res.data)
	}, [])

	useEffect(() => {
		if (!taskId) return
		const poll = async () => {
			const api = getApi()
			if (!api) return
			const res = await api.get_update_download_status(taskId)
			if (!res.ok || !res.data) return
			setDlStatus(res.data)
			if (res.data.status === 'done' || res.data.status === 'error') {
				if (pollRef.current) clearInterval(pollRef.current)
			}
		}
		pollRef.current = setInterval(poll, 500)
		poll()
		return () => { if (pollRef.current) clearInterval(pollRef.current) }
	}, [taskId])

	const handleInstall = useCallback(async () => {
		if (!taskId) return
		const api = getApi()
		if (!api) return
		await api.restart_and_install(taskId)
	}, [taskId])

	const isHard = updateState.state === 'hard_update'
	const version = updateState.latest_version ?? ''

	const progressBar = dlStatus && dlStatus.status === 'running' && (
		<div className="update-progress-wrap">
			<div
				className="update-progress-bar"
				style={{ width: `${Math.round(dlStatus.progress * 100)}%` }}
			/>
			<span className="update-progress-text">
				{dlStatus.total_bytes
					? `${(dlStatus.downloaded_bytes / 1024 / 1024).toFixed(1)} / ${(dlStatus.total_bytes / 1024 / 1024).toFixed(1)} MB`
					: 'Downloading…'}
			</span>
		</div>
	)

	const actions = (
		<div className="update-actions">
			{!taskId && (
				<button className="btn btn-primary" onClick={startDownload}>
					Download update
				</button>
			)}
			{dlStatus?.status === 'running' && progressBar}
			{dlStatus?.status === 'verifying' && (
				<span className="muted">Verifying…</span>
			)}
			{dlStatus?.status === 'done' && (
				<button className="btn btn-primary" onClick={handleInstall}>
					Restart &amp; Install
				</button>
			)}
			{dlStatus?.status === 'error' && (
				<>
					<span className="alert alert-error" style={{ marginBottom: 0 }}>
						{dlStatus.error}
					</span>
					<button className="btn btn-secondary" onClick={startDownload}>
						Retry
					</button>
				</>
			)}
			{!isHard && !taskId && (
				<>
					<button className="btn btn-secondary" onClick={onDismiss}>
						Later
					</button>
					<button className="btn btn-ghost" onClick={() => onSkip(version)}>
						Skip this version
					</button>
				</>
			)}
		</div>
	)

	if (isHard) {
		return (
			<div className="update-overlay">
				<div className="update-modal">
					<div className="update-modal-title">Update Required</div>
					<p className="update-modal-body">
						This version ({updateState.installed_version}) is no longer supported.
						Please update to v{version} to continue using the app.
					</p>
					{updateState.changelog && (
						<p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
							{updateState.changelog}
						</p>
					)}
					{actions}
				</div>
			</div>
		)
	}

	return (
		<div className="update-banner">
			<div className="update-banner-message">
				<strong>Update available: v{version}</strong>
				{updateState.changelog && (
					<span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
						{updateState.changelog}
					</span>
				)}
			</div>
			{actions}
		</div>
	)
}
