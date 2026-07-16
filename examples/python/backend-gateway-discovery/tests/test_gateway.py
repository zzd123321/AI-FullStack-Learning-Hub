import pytest

from gateway_learning.gateway import (
    ConfigManager,
    Endpoint,
    Gateway,
    GatewayConfig,
    IncomingRequest,
    InvalidConfiguration,
    NoReadyEndpoint,
    Route,
    ServiceRegistry,
    TokenVerifier,
    Unauthorized,
)


def build_gateway():
    config = GatewayConfig(
        version=1,
        routes=(
            Route("api", "api.example.test", "/api/", "general"),
            Route("orders", "api.example.test", "/api/orders/", "orders"),
        ),
        trusted_proxy_cidrs=("10.0.0.0/8",),
    )
    manager = ConfigManager(config)
    registry = ServiceRegistry()
    registry.register("general", Endpoint("g-1", "http://10.1.0.10:8080", True))
    registry.register("orders", Endpoint("o-1", "http://10.1.0.20:8080", True))
    verifier = TokenVerifier({"alice-token": ("u-100", "tenant-a")})
    return Gateway(manager, registry, verifier), manager, registry


def test_most_specific_route_wins() -> None:
    gateway, _, _ = build_gateway()
    forwarded = gateway.forward(
        IncomingRequest(
            "api.example.test",
            "/api/orders/o-100",
            "203.0.113.10",
            {"Authorization": "Bearer alice-token"},
        )
    )
    assert forwarded.route_id == "orders"
    assert forwarded.service == "orders"


def test_client_cannot_spoof_gateway_identity_headers() -> None:
    gateway, _, _ = build_gateway()
    forwarded = gateway.forward(
        IncomingRequest(
            "api.example.test",
            "/api/orders/o-100",
            "203.0.113.10",
            {
                "Authorization": "Bearer alice-token",
                "X-User-Id": "admin",
                "X-Tenant-Id": "other-tenant",
            },
        )
    )
    assert forwarded.headers["X-User-Id"] == "u-100"
    assert forwarded.headers["X-Tenant-Id"] == "tenant-a"


def test_untrusted_peer_cannot_forge_x_forwarded_for() -> None:
    gateway, _, _ = build_gateway()
    forwarded = gateway.forward(
        IncomingRequest(
            "api.example.test",
            "/api/orders/o-100",
            "203.0.113.10",
            {
                "Authorization": "Bearer alice-token",
                "X-Forwarded-For": "192.0.2.99",
            },
        )
    )
    assert forwarded.client_ip == "203.0.113.10"


def test_trusted_proxy_chain_reveals_first_untrusted_client() -> None:
    gateway, _, _ = build_gateway()
    forwarded = gateway.forward(
        IncomingRequest(
            "api.example.test",
            "/api/orders/o-100",
            "10.0.0.5",
            {
                "Authorization": "Bearer alice-token",
                "X-Forwarded-For": "198.51.100.7, 10.0.0.4",
            },
        )
    )
    assert forwarded.client_ip == "198.51.100.7"


def test_readiness_removes_endpoint_from_selection() -> None:
    gateway, _, registry = build_gateway()
    registry.register("orders", Endpoint("o-2", "http://10.1.0.21:8080", True))
    registry.set_ready("orders", "o-1", False)
    forwarded = gateway.forward(
        IncomingRequest(
            "api.example.test",
            "/api/orders/o-100",
            "203.0.113.10",
            {"Authorization": "Bearer alice-token"},
        )
    )
    assert forwarded.endpoint == "http://10.1.0.21:8080"


def test_no_ready_endpoint_fails_fast() -> None:
    gateway, _, registry = build_gateway()
    registry.set_ready("orders", "o-1", False)
    with pytest.raises(NoReadyEndpoint):
        gateway.forward(
            IncomingRequest(
                "api.example.test",
                "/api/orders/o-100",
                "203.0.113.10",
                {"Authorization": "Bearer alice-token"},
            )
        )


def test_authentication_failure_precedes_backend_availability() -> None:
    gateway, _, registry = build_gateway()
    registry.set_ready("orders", "o-1", False)

    with pytest.raises(Unauthorized):
        gateway.forward(
            IncomingRequest(
                "api.example.test",
                "/api/orders/o-100",
                "203.0.113.10",
            )
        )


def test_invalid_config_update_keeps_last_known_good_snapshot() -> None:
    gateway, manager, _ = build_gateway()
    bad = GatewayConfig(
        version=2,
        routes=(Route("bad", "api.example.test", "api", "orders"),),
    )
    with pytest.raises(InvalidConfiguration):
        manager.apply(bad)

    forwarded = gateway.forward(
        IncomingRequest(
            "api.example.test",
            "/api/orders/o-100",
            "203.0.113.10",
            {"Authorization": "Bearer alice-token"},
        )
    )
    assert forwarded.route_id == "orders"
    assert manager.snapshot().version == 1
