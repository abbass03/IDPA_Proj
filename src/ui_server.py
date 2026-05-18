from __future__ import annotations

import json
import os
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from comparison_service import compare_documents
from cluster_service import available_countries, extract_submatrix, run_clustering as _run_clustering
from distance_matrix import compute_distance_matrix_from_files
from clustering import agglomerative_clustering, kmedoids_clustering, dunn_index, silhouette_score


PROJECT_ROOT = Path(__file__).resolve().parent.parent
UI_DIR = PROJECT_ROOT / "ui"
DATA_DIR = PROJECT_ROOT / "data"
LIVE_XML_DIR = DATA_DIR / "live_xml"
HOST = "127.0.0.1"
PORT = 8765


def json_response(handler: BaseHTTPRequestHandler, payload: dict, status: int = HTTPStatus.OK) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def text_response(handler: BaseHTTPRequestHandler, text: str, content_type: str = "text/plain; charset=utf-8") -> None:
    body = text.encode("utf-8")
    handler.send_response(HTTPStatus.OK)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def list_relative_files(folder: Path, suffix: str) -> list[str]:
    if not folder.exists():
        return []
    files = [path.relative_to(PROJECT_ROOT).as_posix() for path in folder.glob(f"*{suffix}") if path.is_file()]
    return sorted(files)


def slugify_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.strip().lower())
    slug = re.sub(r"_+", "_", slug).strip("_")
    return slug or "country"


def list_live_files() -> list[str]:
    LIVE_XML_DIR.mkdir(parents=True, exist_ok=True)
    return list_relative_files(LIVE_XML_DIR, ".xml")


def save_live_xml(name: str, xml_text: str) -> str:
    from parser import parse_xml_file

    LIVE_XML_DIR.mkdir(parents=True, exist_ok=True)
    slug = slugify_name(name)
    path = LIVE_XML_DIR / f"{slug}.xml"
    path.write_text(xml_text, encoding="utf-8")
    parse_xml_file(str(path))
    return path.relative_to(PROJECT_ROOT).as_posix()


def combine_cluster_metrics(countries: list[str], matrix: list[list[int]], assignments: dict[str, int]) -> dict[str, float | None]:
    valid = [c for c in countries if assignments.get(c, -1) != -1]
    unique_ids = {assignments[c] for c in valid}
    if len(valid) < 2 or len(unique_ids) < 2:
        return {"silhouette": None, "dunn": None}

    vi = [countries.index(c) for c in valid]
    vm = [[matrix[r][c] for c in vi] for r in vi]
    va = {c: assignments[c] for c in valid}
    sil, _ = silhouette_score(valid, vm, va)
    di = dunn_index(valid, vm, va)
    return {"silhouette": round(sil, 4), "dunn": round(di, 4)}


def run_live_clustering(files: list[str], method: str, algorithm: str, params: dict) -> dict:
    countries, matrix = compute_distance_matrix_from_files(files, method=method, preprocess=True)
    pretty_names = [Path(path).stem for path in files]

    if algorithm == "ahc":
        k = int(params.get("n_clusters", 3))
        linkage = str(params.get("linkage", "average"))
        result = agglomerative_clustering(pretty_names, matrix, n_clusters=k, linkage=linkage)
    elif algorithm == "kmedoids":
        k = int(params.get("k", 3))
        result = kmedoids_clustering(pretty_names, matrix, k=k)
    else:
        raise ValueError("Live clustering supports only AHC and k-medoids.")

    result["countries"] = pretty_names
    result["files"] = files
    result["matrix"] = matrix
    result["metrics"] = combine_cluster_metrics(pretty_names, matrix, result.get("assignments", {}))
    result["cluster_members"] = {
        str(k): v for k, v in result.get("cluster_members", {}).items()
    }
    if "noise" not in result:
        result["noise"] = []
    return result


def safe_project_path(relative_path: str) -> Path:
    path = (PROJECT_ROOT / relative_path).resolve()
    if PROJECT_ROOT not in path.parents and path != PROJECT_ROOT:
        raise ValueError("Path escapes project root.")
    return path


def read_static_file(request_path: str) -> tuple[bytes, str] | None:
    relative = request_path.lstrip("/") or "index.html"
    if relative == "":
        relative = "index.html"

    file_path = (UI_DIR / relative).resolve()
    if UI_DIR not in file_path.parents and file_path != UI_DIR / "index.html":
        return None
    if not file_path.exists() or not file_path.is_file():
        return None

    suffix_map = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
    }
    content_type = suffix_map.get(file_path.suffix.lower(), "application/octet-stream")
    return file_path.read_bytes(), content_type


class UIRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)

        if parsed.path == "/api/cluster/countries":
            try:
                countries = available_countries()
                json_response(self, {"countries": countries})
            except Exception as exc:
                json_response(self, {"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        if parsed.path == "/api/live/files":
            try:
                json_response(
                    self,
                    {
                        "built_in": list_relative_files(DATA_DIR / "normalized_xml", ".xml"),
                        "live": list_live_files(),
                    },
                )
            except Exception as exc:
                json_response(self, {"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        if parsed.path == "/api/options":
            payload = {
                "methods": ["custom", "chawathe", "nj"],
                "modes": {
                    "xml": {
                        "files": list_relative_files(DATA_DIR / "normalized_xml", ".xml"),
                    },
                    "wiki": {
                        "files": list_relative_files(DATA_DIR / "original_infobox_source", ".wiki"),
                    },
                },
            }
            json_response(self, payload)
            return

        if parsed.path == "/api/file":
            query = parse_qs(parsed.query)
            relative_path = query.get("path", [""])[0]
            if not relative_path:
                json_response(self, {"error": "Missing path parameter."}, status=HTTPStatus.BAD_REQUEST)
                return

            try:
                file_path = safe_project_path(relative_path)
            except ValueError:
                json_response(self, {"error": "Invalid path."}, status=HTTPStatus.BAD_REQUEST)
                return

            if not file_path.exists() or not file_path.is_file():
                json_response(self, {"error": "File not found."}, status=HTTPStatus.NOT_FOUND)
                return

            text_response(self, file_path.read_text(encoding="utf-8"))
            return

        static = read_static_file(parsed.path if parsed.path != "/" else "/index.html")
        if static is None:
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        body, content_type = static
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/live/add":
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length)
            try:
                payload = json.loads(raw_body.decode("utf-8"))
            except json.JSONDecodeError:
                json_response(self, {"error": "Invalid JSON."}, status=HTTPStatus.BAD_REQUEST)
                return

            name = str(payload.get("name", "")).strip()
            xml_text = str(payload.get("xml", "")).strip()
            if not name or not xml_text:
                json_response(self, {"error": "Both name and xml are required."}, status=HTTPStatus.BAD_REQUEST)
                return

            try:
                relative_path = save_live_xml(name, xml_text)
                json_response(self, {"path": relative_path, "live": list_live_files()})
            except Exception as exc:
                json_response(self, {"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        if parsed.path == "/api/live/compare":
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length)
            try:
                payload = json.loads(raw_body.decode("utf-8"))
            except json.JSONDecodeError:
                json_response(self, {"error": "Invalid JSON."}, status=HTTPStatus.BAD_REQUEST)
                return

            method = str(payload.get("method", "custom")).lower()
            file1 = str(payload.get("file1", ""))
            file2 = str(payload.get("file2", ""))
            if method not in {"custom", "chawathe", "nj"}:
                json_response(self, {"error": "Unsupported method."}, status=HTTPStatus.BAD_REQUEST)
                return
            try:
                abs_file1 = safe_project_path(file1)
                abs_file2 = safe_project_path(file2)
                result = compare_documents(
                    mode="xml",
                    file1=os.fspath(abs_file1),
                    file2=os.fspath(abs_file2),
                    method=method,
                    output_dir=os.fspath(DATA_DIR / "output"),
                )
                json_response(self, result)
            except Exception as exc:
                json_response(self, {"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        if parsed.path == "/api/live/cluster":
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length)
            try:
                payload = json.loads(raw_body.decode("utf-8"))
            except json.JSONDecodeError:
                json_response(self, {"error": "Invalid JSON."}, status=HTTPStatus.BAD_REQUEST)
                return

            files = payload.get("files", [])
            method = str(payload.get("method", "custom")).lower()
            algorithm = str(payload.get("algorithm", "ahc")).lower()
            params = payload.get("params", {})

            if not isinstance(files, list) or len(files) < 2:
                json_response(self, {"error": "Select at least two XML files."}, status=HTTPStatus.BAD_REQUEST)
                return
            if method not in {"custom", "chawathe", "nj"}:
                json_response(self, {"error": "Unsupported method."}, status=HTTPStatus.BAD_REQUEST)
                return

            try:
                safe_files = [os.fspath(safe_project_path(path)) for path in files]
                result = run_live_clustering(safe_files, method, algorithm, params)
                json_response(self, result)
            except Exception as exc:
                json_response(self, {"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        if parsed.path == "/api/cluster/run":
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length)
            try:
                payload = json.loads(raw_body.decode("utf-8"))
            except json.JSONDecodeError:
                json_response(self, {"error": "Invalid JSON."}, status=HTTPStatus.BAD_REQUEST)
                return

            selected = payload.get("countries", [])
            algorithm = str(payload.get("algorithm", "ahc")).lower()
            params = payload.get("params", {})

            if not selected or not isinstance(selected, list):
                json_response(self, {"error": "countries must be a non-empty list."}, status=HTTPStatus.BAD_REQUEST)
                return
            if algorithm not in {"ahc", "kmedoids", "kmeans", "dbscan"}:
                json_response(self, {"error": f"Unknown algorithm: {algorithm}"}, status=HTTPStatus.BAD_REQUEST)
                return

            try:
                matrix = extract_submatrix(selected)
                result = _run_clustering(selected, matrix, algorithm, params)
                json_response(self, result)
            except Exception as exc:
                json_response(self, {"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        if parsed.path != "/api/compare":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            json_response(self, {"error": "Invalid JSON body."}, status=HTTPStatus.BAD_REQUEST)
            return

        mode = str(payload.get("mode", "")).lower()
        method = str(payload.get("method", "custom")).lower()
        file1 = str(payload.get("file1", ""))
        file2 = str(payload.get("file2", ""))

        if mode not in {"xml", "wiki"}:
            json_response(self, {"error": "Mode must be xml or wiki."}, status=HTTPStatus.BAD_REQUEST)
            return
        if method not in {"custom", "chawathe", "nj"}:
            json_response(self, {"error": "Unsupported method."}, status=HTTPStatus.BAD_REQUEST)
            return
        if not file1 or not file2:
            json_response(self, {"error": "Both file selections are required."}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            abs_file1 = safe_project_path(file1)
            abs_file2 = safe_project_path(file2)
        except ValueError:
            json_response(self, {"error": "Invalid file path."}, status=HTTPStatus.BAD_REQUEST)
            return

        if not abs_file1.exists() or not abs_file2.exists():
            json_response(self, {"error": "Selected file does not exist."}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            result = compare_documents(
                mode=mode,
                file1=os.fspath(abs_file1),
                file2=os.fspath(abs_file2),
                method=method,
                output_dir=os.fspath(DATA_DIR / "output"),
            )
        except Exception as exc:  # pragma: no cover - defensive API path
            json_response(self, {"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        json_response(self, result)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), UIRequestHandler)
    print(f"Project UI available at http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop the server.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down UI server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
