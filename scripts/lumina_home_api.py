#!/usr/bin/env python3
from __future__ import annotations

import json
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

from websocket import WebSocketApp


LISTEN_HOST = os.getenv("LUMINA_HOME_API_HOST", "127.0.0.1")
LISTEN_PORT = int(os.getenv("LUMINA_HOME_API_PORT", "18080"))
NEZHA_HTTP_BASE = os.getenv("NEZHA_HTTP_BASE", "http://127.0.0.1:8008")
NEZHA_WS_URL = os.getenv("NEZHA_WS_URL", "ws://127.0.0.1:8008/api/v1/ws/server")
PING_CACHE_TTL = int(os.getenv("LUMINA_PING_CACHE_TTL", "25"))
LOAD_CACHE_TTL = int(os.getenv("LUMINA_LOAD_CACHE_TTL", "20"))
SNAPSHOT_WAIT_TIMEOUT = float(os.getenv("LUMINA_SNAPSHOT_WAIT_TIMEOUT", "2.0"))
PING_FETCH_WORKERS = max(1, int(os.getenv("LUMINA_PING_FETCH_WORKERS", "6")))

LOAD_METRIC_MAP = {
    "cpu": "cpu",
    "memory": "ram",
    "swap": "swap",
    "disk": "disk",
    "net_in_speed": "net_in",
    "net_out_speed": "net_out",
    "net_in_transfer": "net_total_down",
    "net_out_transfer": "net_total_up",
    "load1": "load",
    "tcp_conn": "connections",
    "udp_conn": "connections_udp",
    "process_count": "process",
}


def now_ms() -> int:
    return int(time.time() * 1000)


def empty_ping(uuid: str) -> dict[str, Any]:
    return {
      "client": uuid,
      "isAssigned": False,
      "lastValue": None,
      "values": [],
      "samples": [],
      "max": 1,
      "loss": None,
    }


def empty_load_records() -> dict[str, Any]:
    return {
        "count": 0,
        "records": [],
    }


def hours_to_period(hours: int) -> str:
    if hours >= 720:
        return "30d"
    if hours >= 168:
        return "7d"
    return "1d"


def to_timestamp(value: Any) -> int:
    if isinstance(value, (int, float)):
        return int(value if value > 1_000_000_000_000 else value * 1000)
    if not value:
        return 0
    text = str(value).strip()
    if not text:
        return 0
    try:
        numeric = float(text)
        return int(numeric if numeric > 1_000_000_000_000 else numeric * 1000)
    except ValueError:
        pass
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except Exception:
        return 0


def select_primary_service(services: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not services:
        return None
    return sorted(
        services,
        key=lambda item: (-int(item.get("display_index", 0)), int(item.get("monitor_id", 0))),
    )[0]


def build_ping_overview(uuid: str, services: list[dict[str, Any]]) -> dict[str, Any]:
    primary = select_primary_service(services)
    if not primary:
        return empty_ping(uuid)

    created_at = primary.get("created_at") or []
    avg_delay = primary.get("avg_delay") or []
    size = min(len(created_at), len(avg_delay))
    samples = []
    for index in range(size):
        ts = to_timestamp(created_at[index])
        if ts <= 0:
            continue
        value = float(avg_delay[index] or 0)
        samples.append({
            "time": ts,
            "value": value,
        })
    samples.sort(key=lambda item: item["time"])
    values = [sample["value"] for sample in samples]
    positives = [value for value in values if value > 0]
    last_positive = next((value for value in reversed(values) if value > 0), None)
    lost = sum(1 for value in values if value <= 0)

    return {
        "client": uuid,
        "isAssigned": True,
        "lastValue": last_positive,
        "values": values,
        "samples": samples,
        "max": max(positives) if positives else 1,
        "loss": ((lost / len(values)) * 100) if values else None,
    }


@dataclass
class SnapshotState:
    payload: dict[str, Any] | None = None
    updated_at: int = 0
    event: threading.Event = field(default_factory=threading.Event)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def set(self, payload: dict[str, Any]) -> None:
        with self.lock:
            self.payload = payload
            self.updated_at = now_ms()
            self.event.set()

    def get(self) -> tuple[dict[str, Any] | None, int]:
        with self.lock:
            return self.payload, self.updated_at


@dataclass
class PingCacheEntry:
    expires_at: float
    value: dict[str, Any]


@dataclass
class LoadCacheEntry:
    expires_at: float
    value: dict[str, Any]


class LuminaHomeService:
    def __init__(self) -> None:
        self.snapshot_state = SnapshotState()
        self.ping_cache: dict[str, PingCacheEntry] = {}
        self.ping_lock = threading.Lock()
        self.load_cache: dict[str, LoadCacheEntry] = {}
        self.load_lock = threading.Lock()

    def fetch_json(self, path: str) -> Any:
        req = Request(f"{NEZHA_HTTP_BASE}{path}", headers={"Accept": "application/json"})
        with urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))

    def get_snapshot(self) -> dict[str, Any] | None:
        payload, _ = self.snapshot_state.get()
        if payload is not None:
            return payload
        self.snapshot_state.event.wait(SNAPSHOT_WAIT_TIMEOUT)
        payload, _ = self.snapshot_state.get()
        return payload

    def get_service_history(self, uuid: str) -> list[dict[str, Any]]:
        now = time.time()
        with self.ping_lock:
            entry = self.ping_cache.get(uuid)
            if entry and entry.expires_at > now:
                return entry.value["services"]

        data = self.fetch_json(f"/api/v1/server/{uuid}/service?period=1d")
        services = data.get("data") if isinstance(data, dict) else data
        if not isinstance(services, list):
            services = []

        with self.ping_lock:
            self.ping_cache[uuid] = PingCacheEntry(
                expires_at=now + PING_CACHE_TTL,
                value={"services": services},
            )
        return services

    def get_ping_overview_batch(self, uuids: list[str]) -> dict[str, Any]:
        normalized = sorted({uuid.strip() for uuid in uuids if uuid and uuid.strip()}, key=lambda item: int(item))
        if not normalized:
            snapshot = self.get_snapshot() or {}
            normalized = [str(server.get("id")) for server in snapshot.get("servers", []) if server.get("id") is not None]
        if not normalized:
            return {}

        result: dict[str, Any] = {}
        max_workers = min(PING_FETCH_WORKERS, max(1, len(normalized)))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_map = {
                executor.submit(self.get_service_history, uuid): uuid
                for uuid in normalized
            }
            for future in as_completed(future_map):
                uuid = future_map[future]
                try:
                    services = future.result()
                    result[uuid] = build_ping_overview(uuid, services)
                except Exception:
                    logging.exception("failed to build ping overview for %s", uuid)
                    result[uuid] = empty_ping(uuid)
        return result

    def get_server_totals(self, uuid: str) -> dict[str, Any]:
        snapshot = self.get_snapshot() or {}
        for server in snapshot.get("servers", []):
            if str(server.get("id")) != uuid:
                continue
            host = server.get("host") or {}
            return {
                "ram_total": host.get("mem_total") or 0,
                "swap_total": host.get("swap_total") or 0,
                "disk_total": host.get("disk_total") or 0,
            }
        return {
            "ram_total": 0,
            "swap_total": 0,
            "disk_total": 0,
        }

    def get_metric_series(self, uuid: str, metric: str, period: str) -> dict[str, Any]:
        return self.fetch_json(f"/api/v1/server/{uuid}/metrics?metric={metric}&period={period}")

    def get_load_records(self, uuid: str, hours: int) -> dict[str, Any]:
        try:
            server_id = int(uuid)
        except (TypeError, ValueError):
            return empty_load_records()
        if server_id <= 0:
            return empty_load_records()

        period = hours_to_period(hours)
        cache_key = f"{uuid}:{period}"
        now = time.time()
        with self.load_lock:
            cached = self.load_cache.get(cache_key)
            if cached and cached.expires_at > now:
                return cached.value

        totals = self.get_server_totals(uuid)
        point_map: dict[int, dict[str, Any]] = {}

        def ensure_point(raw_time: Any) -> dict[str, Any]:
            timestamp = to_timestamp(raw_time)
            current = point_map.get(timestamp)
            if current is not None:
                return current
            created = {
                "cpu": 0,
                "gpu": 0,
                "ram": 0,
                "ram_total": totals["ram_total"],
                "swap": 0,
                "swap_total": totals["swap_total"],
                "load": 0,
                "temp": 0,
                "disk": 0,
                "disk_total": totals["disk_total"],
                "net_in": 0,
                "net_out": 0,
                "net_total_up": 0,
                "net_total_down": 0,
                "process": 0,
                "connections": 0,
                "connections_udp": 0,
                "time": timestamp,
                "client": uuid,
            }
            point_map[timestamp] = created
            return created

        max_workers = min(PING_FETCH_WORKERS, max(1, len(LOAD_METRIC_MAP)))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_map = {
                executor.submit(self.get_metric_series, uuid, metric, period): metric
                for metric in LOAD_METRIC_MAP.keys()
            }
            for future in as_completed(future_map):
                metric = future_map[future]
                field = LOAD_METRIC_MAP[metric]
                try:
                    payload = future.result()
                    data_points = (payload.get("data") or {}).get("data_points", [])
                    if not isinstance(data_points, list):
                        continue
                    for point in data_points:
                        target = ensure_point(point.get("ts"))
                        target[field] = point.get("value") or 0
                except Exception:
                    logging.exception("failed to fetch metric %s for %s", metric, uuid)

        records = [point_map[key] for key in sorted(point_map.keys())]
        result = {
            "count": len(records),
            "records": records,
        }
        with self.load_lock:
            self.load_cache[cache_key] = LoadCacheEntry(
                expires_at=now + LOAD_CACHE_TTL,
                value=result,
            )
        return result

    def build_home_bootstrap(self) -> dict[str, Any]:
        snapshot = self.get_snapshot()
        if snapshot is None:
            raise RuntimeError("snapshot not ready")
        uuids = [str(server.get("id")) for server in snapshot.get("servers", []) if server.get("id") is not None]
        return {
            "snapshot": snapshot,
            "ping_overviews": self.get_ping_overview_batch(uuids),
        }


SERVICE = LuminaHomeService()


class LuminaHandler(BaseHTTPRequestHandler):
    server_version = "LuminaHomeAPI/1.0"

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/healthz":
                self.write_json(HTTPStatus.OK, {"success": True, "data": {"ok": True}})
                return

            if parsed.path == "/lumina-api/home-bootstrap":
                data = SERVICE.build_home_bootstrap()
                self.write_json(HTTPStatus.OK, {"success": True, "data": data})
                return

            if parsed.path == "/lumina-api/ping-overview":
                query = parse_qs(parsed.query)
                uuids = []
                for raw in query.get("uuids", []):
                    uuids.extend(part.strip() for part in raw.split(","))
                data = SERVICE.get_ping_overview_batch(uuids)
                self.write_json(HTTPStatus.OK, {"success": True, "data": data})
                return

            if parsed.path == "/lumina-api/load-records":
                query = parse_qs(parsed.query)
                uuid = (query.get("uuid", [""]) or [""])[0].strip()
                hours_raw = (query.get("hours", ["24"]) or ["24"])[0].strip()
                try:
                    hours = int(hours_raw or "24")
                except ValueError:
                    hours = 24
                data = SERVICE.get_load_records(uuid, hours)
                self.write_json(HTTPStatus.OK, {"success": True, "data": data})
                return

            self.write_json(HTTPStatus.NOT_FOUND, {"success": False, "error": "not found"})
        except RuntimeError as exc:
            self.write_json(HTTPStatus.SERVICE_UNAVAILABLE, {"success": False, "error": str(exc)})
        except (HTTPError, URLError) as exc:
            self.write_json(HTTPStatus.BAD_GATEWAY, {"success": False, "error": str(exc)})
        except Exception as exc:  # noqa: BLE001
            logging.exception("request failed")
            self.write_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"success": False, "error": str(exc)})

    def log_message(self, format: str, *args: Any) -> None:
        logging.info("%s - %s", self.address_string(), format % args)

    def write_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def websocket_worker() -> None:
    def on_message(_ws: WebSocketApp, message: str) -> None:
        try:
            payload = json.loads(message)
            if isinstance(payload, dict):
                SERVICE.snapshot_state.set(payload)
        except Exception:
            logging.exception("invalid websocket payload")

    def on_error(_ws: WebSocketApp, error: Exception) -> None:
        logging.warning("websocket error: %s", error)

    while True:
        ws = WebSocketApp(
            NEZHA_WS_URL,
            on_message=on_message,
            on_error=on_error,
        )
        try:
            ws.run_forever(ping_interval=20, ping_timeout=10)
        except Exception:
            logging.exception("websocket loop crashed")
        time.sleep(2)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    threading.Thread(target=websocket_worker, daemon=True).start()
    httpd = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), LuminaHandler)
    logging.info("Lumina home API listening on http://%s:%s", LISTEN_HOST, LISTEN_PORT)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
