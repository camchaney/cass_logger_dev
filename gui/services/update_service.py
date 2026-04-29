"""Singleton service for checking and applying app updates."""

import hashlib
import json
import os
import platform
import subprocess
import sys
import threading
import time
import urllib.request
import uuid
from pathlib import Path
from typing import Optional

import platformdirs

from gui.__version__ import VERSION

MANIFEST_URL = (
	"https://github.com/camchaney/cass_logger_dev"
	"/releases/latest/download/manifest.json"
)
_APP_NAME = "CassLogger"
_CONFIG_DIR = Path(platformdirs.user_data_dir(_APP_NAME, roaming=False))


def _parse_ver(v: str) -> tuple[int, ...]:
	return tuple(int(x) for x in v.strip().split("."))


def _platform_key() -> str:
	system = platform.system()
	machine = platform.machine().lower()
	if system == "Darwin":
		return f"darwin-{machine}"   # darwin-arm64 or darwin-x86_64
	if system == "Windows":
		return "win32-x64"
	return f"{system.lower()}-{machine}"


class UpdateService:
	"""Singleton that checks for updates and manages installer downloads."""

	_instance: Optional["UpdateService"] = None
	_init_lock = threading.Lock()

	def __new__(cls) -> "UpdateService":
		if cls._instance is None:
			with cls._init_lock:
				if cls._instance is None:
					inst = super().__new__(cls)
					inst._lock = threading.Lock()
					inst._state = "unknown"
					inst._installed = VERSION
					inst._latest: Optional[str] = None
					inst._minimum: Optional[str] = None
					inst._changelog: Optional[str] = None
					inst._check_error: Optional[str] = None
					inst._checking = False
					inst._downloads: dict[str, dict] = {}
					_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
					cls._instance = inst
		return cls._instance

	# ── Public API ─────────────────────────────────────────────────────────────

	def start_check(self) -> None:
		"""Kick off a non-blocking background manifest fetch. Idempotent."""
		with self._lock:
			if self._checking or self._state != "unknown":
				return
			self._checking = True
		threading.Thread(target=self._run_check, daemon=True).start()

	def get_state(self) -> dict:
		with self._lock:
			return {
				"state": self._state,
				"installed_version": self._installed,
				"latest_version": self._latest,
				"minimum_version": self._minimum,
				"changelog": self._changelog,
				"error": self._check_error,
			}

	def start_download(self) -> str:
		"""Begin downloading the platform installer. Returns a task_id to poll."""
		task_id = str(uuid.uuid4())
		task: dict = {
			"status": "running",
			"progress": 0.0,
			"downloaded_bytes": 0,
			"total_bytes": 0,
			"installer_path": None,
			"error": None,
		}
		with self._lock:
			self._downloads[task_id] = task

		manifest = self._load_manifest_cache()
		platform_key = _platform_key()
		entry = manifest.get("platforms", {}).get(platform_key) if manifest else None

		if not entry:
			task.update({
				"status": "error",
				"error": f"No installer available for platform '{platform_key}'",
			})
			return task_id

		url = entry["url"]
		expected_sha256: Optional[str] = entry.get("sha256")
		threading.Thread(
			target=self._run_download,
			args=(task_id, url, expected_sha256),
			daemon=True,
		).start()
		return task_id

	def get_download_status(self, task_id: str) -> Optional[dict]:
		with self._lock:
			task = self._downloads.get(task_id)
		return dict(task) if task is not None else None

	def launch_and_quit(self, task_id: str) -> bool:
		"""Open the downloaded installer and quit the app. Returns False if not ready."""
		with self._lock:
			task = self._downloads.get(task_id)
		if not task or task["status"] != "done" or not task["installer_path"]:
			return False
		path = task["installer_path"]
		try:
			if platform.system() == "Darwin":
				subprocess.Popen(["open", path])
			elif platform.system() == "Windows":
				subprocess.Popen([path])
			else:
				subprocess.Popen(["xdg-open", path])
		except Exception:
			pass
		threading.Thread(
			target=lambda: (time.sleep(1.5), sys.exit(0)),
			daemon=True,
		).start()
		return True

	def dismiss(self) -> None:
		"""User clicked 'Later' — banner returns on next launch."""
		pass

	def skip_version(self, version: str) -> None:
		"""Persist 'skip this version' so the banner won't reappear for it."""
		prefs = self._load_prefs()
		prefs["skipped_version"] = version
		self._save_prefs(prefs)
		with self._lock:
			if self._latest == version:
				self._state = "up_to_date"

	# ── Private ────────────────────────────────────────────────────────────────

	def _run_check(self) -> None:
		try:
			manifest = _fetch_manifest()
			self._save_manifest_cache(manifest)
		except Exception:
			manifest = self._load_manifest_cache()

		prefs = self._load_prefs()

		with self._lock:
			self._checking = False
			if manifest is None:
				self._state = "error"
				self._check_error = "Could not reach update server."
				return

			self._latest = manifest.get("latest_version")
			self._minimum = manifest.get("minimum_supported_version")
			self._changelog = manifest.get("changelog")

			if not self._latest:
				self._state = "error"
				self._check_error = "Manifest missing latest_version."
				return

			if prefs.get("skipped_version") == self._latest:
				self._state = "up_to_date"
				return

			installed = _parse_ver(self._installed)
			latest = _parse_ver(self._latest)
			minimum = _parse_ver(self._minimum) if self._minimum else (0,)

			if installed < minimum:
				self._state = "hard_update"
			elif installed < latest:
				self._state = "soft_update"
			else:
				self._state = "up_to_date"

	def _run_download(
		self, task_id: str, url: str, expected_sha256: Optional[str]
	) -> None:
		task = self._downloads[task_id]
		cache_dir = Path(platformdirs.user_cache_dir(_APP_NAME))
		cache_dir.mkdir(parents=True, exist_ok=True)
		dest = cache_dir / url.split("/")[-1]

		try:
			with urllib.request.urlopen(url, timeout=30) as response:
				total = int(response.headers.get("Content-Length", 0))
				task["total_bytes"] = total
				sha = hashlib.sha256()
				downloaded = 0
				with open(dest, "wb") as f:
					while True:
						chunk = response.read(65536)
						if not chunk:
							break
						f.write(chunk)
						sha.update(chunk)
						downloaded += len(chunk)
						task["downloaded_bytes"] = downloaded
						task["progress"] = downloaded / total if total else 0.0

			if expected_sha256:
				task["status"] = "verifying"
				if sha.hexdigest() != expected_sha256.lower():
					dest.unlink(missing_ok=True)
					task.update({
						"status": "error",
						"error": "SHA-256 mismatch — file may be corrupted. Please retry.",
					})
					return

			task.update({"status": "done", "progress": 1.0, "installer_path": str(dest)})

		except Exception as e:
			task.update({"status": "error", "error": str(e)})

	# ── Persistence helpers ────────────────────────────────────────────────────

	def _manifest_cache_path(self) -> Path:
		return _CONFIG_DIR / "manifest_cache.json"

	def _prefs_path(self) -> Path:
		return _CONFIG_DIR / "update_prefs.json"

	def _load_manifest_cache(self) -> Optional[dict]:
		try:
			return json.loads(self._manifest_cache_path().read_text())
		except Exception:
			return None

	def _save_manifest_cache(self, manifest: dict) -> None:
		try:
			self._manifest_cache_path().write_text(json.dumps(manifest, indent=2))
		except Exception:
			pass

	def _load_prefs(self) -> dict:
		try:
			return json.loads(self._prefs_path().read_text())
		except Exception:
			return {}

	def _save_prefs(self, prefs: dict) -> None:
		try:
			self._prefs_path().write_text(json.dumps(prefs, indent=2))
		except Exception:
			pass


def _fetch_manifest() -> dict:
	with urllib.request.urlopen(MANIFEST_URL, timeout=10) as resp:
		return json.loads(resp.read())
