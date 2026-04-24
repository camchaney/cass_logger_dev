"""Flat API class exposed to the PyWebView JS bridge via window.pywebview.api.*"""

import os
import platform
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

import pandas as pd
import serial.tools.list_ports
import webview

from gui.api._result import err, ok
from gui.services.cass_service import CassService
from src.cass_commands import CassCommands


class MainApi:
	def __init__(self, service: CassService) -> None:
		self._svc = service
		self._tasks: dict[str, dict] = {}
		self._task_lock = threading.Lock()
		self._last_bin_df: Optional[pd.DataFrame] = None
		self._last_fit_session_df: Optional[pd.DataFrame] = None
		self._last_fit_record_df: Optional[pd.DataFrame] = None

	# ── Device ─────────────────────────────────────────────────────────────────

	def connect(self) -> dict:
		success, msg = self._svc.connect()
		return ok(msg) if success else err(msg)

	def disconnect(self) -> dict:
		self._svc.disconnect()
		return ok("Disconnected")

	def get_status(self) -> dict:
		if not self._svc.is_connected:
			return ok({"connected": False})
		try:
			fw = self._svc.cass.get_fw_ver()
			device_id = self._svc.cass.get_device_ID()
			return ok({"connected": True, "fw_ver": fw, "device_id": device_id})
		except Exception as e:
			self._svc.disconnect()
			return ok({"connected": False, "error": str(e)})

	def list_ports(self) -> dict:
		ports = serial.tools.list_ports.comports()
		return ok([
			{
				"device": p.device,
				"description": p.description,
				"vid": f"0x{p.vid:04X}" if p.vid else None,
				"pid": f"0x{p.pid:04X}" if p.pid else None,
			}
			for p in ports
		])

	def connect_manual(self, data_port: str, command_port: str) -> dict:
		success, msg = self._svc.connect_manual(data_port, command_port)
		return ok(msg) if success else err(msg)

	def diagnose_windows_ports(self) -> dict:
		if platform.system().lower() != "windows":
			return ok({
				"message": "Windows diagnostics are only available on Windows.",
				"ports": [],
			})
		ports = serial.tools.list_ports.comports()
		return ok([
			{
				"device": p.device,
				"description": p.description,
				"manufacturer": getattr(p, "manufacturer", None),
				"vid": f"0x{p.vid:04X}" if p.vid else None,
				"pid": f"0x{p.pid:04X}" if p.pid else None,
				"is_teensy": bool(p.vid and p.vid in (0x16C0, 0x239A)),
			}
			for p in ports
		])

	def get_fw_ver(self) -> dict:
		try:
			return ok(self._svc.cass.get_fw_ver())
		except Exception as e:
			return err(str(e))

	def get_device_id(self) -> dict:
		try:
			return ok(self._svc.cass.get_device_ID())
		except Exception as e:
			return err(str(e))

	def put_device_id(self, device_id: str) -> dict:
		try:
			success = self._svc.cass.put_device_ID(device_id)
			return ok("Device ID updated") if success else err("Device did not confirm the write")
		except Exception as e:
			return err(str(e))

	def get_rtc_time(self) -> dict:
		try:
			return ok(self._svc.cass.get_RTC_time())
		except Exception as e:
			return err(str(e))

	def set_rtc_time(self) -> dict:
		try:
			success = self._svc.cass.set_RTC_time()
			return ok("RTC synced to current UTC") if success else err("Device did not confirm time set")
		except Exception as e:
			return err(str(e))

	def get_rtc_install_timestamp(self) -> dict:
		try:
			return ok(self._svc.cass.get_rtc_install_timestamp())
		except Exception as e:
			return err(str(e))

	def put_rtc_install_timestamp(self, ts: Optional[int] = None) -> dict:
		try:
			success = self._svc.cass.put_rtc_install_timestamp(ts)
			return ok("RTC install timestamp updated") if success else err("Device did not confirm the write")
		except Exception as e:
			return err(str(e))

	# ── Files ──────────────────────────────────────────────────────────────────

	def list_files(self) -> dict:
		try:
			names = self._svc.cass.list_files()
			sizes = self._svc.cass.list_file_sizes()
			return ok([{"name": n, "size": s} for n, s in zip(names, sizes)])
		except Exception as e:
			return err(str(e))

	def start_download(self, dest_dir: str) -> dict:
		"""Begin a background download. Returns a task_id to poll via get_task_status()."""
		task_id = str(uuid.uuid4())
		task: dict = {
			"status": "running",
			"progress": 0.0,
			"current": 0,
			"total": 0,
			"result": None,
			"error": None,
		}
		with self._task_lock:
			self._tasks[task_id] = task

		def run() -> None:
			try:
				cass = self._svc.cass
				names = cass.list_files()
				if not names:
					task.update({"status": "done", "result": None, "error": "No files on device"})
					return
				sizes = cass.list_file_sizes()
				task["total"] = len(names)

				dir_name = os.path.join(dest_dir, f"cass_{int(time.time())}")
				os.makedirs(dir_name, exist_ok=True)

				for i, (name, size) in enumerate(zip(names, sizes)):
					task["current"] = i + 1
					task["progress"] = i / len(names)
					data = cass.read_file(name, size)
					cass.bytes_to_file(data, name, dir_name)

				fw_ver = cass.get_fw_ver()
				device_id = cass.get_device_ID()
				with open(Path(dir_name, "metadata.txt"), "w") as f:
					f.write(f"Firmware Ver: {fw_ver}\n")
					f.write(f"Device ID: {device_id}\n")

				task.update({"status": "done", "progress": 1.0, "result": dir_name})
			except Exception as e:
				task.update({"status": "error", "error": str(e)})

		threading.Thread(target=run, daemon=True).start()
		return ok(task_id)

	def get_task_status(self, task_id: str) -> dict:
		with self._task_lock:
			task = self._tasks.get(task_id)
		return ok(dict(task)) if task is not None else err("Unknown task ID")

	def delete_all_files(self) -> dict:
		"""Delete all files — GUI is responsible for showing the confirmation dialog first."""
		try:
			success = self._svc.cass.delete_all_files(prompt_user=False)
			if success is True:
				return ok("All files deleted")
			return err("Some files could not be deleted")
		except Exception as e:
			return err(str(e))

	# ── Data ───────────────────────────────────────────────────────────────────

	def parse_bin(self, path: str, fw_ver: str = "std") -> dict:
		"""Parse a .bin file and cache the DataFrame server-side.

		Returns a preview (first 100 rows) and downsampled chart data (≤2000 pts)
		so large files don't overwhelm the JS bridge.
		"""
		try:
			df = CassCommands.process_data_file(path, fw_ver)
			self._last_bin_df = df

			step = max(1, len(df) // 2000)
			chart_df = df.iloc[::step]

			susp_cols = [c for c in ("t", "a0", "b0") if c in chart_df.columns]
			imu_cols = [c for c in ("t", "gx", "gy", "gz") if c in chart_df.columns]

			return ok({
				"columns": list(df.columns),
				"rows": len(df),
				"preview": df.head(100).to_dict(orient="records"),
				"susp_data": chart_df[susp_cols].to_dict(orient="records"),
				"imu_data": chart_df[imu_cols].to_dict(orient="records"),
			})
		except Exception as e:
			return err(str(e))

	def parse_fit(self, path: str) -> dict:
		try:
			p = Path(path)
			df_session, df_record = CassCommands.process_fit_file(str(p.parent), p.name)
			self._last_fit_session_df = df_session
			self._last_fit_record_df = df_record
			return ok({
				"session_columns": list(df_session.columns),
				"session": df_session.to_dict(orient="records"),
				"record_columns": list(df_record.columns),
				"record": df_record.head(500).to_dict(orient="records"),
				"record_rows": len(df_record),
			})
		except Exception as e:
			return err(str(e))

	def export_csv(self, source: str, dest_path: str) -> dict:
		"""Export a cached DataFrame to CSV. source: 'bin' | 'fit_session' | 'fit_record'"""
		df_map = {
			"bin": self._last_bin_df,
			"fit_session": self._last_fit_session_df,
			"fit_record": self._last_fit_record_df,
		}
		df = df_map.get(source)
		if df is None:
			return err("No data to export — parse a file first.")
		try:
			df.to_csv(dest_path, index=False)
			return ok(f"Exported {len(df)} rows to {dest_path}")
		except Exception as e:
			return err(str(e))

	def find_metadata(self, dir_path: str) -> dict:
		try:
			result = CassCommands.find_and_parse_metadata(dir_path)
			return ok(result)
		except Exception as e:
			return err(str(e))

	# ── File Dialogs ────────────────────────────────────────────────────────────

	def pick_file(self, file_types: tuple = ("All files (*.*)",)) -> dict:
		try:
			result = webview.windows[0].create_file_dialog(
				webview.FileDialog.OPEN, file_types=file_types
			)
			return ok(result[0] if result else None)
		except Exception as e:
			return err(str(e))

	def pick_directory(self) -> dict:
		try:
			result = webview.windows[0].create_file_dialog(webview.FileDialog.FOLDER)
			return ok(result[0] if result else None)
		except Exception as e:
			return err(str(e))

	def pick_save_file(self, file_types: tuple = ("CSV files (*.csv)",)) -> dict:
		try:
			result = webview.windows[0].create_file_dialog(
				webview.FileDialog.SAVE, file_types=file_types
			)
			return ok(result if result else None)
		except Exception as e:
			return err(str(e))

	# ── Cloud (stub) ────────────────────────────────────────────────────────────

	def cloud_status(self) -> dict:
		return ok({"available": False, "message": "Cloud integration coming soon."})
