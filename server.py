import http.server
import socketserver
import webbrowser
import os

PORT = 8089
HOST = "127.0.0.1"
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)


def run():
    with ReusableTCPServer((HOST, PORT), Handler) as httpd:
        url = f"http://{HOST}:{PORT}/index.html"
        print("==================================================")
        print(" 台股 ETF 四強情報戰情室 本地服務器已啟動！")
        print(f" 網址: {url}")
        print(" 請勿關閉此視窗，按 Ctrl+C 可停止服務器。")
        print("==================================================")
        webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n服務器已停止。")


if __name__ == "__main__":
    run()
