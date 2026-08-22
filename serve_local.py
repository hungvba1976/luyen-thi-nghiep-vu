from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
print("Mở trên máy tính: http://localhost:8080")
print("Dừng bằng Ctrl+C")
ThreadingHTTPServer(("0.0.0.0", 8080), SimpleHTTPRequestHandler).serve_forever()
