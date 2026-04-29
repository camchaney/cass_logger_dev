export interface ApiResult<T = unknown> {
	ok: boolean
	data: T | null
	error: string | null
}

export interface DeviceStatus {
	connected: boolean
	fw_ver?: string
	device_id?: string
	error?: string
}

export interface PortInfo {
	device: string
	description: string
	vid: string | null
	pid: string | null
}

export interface FileEntry {
	name: string
	size: number
}

export interface TaskStatus {
	status: 'running' | 'done' | 'error'
	progress: number
	current: number
	total: number
	result: string | null
	error: string | null
}

export interface BinParseResult {
	columns: string[]
	rows: number
	preview: Record<string, number>[]
	chart_data: Record<string, number>[]
}

export interface FitParseResult {
	session_columns: string[]
	session: Record<string, unknown>[]
	record_columns: string[]
	record: Record<string, unknown>[]
	record_rows: number
}

export interface MetadataResult {
	firmware_version: string | null
	device_id: string | null
}

export interface UpdateState {
	state: 'unknown' | 'up_to_date' | 'soft_update' | 'hard_update' | 'error'
	installed_version: string
	latest_version: string | null
	minimum_version: string | null
	changelog: string | null
	error: string | null
}

export interface UpdateDownloadStatus {
	status: 'running' | 'verifying' | 'done' | 'error'
	progress: number
	downloaded_bytes: number
	total_bytes: number
	installer_path: string | null
	error: string | null
}

export interface WindowsPortDiag {
	device: string
	description: string
	manufacturer: string | null
	vid: string | null
	pid: string | null
	is_teensy: boolean
}

declare global {
	interface Window {
		pywebview: {
			api: PyApi
		}
	}
}

export interface PyApi {
	// Device
	connect(): Promise<ApiResult<string>>
	disconnect(): Promise<ApiResult<string>>
	get_status(): Promise<ApiResult<DeviceStatus>>
	list_ports(): Promise<ApiResult<PortInfo[]>>
	connect_manual(data_port: string, command_port: string): Promise<ApiResult<string>>
	diagnose_windows_ports(): Promise<ApiResult<WindowsPortDiag[]>>
	get_fw_ver(): Promise<ApiResult<string>>
	get_device_id(): Promise<ApiResult<string>>
	put_device_id(device_id: string): Promise<ApiResult<string>>
	get_rtc_time(): Promise<ApiResult<string>>
	set_rtc_time(): Promise<ApiResult<string>>
	get_rtc_install_timestamp(): Promise<ApiResult<string>>
	put_rtc_install_timestamp(ts?: number): Promise<ApiResult<string>>
	// Files
	list_files(): Promise<ApiResult<FileEntry[]>>
	start_download(dest_dir: string): Promise<ApiResult<string>>
	get_task_status(task_id: string): Promise<ApiResult<TaskStatus>>
	delete_all_files(): Promise<ApiResult<string>>
	// Data
	parse_bin(path: string, fw_ver: string): Promise<ApiResult<BinParseResult>>
	parse_fit(path: string): Promise<ApiResult<FitParseResult>>
	export_csv(source: string, dest_path: string): Promise<ApiResult<string>>
	find_metadata(dir_path: string): Promise<ApiResult<MetadataResult>>
	// Dialogs
	pick_file(file_types?: string[]): Promise<ApiResult<string | null>>
	pick_directory(): Promise<ApiResult<string | null>>
	pick_save_file(file_types?: string[]): Promise<ApiResult<string | null>>
	// Update
	get_update_state(): Promise<ApiResult<UpdateState>>
	start_update_download(): Promise<ApiResult<string>>
	get_update_download_status(task_id: string): Promise<ApiResult<UpdateDownloadStatus>>
	restart_and_install(task_id: string): Promise<ApiResult<string>>
	dismiss_update(): Promise<ApiResult<null>>
	skip_update_version(version: string): Promise<ApiResult<null>>
	// Cloud
	cloud_status(): Promise<ApiResult<{ available: boolean; message: string }>>
}
