import asyncio
from dataclasses import dataclass, field


class DrainingError(RuntimeError):
    """实例正在退出，不能再接受新的业务请求。"""


@dataclass(slots=True)
class DeploymentState:
    ready: bool = False
    draining: bool = False
    in_flight: int = 0
    last_drain_completed: bool | None = None
    _condition: asyncio.Condition = field(default_factory=asyncio.Condition)

    async def mark_started(self) -> None:
        async with self._condition:
            self.ready = True
            self.draining = False

    async def begin_request(self) -> None:
        async with self._condition:
            # drain 开始后拒绝进入新的业务工作，已有请求仍由 finish_request 结算。
            if self.draining:
                raise DrainingError("instance is draining")
            self.in_flight += 1

    async def finish_request(self) -> None:
        async with self._condition:
            self.in_flight -= 1
            if self.in_flight < 0:
                raise RuntimeError("in-flight counter became negative")
            if self.in_flight == 0:
                # 唤醒正在优雅关闭阶段等待“所有在途请求完成”的协程。
                self._condition.notify_all()

    async def begin_drain(self) -> None:
        async with self._condition:
            # 先变为 not ready，让代理摘除流量，再等待已有请求完成。
            self.ready = False
            self.draining = True

    async def wait_until_idle(self, timeout: float) -> bool:
        try:
            async with asyncio.timeout(timeout):
                async with self._condition:
                    # wait_for 会在每次唤醒后重新检查条件，处理虚假或无关通知。
                    await self._condition.wait_for(lambda: self.in_flight == 0)
            return True
        except TimeoutError:
            return False
