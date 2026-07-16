from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .lifecycle import DeploymentState, DrainingError


class InFlightMiddleware:
    """追踪完整 ASGI response lifetime，包括 streaming body。"""

    def __init__(
        self,
        app: ASGIApp,
        state: DeploymentState,
        release: str,
        ignored_prefix: str = "/health/",
    ) -> None:
        self.app = app
        self.state = state
        self.release = release
        self.ignored_prefix = ignored_prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"].startswith(self.ignored_prefix):
            await self.app(scope, receive, send)
            return

        try:
            await self.state.begin_request()
        except DrainingError:
            response = JSONResponse(
                {"detail": "instance is draining"},
                status_code=503,
                headers={"Retry-After": "1"},
            )
            await response(scope, receive, send)
            return

        async def send_with_release_header(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-app-release", self.release.encode("ascii")))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_release_header)
        finally:
            await self.state.finish_request()
