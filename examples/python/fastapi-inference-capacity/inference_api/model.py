import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class GeneratedToken:
    index: int
    text: str


class FakeLanguageModel:
    """用可控延迟模拟模型，避免课程依赖真实权重和 GPU。"""

    def __init__(self) -> None:
        self.loaded = False
        self.active_generations = 0
        self.maximum_active_generations = 0
        self.generation_started = asyncio.Event()

    async def load(self) -> None:
        await asyncio.sleep(0)
        self.loaded = True

    async def unload(self) -> None:
        await asyncio.sleep(0)
        self.loaded = False

    async def generate(
        self, prompt: str, max_tokens: int, token_delay: float
    ) -> AsyncIterator[GeneratedToken]:
        if not self.loaded:
            raise RuntimeError("model is not loaded")

        source = ["AI", "回答：", *prompt.split()]
        tokens = source[:max_tokens]
        self.active_generations += 1
        self.maximum_active_generations = max(
            self.maximum_active_generations, self.active_generations
        )
        self.generation_started.set()
        try:
            for index, token in enumerate(tokens):
                await asyncio.sleep(token_delay)  # cancellation checkpoint
                yield GeneratedToken(index=index, text=token)
        finally:
            self.active_generations -= 1
