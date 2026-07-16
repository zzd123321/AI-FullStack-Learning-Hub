from __future__ import annotations

from dataclasses import dataclass, field, replace
from ipaddress import ip_address, ip_network
from threading import Lock


class GatewayError(Exception):
    pass


class RouteNotFound(GatewayError):
    pass


class Unauthorized(GatewayError):
    pass


class NoReadyEndpoint(GatewayError):
    pass


class InvalidConfiguration(GatewayError):
    pass


@dataclass(frozen=True)
class Route:
    route_id: str
    host: str
    path_prefix: str
    service: str
    auth_required: bool = True
    timeout_ms: int = 1000


@dataclass(frozen=True)
class GatewayConfig:
    version: int
    routes: tuple[Route, ...]
    trusted_proxy_cidrs: tuple[str, ...] = ()


@dataclass
class Endpoint:
    endpoint_id: str
    address: str
    ready: bool = False
    zone: str | None = None


class ConfigManager:
    """Publishes only complete validated snapshots; invalid updates are rejected."""

    def __init__(self, initial: GatewayConfig) -> None:
        self._lock = Lock()
        self._current = self._validate(initial)

    @staticmethod
    def _validate(config: GatewayConfig) -> GatewayConfig:
        if config.version < 1:
            raise InvalidConfiguration("version must be positive")
        identities: set[tuple[str, str]] = set()
        for route in config.routes:
            identity = (route.host.lower(), route.path_prefix)
            if identity in identities:
                raise InvalidConfiguration("duplicate host and path prefix")
            identities.add(identity)
            if not route.path_prefix.startswith("/"):
                raise InvalidConfiguration("path prefix must start with slash")
            if route.timeout_ms <= 0:
                raise InvalidConfiguration("route timeout must be positive")
        for cidr in config.trusted_proxy_cidrs:
            ip_network(cidr)
        return config

    def apply(self, candidate: GatewayConfig) -> None:
        validated = self._validate(candidate)
        with self._lock:
            if validated.version <= self._current.version:
                raise InvalidConfiguration("configuration version must increase")
            self._current = validated

    def snapshot(self) -> GatewayConfig:
        with self._lock:
            return self._current


class ServiceRegistry:
    def __init__(self) -> None:
        self._services: dict[str, list[Endpoint]] = {}
        self._next: dict[str, int] = {}
        self._lock = Lock()

    def register(self, service: str, endpoint: Endpoint) -> None:
        with self._lock:
            self._services.setdefault(service, []).append(endpoint)
            self._next.setdefault(service, 0)

    def set_ready(self, service: str, endpoint_id: str, ready: bool) -> None:
        with self._lock:
            for endpoint in self._services.get(service, []):
                if endpoint.endpoint_id == endpoint_id:
                    endpoint.ready = ready
                    return
            raise KeyError(endpoint_id)

    def choose(self, service: str) -> Endpoint:
        with self._lock:
            ready = [item for item in self._services.get(service, []) if item.ready]
            if not ready:
                raise NoReadyEndpoint(f"no ready endpoint for {service}")
            index = self._next[service] % len(ready)
            self._next[service] += 1
            return replace(ready[index])


@dataclass(frozen=True)
class IncomingRequest:
    host: str
    path: str
    peer_ip: str
    headers: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class UpstreamRequest:
    route_id: str
    service: str
    endpoint: str
    path: str
    client_ip: str
    timeout_ms: int
    headers: dict[str, str]


class TokenVerifier:
    def __init__(self, tokens: dict[str, tuple[str, str]]) -> None:
        self._tokens = tokens

    def verify(self, authorization: str | None) -> tuple[str, str]:
        if authorization is None or not authorization.startswith("Bearer "):
            raise Unauthorized("a bearer token is required")
        token = authorization.removeprefix("Bearer ")
        if token not in self._tokens:
            raise Unauthorized("the bearer token is invalid")
        return self._tokens[token]


class Gateway:
    IDENTITY_HEADERS = {"x-user-id", "x-tenant-id"}

    def __init__(
        self,
        configs: ConfigManager,
        registry: ServiceRegistry,
        verifier: TokenVerifier,
    ) -> None:
        self._configs = configs
        self._registry = registry
        self._verifier = verifier

    @staticmethod
    def _matches(route: Route, request: IncomingRequest) -> bool:
        return route.host.lower() == request.host.lower() and request.path.startswith(
            route.path_prefix
        )

    def _select_route(self, request: IncomingRequest, config: GatewayConfig) -> Route:
        candidates = [route for route in config.routes if self._matches(route, request)]
        if not candidates:
            raise RouteNotFound(f"no route for {request.host}{request.path}")
        return max(candidates, key=lambda route: len(route.path_prefix))

    @staticmethod
    def _is_trusted(address: str, cidrs: tuple[str, ...]) -> bool:
        candidate = ip_address(address)
        return any(candidate in ip_network(cidr) for cidr in cidrs)

    @staticmethod
    def _header(headers: dict[str, str], name: str) -> str | None:
        return next(
            (value for key, value in headers.items() if key.lower() == name.lower()),
            None,
        )

    def _client_ip(self, request: IncomingRequest, config: GatewayConfig) -> str:
        if not self._is_trusted(request.peer_ip, config.trusted_proxy_cidrs):
            return request.peer_ip
        forwarded = self._header(request.headers, "X-Forwarded-For") or ""
        chain = [part.strip() for part in forwarded.split(",") if part.strip()]
        chain.append(request.peer_ip)
        for address in reversed(chain):
            if not self._is_trusted(address, config.trusted_proxy_cidrs):
                return str(ip_address(address))
        return request.peer_ip

    def forward(self, request: IncomingRequest) -> UpstreamRequest:
        config = self._configs.snapshot()
        route = self._select_route(request, config)
        authorization = self._header(request.headers, "Authorization")
        headers = {
            key: value
            for key, value in request.headers.items()
            if key.lower()
            not in self.IDENTITY_HEADERS | {"x-forwarded-for", "authorization"}
        }
        if route.auth_required:
            user_id, tenant_id = self._verifier.verify(authorization)
            headers["X-User-Id"] = user_id
            headers["X-Tenant-Id"] = tenant_id
        endpoint = self._registry.choose(route.service)
        client_ip = self._client_ip(request, config)
        headers["X-Forwarded-For"] = client_ip
        return UpstreamRequest(
            route.route_id,
            route.service,
            endpoint.address,
            request.path,
            client_ip,
            route.timeout_ms,
            headers,
        )
