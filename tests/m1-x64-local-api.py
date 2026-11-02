#!/usr/bin/env python3
"""M1 2.1.310 x64 本机模型 API + Read 工具调用闭环差分。

必须明确传入发行程序，不读取用户凭据、不向外部服务发请求。
仅验证 CLI 的本机模型协议和工具权限链，不宣称覆盖真实云服务。
"""
import argparse
import hashlib
import http.server
import json
import os
import pathlib
import subprocess
import tempfile
import threading
import time
from socketserver import ThreadingMixIn

BINARY_SHA256 = "b73676430af12f97316a798b8371f81d640f90a58bdcb8f3ce56a835bb47df56"
MARKER = "M1_X64_MOCK_MODEL_OK"
FIXTURE = "M1_READ_TOOL_FIXTURE_OK"
MODEL = "claude-sonnet-4-5"


def sse_event(kind, payload):
    return f"event: {kind}\ndata: {json.dumps(payload)}\n\n"


def make_stream(model, stop_reason, block):
    message = dict(id="msg_m1_local", type="message", role="assistant", model=model,
                   content=[], stop_reason=None, stop_sequence=None,
                   usage=dict(input_tokens=14, output_tokens=0))
    data = sse_event("message_start", {"type": "message_start", "message": message})
    if block["type"] == "text":
        data += sse_event("content_block_start", {"type": "content_block_start",
                   "index": 0, "content_block": {"type": "text", "text": ""}})
        delta = {"type": "text_delta", "text": block["text"]}
    else:
        data += sse_event("content_block_start", {"type": "content_block_start",
                   "index": 0, "content_block": {"type": "tool_use",
                   "id": block["id"], "name": block["name"], "input": {}}})
        delta = {"type": "input_json_delta", "partial_json": json.dumps(block["input"])}
    data += sse_event("content_block_delta", {"type": "content_block_delta",
                      "index": 0, "delta": delta})
    data += sse_event("content_block_stop", {"type": "content_block_stop", "index": 0})
    data += sse_event("message_delta", {"type": "message_delta",
                      "delta": {"stop_reason": stop_reason, "stop_sequence": None},
                      "usage": {"output_tokens": 8}})
    return data + sse_event("message_stop", {"type": "message_stop"})


class ThreadingHTTPServer(ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def run_mode(binary, mode, scratch):
    requests = []
    fixture = pathlib.Path(scratch, "fixture.txt")
    fixture.write_text(FIXTURE + "\n", "utf-8")

    class LocalAPI(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            if not self.path.startswith("/v1/messages"):
                self.send_error(404, "No such local API route")
                return
            payload = json.loads(body)
            results = [block for message in payload.get("messages", [])
                       for block in message.get("content", [])
                       if isinstance(block, dict) and block.get("type") == "tool_result"]
            requests.append({
                "route": self.path,
                "model": payload.get("model"),
                "tools": [tool.get("name") for tool in payload.get("tools", [])],
                "results": results,
                "stream": payload.get("stream"),
            })
            if mode == "stream":
                stream = make_stream(payload["model"], "end_turn",
                                     {"type": "text", "text": MARKER})
            elif len(requests) == 1:
                stream = make_stream(payload["model"], "tool_use",
                                     {"type": "tool_use", "id": "toolu_m1_read",
                                      "name": "Read", "input": {"file_path": str(fixture)}})
            else:
                stream = make_stream(payload["model"], "end_turn",
                                     {"type": "text", "text": MARKER})
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            self.wfile.write(stream.encode("utf-8"))
            self.wfile.flush()

    server = ThreadingHTTPServer(("127.0.0.1", 0), LocalAPI)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    home = pathlib.Path(scratch, "home")
    home.mkdir()
    # Do not inherit any user/provider credentials into a reference test.
    env = {key: value for key, value in os.environ.items()
           if not any(part in key.upper() for part in
                      ("ANTHROPIC", "CLAUDE", "TOKEN", "PASSWORD", "SECRET",
                       "API_KEY", "AWS_", "GOOGLE_", "OPENAI_", "GITHUB_", "GITLAB_"))}
    env.update({
        "HOME": str(home), "XDG_CONFIG_HOME": str(home / ".config"),
        "CI": "1", "TERM": "dumb", "NO_COLOR": "1",
        "ANTHROPIC_BASE_URL": f"http://127.0.0.1:{server.server_port}",
        "ANTHROPIC_API_KEY": "sk-ant-api03-m1-fixture-not-real",
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
        "DISABLE_TELEMETRY": "1", "DO_NOT_TRACK": "1",
    })
    args = [binary, "--bare", "--print", "--output-format",
            "stream-json" if mode == "stream" else "json",
            "--verbose" if mode == "stream" else "--model",
            MODEL] if mode == "stream" else [binary, "--bare", "--print",
            "--output-format", "json", "--model", MODEL, "--max-turns", "2"]
    if mode == "stream":
        args.extend(["--model", MODEL, "--max-turns", "1"])
    if mode == "read":
        args.append("--allowedTools=Read")
    elif mode == "denied":
        args.append("--disallowedTools=Read")
    args.append("Local offline test, no external tools")
    started = time.monotonic()
    try:
        run = subprocess.run(args, cwd=scratch, env=env, input="",
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             text=True, timeout=15)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
    frames = [json.loads(line) for line in run.stdout.splitlines() if line.strip()] \
        if mode == "stream" else [json.loads(run.stdout)]
    final = next((item for item in reversed(frames) if item.get("type") == "result"), {})
    assert run.returncode == 0, (mode, run.returncode, run.stderr[:500], run.stdout[:500])
    assert MARKER in final.get("result", ""), (mode, final)
    assert final.get("terminal_reason") == "completed", (mode, final)
    assert len(requests) == (1 if mode == "stream" else 2), (mode, len(requests))
    assert all(request["route"].startswith("/v1/messages") for request in requests)
    assert all(request["model"] == MODEL for request in requests)
    assert all(request["stream"] is True for request in requests)
    if mode == "stream":
        assert frames[0]["type"] == "system" and frames[0]["subtype"] == "init"
    if mode == "read":
        assert "Read" in requests[0]["tools"]
        result = requests[1]["results"]
        assert len(result) == 1 and FIXTURE in str(result[0].get("content"))
        assert not result[0].get("is_error", False)
    if mode == "denied":
        assert "Read" not in requests[0]["tools"]
        result = requests[1]["results"]
        assert len(result) == 1 and result[0].get("is_error", False)
        assert FIXTURE not in str(result[0].get("content"))
    return {"case": mode, "passed": True, "requests": len(requests),
            "exit_code": run.returncode, "elapsed_s": round(time.monotonic()-started, 3),
            "tool_names": requests[0]["tools"], "terminal_reason": final["terminal_reason"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", required=True, type=pathlib.Path)
    parser.add_argument("--report", required=True, type=pathlib.Path)
    args = parser.parse_args()
    checksum = hashlib.sha256(args.binary.read_bytes()).hexdigest()
    if checksum != BINARY_SHA256:
        raise ValueError(f"2.1.310 官方二进制 SHA-256 不一致: {checksum}")
    with tempfile.TemporaryDirectory(prefix="m1-local-api-") as tmp:
        cases = []
        for mode in ("stream", "read", "denied"):
            scope = pathlib.Path(tmp, mode)
            scope.mkdir()
            cases.append(run_mode(str(args.binary.resolve()), mode, str(scope)))
    report = {"schema": 1, "release": "2.1.310", "reference_sha256": checksum,
              "scope": "LOCAL_LOOPBACK_MOCK_SSE_AND_REAL_READ_TOOL",
              "count": len(cases), "passed": sum(c["passed"] for c in cases),
              "cases": cases, "network": "only localhost model endpoint; no real API credentials"}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", "utf-8")
    print(json.dumps({"passed": report["passed"], "total": len(cases)}))


if __name__ == "__main__":
    main()
