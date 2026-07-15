"""Pure business logic kept separate from command-line input and output."""


def build_greeting(name: str, topic: str = "Python 后端") -> str:
    """Build a greeting after validating and normalizing user input."""
    normalized_name = name.strip()
    normalized_topic = topic.strip()

    if not normalized_name:
        raise ValueError("name must not be blank")
    if not normalized_topic:
        raise ValueError("topic must not be blank")

    return f"你好，{normalized_name}！欢迎开始学习 {normalized_topic}。"
