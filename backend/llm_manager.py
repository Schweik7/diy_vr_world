"""
LLM管理模块 - 支持多LLM配置
"""
import os
import yaml
from typing import Dict, List, Optional, Generator
from dataclasses import dataclass
from anthropic import Anthropic, DefaultHttpxClient
from openai import OpenAI
import httpx


@dataclass
class LLMConfig:
    """LLM配置数据类"""
    id: str
    name: str
    provider: str
    api_key: str
    base_url: Optional[str]
    proxy: Optional[str]
    default_model: str
    models: List[str]
    enabled: bool


# 防止模型自问自答、扮演用户继续对话的停止序列
STOP_SEQUENCES = [
    "\n用户:", "\n用户：", "用户:", "用户：",
    "\nUser:", "User:",
    "\nHuman:", "Human:",
    "\n访客:", "访客:",
]


class LLMManager:
    """LLM客户端管理器"""

    def __init__(self, config_path: str = "llm_config.yaml"):
        self.config_path = config_path
        self.llm_configs: Dict[str, LLMConfig] = {}
        self.clients: Dict[str, object] = {}
        self.default_llm_id: Optional[str] = None
        self._load_config()

    def _load_config(self):
        """加载yaml配置文件"""
        if not os.path.exists(self.config_path):
            print(f"警告: LLM配置文件 {self.config_path} 不存在")
            return

        with open(self.config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)

        llms = config.get('llms', [])
        for i, llm_data in enumerate(llms):
            if not llm_data.get('enabled', True):
                continue

            # 处理API密钥
            api_key = llm_data.get('api_key', '')
            if llm_data.get('api_key_env'):
                api_key = os.getenv(llm_data['api_key_env'], '')

            if not api_key:
                print(f"警告: LLM {llm_data.get('id')} 缺少API密钥，跳过")
                continue

            llm_config = LLMConfig(
                id=llm_data['id'],
                name=llm_data['name'],
                provider=llm_data['provider'],
                api_key=api_key,
                base_url=llm_data.get('base_url'),
                proxy=llm_data.get('proxy'),
                default_model=llm_data.get('default_model', ''),
                models=llm_data.get('models', []),
                enabled=True
            )

            self.llm_configs[llm_config.id] = llm_config
            self._init_client(llm_config)

            # 第一个有效的LLM为默认
            if i == 0 or self.default_llm_id is None:
                self.default_llm_id = llm_config.id

        print(f"已加载 {len(self.llm_configs)} 个LLM配置，默认: {self.default_llm_id}")

    def _init_client(self, config: LLMConfig):
        """初始化LLM客户端"""
        try:
            if config.provider == 'anthropic':
                if config.proxy:
                    try:
                        client = Anthropic(
                            http_client=DefaultHttpxClient(
                                proxy=config.proxy,
                                transport=httpx.HTTPTransport(local_address="0.0.0.0"),
                            ),
                            api_key=config.api_key,
                        )
                    except TypeError:
                        client = Anthropic(api_key=config.api_key)
                else:
                    client = Anthropic(api_key=config.api_key)
                self.clients[config.id] = client
                print(f"已初始化Anthropic客户端: {config.name}")

            elif config.provider == 'openai_compatible':
                client = OpenAI(
                    api_key=config.api_key,
                    base_url=config.base_url
                )
                self.clients[config.id] = client
                print(f"已初始化OpenAI兼容客户端: {config.name}")

        except Exception as e:
            print(f"初始化LLM客户端失败 {config.id}: {e}")

    def get_available_llms(self) -> List[Dict]:
        """获取可用的LLM列表"""
        result = []
        for llm_id, config in self.llm_configs.items():
            if llm_id in self.clients:
                result.append({
                    'id': config.id,
                    'name': config.name,
                    'provider': config.provider,
                    'default_model': config.default_model,
                    'models': config.models,
                    'is_default': llm_id == self.default_llm_id
                })
        return result

    def get_client(self, llm_id: Optional[str] = None):
        """获取LLM客户端"""
        if llm_id is None:
            llm_id = self.default_llm_id
        return self.clients.get(llm_id)

    def get_config(self, llm_id: Optional[str] = None) -> Optional[LLMConfig]:
        """获取LLM配置"""
        if llm_id is None:
            llm_id = self.default_llm_id
        return self.llm_configs.get(llm_id)

    def chat_stream(
        self,
        messages: List[Dict],
        system_prompt: str,
        llm_id: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 2048
    ) -> Generator[str, None, None]:
        """
        统一的流式聊天接口
        返回文本流生成器
        """
        if llm_id is None:
            llm_id = self.default_llm_id

        client = self.clients.get(llm_id)
        config = self.llm_configs.get(llm_id)

        if not client or not config:
            yield "错误: LLM客户端未初始化"
            return

        if model is None:
            model = config.default_model

        try:
            if config.provider == 'anthropic':
                yield from self._anthropic_stream(client, messages, system_prompt, model, max_tokens)
            elif config.provider == 'openai_compatible':
                yield from self._openai_stream(client, messages, system_prompt, model, max_tokens)
        except Exception as e:
            yield f"错误: {str(e)}"

    def _anthropic_stream(
        self,
        client: Anthropic,
        messages: List[Dict],
        system_prompt: str,
        model: str,
        max_tokens: int
    ) -> Generator[str, None, None]:
        """Anthropic流式聊天"""
        with client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=messages,
            stop_sequences=STOP_SEQUENCES,
        ) as stream:
            for text in stream.text_stream:
                yield text

    def _openai_stream(
        self,
        client: OpenAI,
        messages: List[Dict],
        system_prompt: str,
        model: str,
        max_tokens: int
    ) -> Generator[str, None, None]:
        """OpenAI兼容流式聊天"""
        # 构建消息列表，添加system消息
        full_messages = [{"role": "system", "content": system_prompt}]
        full_messages.extend(messages)

        response = client.chat.completions.create(
            model=model,
            messages=full_messages,
            max_tokens=max_tokens,
            stream=True,
            stop=STOP_SEQUENCES,
        )

        for chunk in response:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content


# 全局LLM管理器实例
llm_manager = LLMManager()
