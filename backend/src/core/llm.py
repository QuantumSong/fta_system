"""
LLM客户端 - 支持DeepSeek API
"""
from typing import Dict, Any, Optional, List
import httpx
import json
import re

from config import settings


class LLMClient:
    """大语言模型客户端 - 支持DeepSeek"""

    def __init__(self):
        self.api_key = settings.DEEPSEEK_API_KEY
        self.api_url = settings.DEEPSEEK_API_URL
        self.model = settings.DEEPSEEK_MODEL
        self.temperature = settings.DEEPSEEK_TEMPERATURE
        self.max_tokens = settings.DEEPSEEK_MAX_TOKENS

    async def generate(
        self,
        prompt: str,
        system_prompt: str = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        """调用DeepSeek API生成文本"""
        if not self.api_key:
            raise ValueError("DeepSeek API密钥未配置! 请在.env文件中设置DEEPSEEK_API_KEY")

        temp = temperature if temperature is not None else self.temperature
        max_tok = max_tokens if max_tokens is not None else self.max_tokens

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temp,
            "max_tokens": max_tok,
            "stream": False,
        }

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                url = f"{self.api_url.rstrip('/')}/chat/completions"
                response = await client.post(
                    url,
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()

                if "choices" in data and len(data["choices"]) > 0:
                    content = data["choices"][0]["message"]["content"]
                    return content.strip()
                else:
                    raise ValueError(f"API响应格式错误: {data}")

        except httpx.HTTPStatusError as e:
            error_msg = f"DeepSeek API请求失败: {e.response.status_code}"
            try:
                error_data = e.response.json()
                error_msg += f" - {error_data.get('error', {}).get('message', '')}"
            except Exception:
                pass
            raise ValueError(error_msg)
        except httpx.TimeoutException:
            raise ValueError("DeepSeek API请求超时，请稍后重试")
        except Exception as e:
            raise ValueError(f"DeepSeek API调用失败: {str(e)}")

    async def generate_json(
        self,
        prompt: str,
        system_prompt: str = None,
        temperature: Optional[float] = None,
    ) -> Dict[str, Any]:
        """生成JSON格式的响应"""
        json_prompt = prompt + "\n\n请确保输出是有效的JSON格式，不要包含任何其他文本。"

        if system_prompt:
            system_prompt += "\n请始终输出有效的JSON格式。"
        else:
            system_prompt = "你是一个专业的工业故障树分析专家。请始终输出有效的JSON格式。"

        response = await self.generate(
            prompt=json_prompt,
            system_prompt=system_prompt,
            temperature=temperature,
        )

        # 提取JSON
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            # 尝试从代码块中提取
            json_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", response)
            if json_match:
                return json.loads(json_match.group(1))

            # 匹配单独的 {...}
            json_match = re.search(r"(\{[\s\S]*\})", response)
            if json_match:
                return json.loads(json_match.group(1))

            raise ValueError(f"无法从响应中提取JSON: {response[:200]}")


# 全局LLM客户端实例
llm_client = LLMClient()
