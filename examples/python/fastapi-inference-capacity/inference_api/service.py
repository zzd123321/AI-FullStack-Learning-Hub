import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass

from .model import FakeLanguageModel, GeneratedToken


class CapacityExceededError(RuntimeError):
    """请求无法在 admission deadline 前取得容量。"""


class InferenceTimeoutError(RuntimeError):
    """请求取得容量后，推理超过 execution deadline。"""


@dataclass(slots=True)
class CapacityLease:
    service: "InferenceService"
    released: bool = False

    async def __aenter__(self) -> "CapacityLease":
        return self

    async def __aexit__(self, *_: object) -> None:
        self.release()

    def release(self) -> None:
        if not self.released:
            self.released = True
            self.service._active -= 1
            self.service._semaphore.release()


class InferenceService:
    def __init__(self, model: FakeLanguageModel, max_concurrency: int = 2) -> None:
        if max_concurrency < 1:
            raise ValueError("max_concurrency must be positive")
        self.model = model
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._active = 0
        self.max_concurrency = max_concurrency

    @property
    def active(self) -> int:
        return self._active

    async def start(self) -> None:
        await self.model.load()

    async def stop(self) -> None:
        await self.model.unload()

    async def reserve(self, queue_timeout: float) -> CapacityLease:
        try:
            async with asyncio.timeout(queue_timeout):
                await self._semaphore.acquire()
        except TimeoutError as error:
            raise CapacityExceededError("inference capacity is busy") from error
        self._active += 1
        return CapacityLease(self)

    async def complete(
        self,
        prompt: str,
        max_tokens: int,
        token_delay: float,
        queue_timeout: float,
        inference_timeout: float,
    ) -> str:
        lease = await self.reserve(queue_timeout)
        try:
            async with lease, asyncio.timeout(inference_timeout):
                tokens = [
                    token.text
                    async for token in self.model.generate(
                        prompt, max_tokens, token_delay
                    )
                ]
                return " ".join(tokens)
        except TimeoutError as error:
            raise InferenceTimeoutError("inference deadline exceeded") from error

    async def stream(
        self,
        lease: CapacityLease,
        prompt: str,
        max_tokens: int,
        token_delay: float,
        inference_timeout: float,
    ) -> AsyncIterator[GeneratedToken]:
        try:
            async with lease, asyncio.timeout(inference_timeout):
                async for token in self.model.generate(
                    prompt, max_tokens, token_delay
                ):
                    yield token
        except TimeoutError as error:
            raise InferenceTimeoutError("inference deadline exceeded") from error
