"""Servidor estático do preview + endpoint POST /save para gravar capturas PNG em evidence/."""
import base64, http.server, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVIDENCE = os.path.join(ROOT, "evidence")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # desenvolvimento: nunca reaproveitar módulos JS antigos do cache
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path != "/save":
            self.send_error(404)
            return
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        name = re.sub(r"[^a-zA-Z0-9_.-]", "_", body["name"])
        os.makedirs(EVIDENCE, exist_ok=True)
        data = body["data"].split(",", 1)[1]
        with open(os.path.join(EVIDENCE, name), "wb") as f:
            f.write(base64.b64decode(data))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")


if __name__ == "__main__":
    # porta: argumento > variável PORT (atribuída pelo preview) > 5178
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 5178))
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
