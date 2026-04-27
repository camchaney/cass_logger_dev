import { useState } from 'react'
import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts'
import type { BinParseResult, FitParseResult } from '../types'

type SubTab = 'bin' | 'fit' | 'metadata'

const FW_VERS = ['std', 'i2c_1', 'i2c_2']

const CHART_COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6']

// IMU groups — all possible across firmware variants; filtered to what's in the data at render time
const IMU_GROUPS = [
	{ key: 'g',        label: 'Accel',         cols: ['gx',       'gy',       'gz'      ] },
	{ key: 'w',        label: 'Gyro',          cols: ['wx',       'wy',       'wz'      ] },
	{ key: 't',        label: 'Mag',           cols: ['Tx',       'Ty',       'Tz'      ] },
	{ key: 'g_i2c',   label: 'Accel (i2c)',   cols: ['gx_i2c',   'gy_i2c',   'gz_i2c'  ] },
	{ key: 'w_i2c',   label: 'Gyro (i2c)',    cols: ['wx_i2c',   'wy_i2c',   'wz_i2c'  ] },
	{ key: 't_i2c',   label: 'Mag (i2c)',     cols: ['Tx_i2c',   'Ty_i2c',   'Tz_i2c'  ] },
	{ key: 'g_i2c_c', label: 'Accel (i2c·c)', cols: ['gx_i2c_c', 'gy_i2c_c', 'gz_i2c_c'] },
	{ key: 'w_i2c_c', label: 'Gyro (i2c·c)',  cols: ['wx_i2c_c', 'wy_i2c_c', 'wz_i2c_c'] },
	{ key: 't_i2c_c', label: 'Mag (i2c·c)',   cols: ['Tx_i2c_c', 'Ty_i2c_c', 'Tz_i2c_c'] },
	{ key: 'g_i2c_e', label: 'Accel (i2c·e)', cols: ['gx_i2c_e', 'gy_i2c_e', 'gz_i2c_e'] },
	{ key: 'w_i2c_e', label: 'Gyro (i2c·e)',  cols: ['wx_i2c_e', 'wy_i2c_e', 'wz_i2c_e'] },
	{ key: 't_i2c_e', label: 'Mag (i2c·e)',   cols: ['Tx_i2c_e', 'Ty_i2c_e', 'Tz_i2c_e'] },
]

const CHANNEL_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f']

export default function DataPanel() {
	const api = window.pywebview?.api
	const [subTab, setSubTab] = useState<SubTab>('bin')

	// ── .bin state ─────────────────────────────────────────────────────────────
	const [binPath, setBinPath] = useState<string | null>(null)
	const [fwVer, setFwVer] = useState('std')
	const [binResult, setBinResult] = useState<BinParseResult | null>(null)
	const [binError, setBinError] = useState<string | null>(null)
	const [binLoading, setBinLoading] = useState(false)
	const [chartSection, setChartSection] = useState<'imu' | 'channels'>('imu')
	const [imuGroupKey, setImuGroupKey] = useState('g')
	const [channelLetter, setChannelLetter] = useState('a')

	// ── .fit state ─────────────────────────────────────────────────────────────
	const [fitPath, setFitPath] = useState<string | null>(null)
	const [fitResult, setFitResult] = useState<FitParseResult | null>(null)
	const [fitError, setFitError] = useState<string | null>(null)
	const [fitLoading, setFitLoading] = useState(false)
	const [fitTab, setFitTab] = useState<'session' | 'record'>('session')

	// ── metadata state ─────────────────────────────────────────────────────────
	const [metaDir, setMetaDir] = useState<string | null>(null)
	const [metaResult, setMetaResult] = useState<{ firmware_version: string | null; device_id: string | null } | null>(null)
	const [metaError, setMetaError] = useState<string | null>(null)

	// ── .bin handlers ──────────────────────────────────────────────────────────

	const pickBin = async () => {
		if (!api) return
		const res = await api.pick_file(['Binary files (*.bin)', 'All files (*.*)'])
		if (res.ok && res.data) setBinPath(res.data)
	}

	const parseBin = async () => {
		if (!api || !binPath) return
		setBinLoading(true)
		setBinError(null)
		setBinResult(null)
		const res = await api.parse_bin(binPath, fwVer)
		if (res.ok && res.data) {
			setBinResult(res.data)
			const cols = res.data.columns
			const firstImu = IMU_GROUPS.find(g => g.cols.some(c => cols.includes(c)))
			const firstCh = CHANNEL_LETTERS.find(l => [`${l}0`, `${l}1`, `${l}2`].some(c => cols.includes(c)))
			if (firstImu) { setChartSection('imu'); setImuGroupKey(firstImu.key) }
			else if (firstCh) { setChartSection('channels'); setChannelLetter(firstCh) }
		} else {
			setBinError(res.error ?? 'Parse failed')
		}
		setBinLoading(false)
	}

	const exportBin = async () => {
		if (!api) return
		const res = await api.pick_save_file(['CSV files (*.csv)'])
		if (!res.ok || !res.data) return
		const exportRes = await api.export_csv('bin', res.data)
		if (!exportRes.ok) alert(exportRes.error)
	}

	// ── .fit handlers ──────────────────────────────────────────────────────────

	const pickFit = async () => {
		if (!api) return
		const res = await api.pick_file(['FIT files (*.fit)', 'All files (*.*)'])
		if (res.ok && res.data) setFitPath(res.data)
	}

	const parseFit = async () => {
		if (!api || !fitPath) return
		setFitLoading(true)
		setFitError(null)
		setFitResult(null)
		const res = await api.parse_fit(fitPath)
		if (res.ok && res.data) setFitResult(res.data)
		else setFitError(res.error ?? 'Parse failed')
		setFitLoading(false)
	}

	const exportFit = async (source: 'fit_session' | 'fit_record') => {
		if (!api) return
		const res = await api.pick_save_file(['CSV files (*.csv)'])
		if (!res.ok || !res.data) return
		const exportRes = await api.export_csv(source, res.data)
		if (!exportRes.ok) alert(exportRes.error)
	}

	// ── metadata handlers ──────────────────────────────────────────────────────

	const pickMetaDir = async () => {
		if (!api) return
		const res = await api.pick_directory()
		if (res.ok && res.data) setMetaDir(res.data)
	}

	const findMeta = async () => {
		if (!api || !metaDir) return
		setMetaError(null)
		setMetaResult(null)
		const res = await api.find_metadata(metaDir)
		if (res.ok && res.data) setMetaResult(res.data as typeof metaResult)
		else setMetaError(res.error ?? 'Not found')
	}

	// ── Derived chart state (computed each render from binResult.columns) ────────

	const availableImuGroups = binResult
		? IMU_GROUPS.filter(g => g.cols.some(c => binResult.columns.includes(c)))
		: []

	const availableChannelLetters = binResult
		? CHANNEL_LETTERS.filter(l => [`${l}0`, `${l}1`, `${l}2`].some(c => binResult.columns.includes(c)))
		: []

	const activeImuGroup = availableImuGroups.find(g => g.key === imuGroupKey) ?? availableImuGroups[0]
	const activeImuCols = activeImuGroup
		? activeImuGroup.cols.filter(c => binResult!.columns.includes(c))
		: []
	const activeChannelCols = binResult
		? [`${channelLetter}0`, `${channelLetter}1`, `${channelLetter}2`].filter(c => binResult.columns.includes(c))
		: []

	// ── Render ─────────────────────────────────────────────────────────────────

	return (
		<div>
			<h2 className="panel-title">Data Processing & Visualization</h2>

			<div className="tabs">
				<button className={`tab${subTab === 'bin' ? ' active' : ''}`} onClick={() => setSubTab('bin')}>
					Parse .bin
				</button>
				<button className={`tab${subTab === 'fit' ? ' active' : ''}`} onClick={() => setSubTab('fit')}>
					Parse .fit
				</button>
				<button className={`tab${subTab === 'metadata' ? ' active' : ''}`} onClick={() => setSubTab('metadata')}>
					Metadata
				</button>
			</div>

			{/* ── .bin ── */}
			{subTab === 'bin' && (
				<>
					<div className="card">
						<div className="card-title">Load Binary File</div>
						<div className="row" style={{ marginBottom: 12 }}>
							<button className="btn btn-secondary" onClick={pickBin}>Choose .bin file</button>
							{binPath && <span className="mono muted">{binPath.split('/').pop()}</span>}
						</div>
						<div className="field-row" style={{ marginBottom: 12 }}>
							<div className="field">
								<label>Firmware version</label>
								<select value={fwVer} onChange={(e) => setFwVer(e.target.value)}>
									{FW_VERS.map((v) => <option key={v} value={v}>{v}</option>)}
								</select>
							</div>
							<button
								className="btn btn-primary"
								onClick={parseBin}
								disabled={!binPath || binLoading}
							>
								{binLoading ? <span className="spinner" /> : null}
								{binLoading ? ' Parsing…' : ' Parse'}
							</button>
						</div>
						{binError && <div className="alert alert-error">{binError}</div>}
					</div>

					{binResult && (
						<>
							{/* Preview table */}
							<div className="card">
								<div className="row" style={{ marginBottom: 12 }}>
									<span className="card-title" style={{ margin: 0 }}>
										Preview — {binResult.rows.toLocaleString()} rows · {binResult.columns.length} cols
									</span>
									<span className="spacer" />
									<button className="btn btn-ghost" onClick={exportBin}>⬇ Export CSV</button>
								</div>
								<div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
									<table>
										<thead>
											<tr>{binResult.columns.map((c) => <th key={c}>{c}</th>)}</tr>
										</thead>
										<tbody>
											{binResult.preview.map((row, i) => (
												<tr key={i}>
													{binResult.columns.map((c) => (
														<td key={c} className="mono">
															{typeof row[c] === 'number' ? row[c].toFixed(3) : String(row[c] ?? '')}
														</td>
													))}
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>

							{/* Combined chart card */}
							{(availableImuGroups.length > 0 || availableChannelLetters.length > 0) && (
								<div className="card">
									{/* Section selector */}
									<div className="tabs-section">
										{availableImuGroups.length > 0 && (
											<button
												className={`tab-section${chartSection === 'imu' ? ' active' : ''}`}
												onClick={() => setChartSection('imu')}
											>
												IMU
											</button>
										)}
										{availableChannelLetters.length > 0 && (
											<button
												className={`tab-section${chartSection === 'channels' ? ' active' : ''}`}
												onClick={() => setChartSection('channels')}
											>
												Channels
											</button>
										)}
									</div>

									{/* Sub-tabs */}
									<div className="tabs" style={{ margin: '0 0 12px' }}>
										{chartSection === 'imu'
											? availableImuGroups.map(g => (
												<button
													key={g.key}
													className={`tab tab-sm${imuGroupKey === g.key ? ' active' : ''}`}
													onClick={() => setImuGroupKey(g.key)}
												>
													{g.label}
												</button>
											))
											: availableChannelLetters.map(l => (
												<button
													key={l}
													className={`tab tab-sm${channelLetter === l ? ' active' : ''}`}
													onClick={() => setChannelLetter(l)}
												>
													{l.toUpperCase()}
												</button>
											))
										}
									</div>

									<StackedCharts
										data={binResult.chart_data}
										cols={chartSection === 'imu' ? activeImuCols : activeChannelCols}
									/>
								</div>
							)}
						</>
					)}
				</>
			)}

			{/* ── .fit ── */}
			{subTab === 'fit' && (
				<>
					<div className="card">
						<div className="card-title">Load FIT File</div>
						<div className="row" style={{ marginBottom: 12 }}>
							<button className="btn btn-secondary" onClick={pickFit}>Choose .fit file</button>
							{fitPath && <span className="mono muted">{fitPath.split('/').pop()}</span>}
						</div>
						<button className="btn btn-primary" onClick={parseFit} disabled={!fitPath || fitLoading}>
							{fitLoading ? <span className="spinner" /> : null}
							{fitLoading ? ' Parsing…' : ' Parse'}
						</button>
						{fitError && <div className="alert alert-error" style={{ marginTop: 8 }}>{fitError}</div>}
					</div>

					{fitResult && (
						<div className="card">
							<div className="tabs" style={{ marginBottom: 12 }}>
								<button className={`tab${fitTab === 'session' ? ' active' : ''}`} onClick={() => setFitTab('session')}>
									Session ({fitResult.session.length} row{fitResult.session.length !== 1 ? 's' : ''})
								</button>
								<button className={`tab${fitTab === 'record' ? ' active' : ''}`} onClick={() => setFitTab('record')}>
									Record ({fitResult.record_rows.toLocaleString()} rows)
								</button>
							</div>
							<div className="row" style={{ marginBottom: 8 }}>
								<span className="spacer" />
								<button className="btn btn-ghost" onClick={() => exportFit(fitTab === 'session' ? 'fit_session' : 'fit_record')}>
									⬇ Export CSV
								</button>
							</div>
							{fitTab === 'session' && <FitTable cols={fitResult.session_columns} rows={fitResult.session} />}
							{fitTab === 'record' && (
								<>
									{fitResult.record_rows > 500 && (
										<div className="alert alert-info" style={{ marginBottom: 8 }}>
											Showing first 500 of {fitResult.record_rows.toLocaleString()} record rows.
										</div>
									)}
									<FitTable cols={fitResult.record_columns} rows={fitResult.record} />
								</>
							)}
						</div>
					)}
				</>
			)}

			{/* ── Metadata ── */}
			{subTab === 'metadata' && (
				<div className="card">
					<div className="card-title">Find & Parse Metadata</div>
					<p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
						Searches a local folder for a metadata.txt file and displays its contents.
					</p>
					<div className="row" style={{ marginBottom: 12 }}>
						<button className="btn btn-secondary" onClick={pickMetaDir}>Choose folder</button>
						{metaDir && <span className="mono muted">{metaDir}</span>}
					</div>
					<button className="btn btn-primary" onClick={findMeta} disabled={!metaDir} style={{ marginBottom: 12 }}>
						Search
					</button>
					{metaError && <div className="alert alert-error">{metaError}</div>}
					{metaResult && (
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
							<div>
								<div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Firmware Version</div>
								<div className="mono">{metaResult.firmware_version ?? '—'}</div>
							</div>
							<div>
								<div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Device ID</div>
								<div className="mono">{metaResult.device_id ?? '—'}</div>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	)
}

function StackedCharts({
	data,
	cols,
}: {
	data: Record<string, number>[]
	cols: string[]
}) {
	return (
		<>
			{cols.map((col, idx) => (
				<div key={col} style={{ marginBottom: idx < cols.length - 1 ? 16 : 0 }}>
					<div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{col}</div>
					<ResponsiveContainer width="100%" height={140}>
						<LineChart data={data}>
							<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
							<XAxis
								dataKey="t"
								type="number"
								domain={['auto', 'auto']}
								tick={{ fontSize: 10 }}
								label={{ value: 't (s)', position: 'insideBottomRight', offset: -4, fontSize: 10 }}
							/>
							<YAxis tick={{ fontSize: 10 }} />
							<Tooltip contentStyle={{ fontSize: 12 }} />
							<Line
								type="monotone"
								dataKey={col}
								dot={false}
								stroke={CHART_COLORS[idx % CHART_COLORS.length]}
								strokeWidth={1.5}
							/>
						</LineChart>
					</ResponsiveContainer>
				</div>
			))}
		</>
	)
}

function FitTable({ cols, rows }: { cols: string[]; rows: Record<string, unknown>[] }) {
	return (
		<div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
			<table>
				<thead>
					<tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
				</thead>
				<tbody>
					{rows.map((row, i) => (
						<tr key={i}>
							{cols.map((c) => (
								<td key={c} className="mono">
									{row[c] === null || row[c] === undefined ? '—' : String(row[c])}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
