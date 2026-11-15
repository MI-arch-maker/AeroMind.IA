import asyncio
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from web.cad_body_limit import CadBodyLimitMiddleware


def test_content_length_rejected_before_multipart_handler():
    app = FastAPI()
    app.add_middleware(CadBodyLimitMiddleware, max_source_bytes=8)
    called = []
    @app.post('/api/cad/imports')
    async def upload(request: Request):
        called.append(True)
        await request.form()
        return {'unexpected': True}
    response = TestClient(app).post('/api/cad/imports', content=b'x', headers={'Content-Length': str(64 * 1024 + 9)})
    assert response.status_code == 413
    assert not called


def test_receive_stream_stops_before_oversized_chunk_is_delivered():
    delivered = []
    sent = []
    async def app(scope, receive, send):
        from starlette.exceptions import HTTPException
        try:
            while True:
                message = await receive()
                delivered.append(message.get('body', b''))
                if not message.get('more_body'):
                    break
        except HTTPException as exc:
            assert exc.status_code == 413
            return
        raise AssertionError('Expected streaming body limit')
    middleware = CadBodyLimitMiddleware(app, max_source_bytes=1)
    queue = iter([{'type': 'http.request', 'body': b'x' * (64 * 1024), 'more_body': True}, {'type': 'http.request', 'body': b'xx', 'more_body': False}])
    async def receive():
        return next(queue)
    async def send(message):
        sent.append(message)
    asyncio.run(middleware({'type':'http','path':'/api/cad/imports','method':'POST','headers':[]}, receive, send))
    assert len(delivered) == 1
    assert len(delivered[0]) == 64 * 1024


def test_fastapi_chunked_multipart_limit_returns_413_not_400():
    app = FastAPI()
    app.add_middleware(CadBodyLimitMiddleware, max_source_bytes=1)
    @app.post('/api/cad/imports')
    async def upload(request: Request):
        await request.form()
        return {'unexpected': True}
    boundary = 'cad-boundary'
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.step"\r\n\r\n'.encode() + b'x' * (64 * 1024 + 10) + f'\r\n--{boundary}--\r\n'.encode())
    def stream():
        yield body[:4096]
        yield body[4096:]
    response = TestClient(app).post('/api/cad/imports', content=stream(), headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
    assert response.status_code == 413, response.text


def test_small_mutations_and_unrelated_routes_preserved():
    app = FastAPI()
    app.add_middleware(CadBodyLimitMiddleware)
    @app.post('/api/cad/demo/section')
    async def section(request: Request):
        return await request.json()
    @app.post('/other')
    async def other():
        return {'ok': True}
    client = TestClient(app)
    assert client.post('/api/cad/demo/section', json={'normal':[1,0,0],'offset_mm':0}).status_code == 200
    assert client.post('/api/cad/demo/section', content=b'x' * (256 * 1024 + 1)).status_code == 413
    assert client.post('/other', content=b'x' * (256 * 1024 + 1)).status_code == 200
